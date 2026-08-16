#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ALLOWED_VERSION_TYPES = new Set(['patch', 'minor', 'major']);
const LOCKFILE_NAMES = ['package-lock.json', 'npm-shrinkwrap.json'];

function usageError() {
  return new Error('Usage: bumpify [version] <patch|minor|major>');
}

function parseVersionType(args) {
  if (args.length === 1 && ALLOWED_VERSION_TYPES.has(args[0])) {
    return args[0];
  }

  if (args.length === 2 && args[0] === 'version' && ALLOWED_VERSION_TYPES.has(args[1])) {
    return args[1];
  }

  throw usageError();
}

function run(command, args, cwd, options = {}) {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
}

function gitOutput(args, cwd) {
  return run('git', args, cwd, { capture: true }).trim();
}

function fileSnapshot(filePath) {
  return fs.existsSync(filePath)
    ? { exists: true, content: fs.readFileSync(filePath), mode: fs.statSync(filePath).mode }
    : { exists: false };
}

function restoreFile(filePath, snapshot) {
  if (snapshot.exists) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, snapshot.content);
    fs.chmodSync(filePath, snapshot.mode);
  } else if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

function isTracked(relativePath, cwd) {
  try {
    run('git', ['ls-files', '--error-unmatch', '--', relativePath], cwd, { capture: true });
    return true;
  } catch {
    return false;
  }
}

function tagExists(tag, cwd) {
  try {
    run('git', ['rev-parse', '--verify', '--quiet', `refs/tags/${tag}`], cwd, { capture: true });
    return true;
  } catch {
    return false;
  }
}

function assertBranchIsNotBehindUpstream(cwd, branch) {
  let upstream;
  try {
    upstream = gitOutput(
      ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'],
      cwd,
    );
  } catch {
    return;
  }

  const counts = gitOutput(['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'], cwd);
  const [, behindText] = counts.split(/\s+/);
  const behind = Number(behindText);
  if (behind > 0) {
    throw new Error(
      `Branch ${branch} is behind or diverged from ${upstream}. Synchronize it before bumping the version.`,
    );
  }
}

function rollback({
  cwd,
  initialHead,
  files,
  stagedFiles,
  commitCreated,
  tagCreated,
  tag,
  versionDirectory,
  versionDirectoryExisted,
}) {
  const rollbackErrors = [];

  try {
    if (tagCreated && tag && tagExists(tag, cwd)) {
      run('git', ['tag', '--delete', tag], cwd, { capture: true });
    }

    if (commitCreated) {
      run('git', ['reset', '--soft', initialHead], cwd, { capture: true });
    }

    if (stagedFiles.length > 0) {
      run('git', ['reset', '--quiet', '--', ...stagedFiles], cwd, { capture: true });
    }
  } catch (error) {
    rollbackErrors.push(error.message);
  }

  for (const [filePath, snapshot] of files) {
    try {
      restoreFile(filePath, snapshot);
    } catch (error) {
      rollbackErrors.push(error.message);
    }
  }

  if (!versionDirectoryExisted && fs.existsSync(versionDirectory)) {
    try {
      fs.rmdirSync(versionDirectory);
    } catch (error) {
      rollbackErrors.push(error.message);
    }
  }

  return rollbackErrors;
}

function main(args = process.argv.slice(2), cwd = process.cwd()) {
  const versionType = parseVersionType(args);
  const packageJsonPath = path.join(cwd, 'package.json');
  const versionDirectory = path.join(cwd, 'public');
  const versionJsonPath = path.join(versionDirectory, 'version.json');
  const lockfilePaths = LOCKFILE_NAMES.map((name) => path.join(cwd, name));

  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`package.json was not found in ${cwd}`);
  }

  const status = gitOutput(['status', '--porcelain'], cwd);
  if (status) {
    throw new Error('Git working directory is not clean. Commit or stash your changes first.');
  }

  let branch;
  try {
    branch = gitOutput(['symbolic-ref', '--quiet', '--short', 'HEAD'], cwd);
  } catch {
    throw new Error('Bumpify must run on a branch, not in detached HEAD state.');
  }
  assertBranchIsNotBehindUpstream(cwd, branch);

  const initialHead = gitOutput(['rev-parse', '--verify', 'HEAD'], cwd);
  const versionDirectoryExisted = fs.existsSync(versionDirectory);
  const files = [packageJsonPath, versionJsonPath, ...lockfilePaths].map((filePath) => [
    filePath,
    fileSnapshot(filePath),
  ]);
  const trackedLockfiles = lockfilePaths
    .map((filePath) => path.relative(cwd, filePath))
    .filter((relativePath) => isTracked(relativePath, cwd));
  const stagedFiles = ['package.json', 'public/version.json', ...trackedLockfiles];
  let commitCreated = false;
  let tagCreated = false;
  let tag;

  try {
    run('npm', ['version', versionType, '--no-git-tag-version', '--ignore-scripts'], cwd);

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    if (typeof packageJson.version !== 'string' || packageJson.version.length === 0) {
      throw new Error('npm did not produce a valid version in package.json.');
    }

    tag = `v${packageJson.version}`;
    if (tagExists(tag, cwd)) {
      throw new Error(`Git tag ${tag} already exists.`);
    }

    fs.mkdirSync(path.dirname(versionJsonPath), { recursive: true });
    fs.writeFileSync(versionJsonPath, `${JSON.stringify({ version: packageJson.version }, null, 2)}\n`);

    run('git', ['add', '--', 'package.json', ...trackedLockfiles], cwd);
    run('git', ['add', '--force', '--', 'public/version.json'], cwd);
    run('git', ['commit', '-m', `Bump version to ${packageJson.version}`], cwd);
    commitCreated = true;
    run('git', ['tag', tag], cwd);
    tagCreated = true;

    const commit = gitOutput(['rev-parse', '--short', 'HEAD'], cwd);
    console.log(`🚀 Version ${packageJson.version} committed on ${branch} (${commit}) and tagged ${tag}.`);
  } catch (error) {
    const rollbackErrors = rollback({
      cwd,
      initialHead,
      files,
      stagedFiles,
      commitCreated,
      tagCreated,
      tag,
      versionDirectory,
      versionDirectoryExisted,
    });

    if (rollbackErrors.length > 0) {
      throw new Error(`${error.message}\nRollback also failed: ${rollbackErrors.join('; ')}`);
    }

    throw error;
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`❌ ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { main, parseVersionType };
