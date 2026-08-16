const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const cliPath = path.resolve(__dirname, '..', 'index.js');

function run(command, args, cwd) {
  return execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function git(cwd, ...args) {
  return run('git', args, cwd);
}

function createFixture(t, { packageJson = true, lockfile = true } = {}) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'bumpify-test-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

  git(cwd, 'init', '--quiet', '--initial-branch=main');
  git(cwd, 'config', 'user.name', 'Bumpify Test');
  git(cwd, 'config', 'user.email', 'bumpify-test@example.invalid');

  if (packageJson) {
    fs.writeFileSync(
      path.join(cwd, 'package.json'),
      `${JSON.stringify({ name: 'fixture', version: '1.0.0' }, null, 2)}\n`,
    );

    if (lockfile) {
      run('npm', ['install', '--package-lock-only', '--ignore-scripts'], cwd);
    }
  }

  git(cwd, 'add', '.');
  git(cwd, 'commit', '--quiet', '--allow-empty', '-m', 'Initial commit');
  return cwd;
}

function bumpify(cwd, ...args) {
  return spawnSync(process.execPath, [cliPath, ...args], { cwd, encoding: 'utf8' });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

test('bumps manifests, commits every version file, and tags the branch commit', (t) => {
  const cwd = createFixture(t);
  const result = bumpify(cwd, 'patch');

  assert.equal(result.status, 0, result.stderr);
  assert.equal(readJson(path.join(cwd, 'package.json')).version, '1.0.1');
  assert.equal(readJson(path.join(cwd, 'package-lock.json')).version, '1.0.1');
  assert.deepEqual(readJson(path.join(cwd, 'public', 'version.json')), { version: '1.0.1' });
  assert.equal(git(cwd, 'status', '--porcelain'), '');
  assert.equal(git(cwd, 'tag', '--points-at', 'HEAD'), 'v1.0.1');
  assert.equal(git(cwd, 'rev-parse', 'v1.0.1'), git(cwd, 'rev-parse', 'HEAD'));
  assert.deepEqual(
    git(cwd, 'show', '--pretty=', '--name-only', 'HEAD').split('\n').sort(),
    ['package-lock.json', 'package.json', 'public/version.json'],
  );
  assert.match(result.stdout, /committed on main/);
});

test('supports the documented version subcommand', (t) => {
  const cwd = createFixture(t);
  const result = bumpify(cwd, 'version', 'minor');

  assert.equal(result.status, 0, result.stderr);
  assert.equal(readJson(path.join(cwd, 'package.json')).version, '1.1.0');
});

test('invalid commands fail without changing the repository', (t) => {
  const cwd = createFixture(t);
  const initialHead = git(cwd, 'rev-parse', 'HEAD');
  const result = bumpify(cwd, 'versoin', 'patch');

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage:/);
  assert.equal(readJson(path.join(cwd, 'package.json')).version, '1.0.0');
  assert.equal(git(cwd, 'rev-parse', 'HEAD'), initialHead);
  assert.equal(git(cwd, 'status', '--porcelain'), '');
});

test('missing package.json returns a non-zero exit status', (t) => {
  const cwd = createFixture(t, { packageJson: false, lockfile: false });
  const result = bumpify(cwd, 'patch');

  assert.equal(result.status, 1);
  assert.match(result.stderr, /package\.json was not found/);
});

test('an existing target tag is preserved and the bump is rolled back', (t) => {
  const cwd = createFixture(t);
  const initialHead = git(cwd, 'rev-parse', 'HEAD');
  git(cwd, 'tag', 'v1.0.1');
  const result = bumpify(cwd, 'patch');

  assert.equal(result.status, 1);
  assert.match(result.stderr, /tag v1\.0\.1 already exists/);
  assert.equal(readJson(path.join(cwd, 'package.json')).version, '1.0.0');
  assert.equal(git(cwd, 'rev-parse', 'HEAD'), initialHead);
  assert.equal(git(cwd, 'rev-parse', 'v1.0.1'), initialHead);
  assert.equal(git(cwd, 'status', '--porcelain'), '');
});

test('a failed commit hook rolls back files and exits with failure', (t) => {
  const cwd = createFixture(t);
  const initialHead = git(cwd, 'rev-parse', 'HEAD');
  const hookPath = path.join(cwd, '.git', 'hooks', 'pre-commit');
  fs.writeFileSync(hookPath, '#!/bin/sh\nexit 1\n');
  fs.chmodSync(hookPath, 0o755);
  const result = bumpify(cwd, 'patch');

  assert.equal(result.status, 1);
  assert.equal(readJson(path.join(cwd, 'package.json')).version, '1.0.0');
  assert.equal(readJson(path.join(cwd, 'package-lock.json')).version, '1.0.0');
  assert.equal(fs.existsSync(path.join(cwd, 'public', 'version.json')), false);
  assert.equal(fs.existsSync(path.join(cwd, 'public')), false);
  assert.equal(git(cwd, 'rev-parse', 'HEAD'), initialHead);
  assert.equal(git(cwd, 'status', '--porcelain'), '');
});

test('detached HEAD is rejected before files are changed', (t) => {
  const cwd = createFixture(t);
  git(cwd, 'checkout', '--quiet', '--detach');
  const result = bumpify(cwd, 'patch');

  assert.equal(result.status, 1);
  assert.match(result.stderr, /detached HEAD/);
  assert.equal(readJson(path.join(cwd, 'package.json')).version, '1.0.0');
  assert.equal(git(cwd, 'status', '--porcelain'), '');
});

test('a branch behind its upstream is rejected before the release', (t) => {
  const cwd = createFixture(t);
  git(cwd, 'branch', 'upstream');
  git(cwd, 'checkout', '--quiet', 'upstream');
  fs.writeFileSync(path.join(cwd, 'remote-change.txt'), 'new upstream commit\n');
  git(cwd, 'add', 'remote-change.txt');
  git(cwd, 'commit', '--quiet', '-m', 'Upstream change');
  git(cwd, 'checkout', '--quiet', 'main');
  git(cwd, 'branch', '--set-upstream-to=upstream', 'main');
  const result = bumpify(cwd, 'patch');

  assert.equal(result.status, 1);
  assert.match(result.stderr, /behind or diverged/);
  assert.equal(readJson(path.join(cwd, 'package.json')).version, '1.0.0');
  assert.equal(git(cwd, 'status', '--porcelain'), '');
});
