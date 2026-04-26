# Contributing

Thanks for helping improve CLI in One.

## Development

```powershell
npm install
npm start
```

Run the renderer build and smoke test before opening a pull request:

```powershell
npm run build:renderer
npm run smoke
```

## Commit Format

This repository uses Release Please with Conventional Commits to decide the next version:

- `fix: repair terminal resize crash` creates a patch release.
- `feat: add terminal search` creates a minor release.
- `feat!: change terminal layout format` creates a major release.
- Add a `BREAKING CHANGE:` footer for a major release when the subject line should not use `!`.
- `docs:`, `chore:`, `refactor:`, and `test:` do not create a release by themselves.

## Release Flow

1. Merge normal pull requests into `main` using Conventional Commit titles.
2. Release Please opens or updates a release pull request with `package.json`, `package-lock.json`, `CHANGELOG.md`, and `.release-please-manifest.json` changes.
3. Review and merge that release pull request.
4. The release workflow creates the GitHub Release and uploads Windows installer artifacts.

If a release exists but artifacts need to be rebuilt, run the `Release Artifacts` workflow manually and enter the release tag, for example `v0.1.0`.
