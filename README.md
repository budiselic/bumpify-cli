# Bumpify CLI

[![npm version](https://img.shields.io/npm/v/bumpify-cli.svg)](https://www.npmjs.com/package/bumpify-cli)
[![Node.js](https://img.shields.io/node/v/bumpify-cli.svg)](https://www.npmjs.com/package/bumpify-cli)
[![License](https://img.shields.io/npm/l/bumpify-cli.svg)](https://github.com/budiselic/bumpify-cli/blob/main/LICENSE)

Safely bump an npm project version, keep `public/version.json` in sync, and create the matching Git commit and tag.

## Why Bumpify?

`npm version` updates your package version, but frontend applications often need that version at runtime too. Bumpify adds a small `public/version.json` file that can be served with the application and used to:

- display the deployed version;
- detect when a new deployment is available;
- include the application version in diagnostics or support information.

## Install

```sh
npm install --global bumpify-cli
```

Requirements:

- Node.js 18 or newer;
- npm;
- Git with at least one commit.

## Usage

Run Bumpify from the root of your project:

```sh
bumpify patch
bumpify minor
bumpify major
```

The longer `npm version`-style form is also supported:

```sh
bumpify version patch
bumpify version minor
bumpify version major
```

| Command | Example result |
| --- | --- |
| `bumpify patch` | `1.0.0` → `1.0.1` |
| `bumpify minor` | `1.0.0` → `1.1.0` |
| `bumpify major` | `1.0.0` → `2.0.0` |

## Release flow

When you run `bumpify patch`, Bumpify:

1. verifies that the Git working tree is clean;
2. verifies that Git is on a branch and is not behind its known upstream;
3. updates the version in `package.json`;
4. updates a tracked `package-lock.json` or `npm-shrinkwrap.json`, when present;
5. writes the same version to `public/version.json`;
6. creates a commit such as `Bump version to 1.0.1`;
7. creates the Git tag `v1.0.1` on that commit.

The generated file looks like this:

```json
{
  "version": "1.0.1"
}
```

## Safe by default

Bumpify stops before changing files when:

- `package.json` is missing;
- the command or version type is invalid;
- the Git working tree is not clean;
- Git is in detached HEAD state;
- the current branch is behind or diverged from its locally known upstream.

If versioning, committing, or tagging fails, Bumpify exits with a non-zero status and restores the files and Git state it changed.

## Important behavior

- Bumpify creates a local commit and tag. It does not push them to a remote.
- Push a completed release with `git push && git push --tags`.
- Run `git fetch` before releasing if you need the latest upstream comparison.
- npm `preversion`, `version`, and `postversion` lifecycle scripts are skipped to keep the release commit predictable.
- `public/version.json` is force-added because it is part of the release, even if the path is ignored by Git.

## Update

```sh
npm install --global bumpify-cli@latest
```

## Uninstall

```sh
npm uninstall --global bumpify-cli
```

## Development

```sh
npm test
npm publish --dry-run
```

## License

[MIT](LICENSE) © [Antonio Budiselić](https://github.com/budiselic)
