# Releasing npmUI

## Creating a release

1. Update `version` in `package.json`.
2. Commit and push the change.
3. Create and push a matching version tag:

```powershell
git tag v0.2.0
git push origin v0.2.0
```

The `Build and publish release` workflow then runs on GitHub-hosted Windows and Ubuntu runners. It publishes:

- Windows x64 NSIS installer
- Linux x64 and arm64 AppImage packages
- Linux x64 and arm64 Debian packages

GitHub automatically provides source ZIP and tarball downloads for the tag.
