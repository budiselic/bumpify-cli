# 🚀 Bumpify CLI

[![npm version](https://img.shields.io/npm/v/bumpify-cli.svg)](https://www.npmjs.com/package/bumpify-cli)
[![License](https://img.shields.io/npm/l/bumpify-cli.svg)](https://github.com/budiselic/bumpify-cli/blob/main/LICENSE)

`bumpify-cli` bumps an npm project version, keeps `public/version.json` in sync, and creates the matching Git commit and tag.

## Installation

```sh
npm install --global bumpify-cli
```

Node.js 18 or newer is required.

## Usage

Both command forms are supported:

```sh
bumpify patch
bumpify minor
bumpify major
```

```sh
bumpify version patch
bumpify version minor
bumpify version major
```

For example, `bumpify patch` changes `1.0.0` to `1.0.1`.

## What it does

Before changing anything, Bumpify verifies that:

- the current directory contains `package.json`;
- the Git working tree is clean;
- Git is currently on a branch, not in detached HEAD state;
- the branch is not behind or diverged from its locally known upstream.

It then:

1. updates the version in `package.json`;
2. updates a tracked `package-lock.json` or `npm-shrinkwrap.json`, when present;
3. writes the same version to `public/version.json`;
4. commits the changed files with `Bump version to X.X.X`;
5. creates the lightweight Git tag `vX.X.X` on that commit.

The `preversion`, `version`, and `postversion` npm lifecycle scripts are intentionally skipped so they cannot leave unrelated files outside the release commit.

If any release step fails, Bumpify exits with a non-zero status and restores the version files and Git state it changed.

## Git tags and graph colors

A tag such as `v2.4.1` is a permanent name for one commit; it is not a branch. Git clients assign colors to graph paths, so the tag normally remains on the same blue line as the branch.

If a tagged commit is later rebased, cherry-picked, or replaced by a force-push, Git creates a new commit hash while the tag still points to the original hash. The old tagged history can then appear as a pink side line. To keep the tag on the main line, do not rebase or otherwise rewrite release commits after creating their tags.

Bumpify prevents releases from detached HEAD state and stops when the local Git data says the branch is behind its upstream. It cannot detect remote commits that have not been fetched or prevent a later history rewrite performed by another command or CI workflow. Fetch and synchronize the branch before creating a release.

## Version file

The generated file has this format:

```json
{
  "version": "1.0.1"
}
```

A frontend can fetch `/version.json` to display the deployed version or detect that a newer deployment is available.

## Important notes

- Bumpify creates a local commit and tag; it does not push them.
- Run `git push && git push --tags` when you are ready to publish the release history.
- An existing target tag, a dirty working tree, an invalid command, or a failed Git hook stops the release without leaving a partial bump.

## Development

```sh
npm test
npm pack --dry-run
```

## License

MIT © [Antonio Budiselić](https://github.com/budiselic)
