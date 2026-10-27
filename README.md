<div align="center">

# npmUI

**A local-first workspace manager for developers.**

Discover projects, run scripts, manage processes, and work from a native terminal without leaving your desktop.

[![Build and publish release](https://github.com/ShalomCoder/npmui/actions/workflows/release.yml/badge.svg)](https://github.com/ShalomCoder/npmui/actions/workflows/release.yml)
[![Latest release](https://img.shields.io/github/v/release/ShalomCoder/npmui?display_name=tag&sort=semver)](https://github.com/ShalomCoder/npmui/releases)

</div>

## What npmUI does

npmUI brings the everyday tasks of a local development workspace into one focused Electron application:

- **Discover local projects** from a configurable projects directory.
- **Inspect real project metadata** from `package.json`, scripts, dependencies, frameworks, package managers, and Git.
- **Run scripts** with streamed output, exit status, duration, and process history.
- **Track development servers** and open detected local URLs directly in your browser.
- **Use a native-style terminal** with PTY-backed sessions, multiple tabs, shell selection, resizing, and detached windows.
- **Explore npm packages** and install or remove dependencies in selected projects.
- **Create projects** from supported Node.js, TypeScript, Vite, and Next.js templates.
- **Configure your environment** with shell preferences, tool detection, terminal appearance, and accent colors.

The core workspace is designed to remain useful offline. Network access is only needed for registry searches, package downloads, remote templates, and updates.

## Download

The latest installers are available on the [Releases page](https://github.com/ShalomCoder/npmui/releases):

| Platform | Artifacts |
| --- | --- |
| Windows x64 | NSIS installer |
| Linux x64 / arm64 | AppImage and Debian package |

GitHub also provides source archives for every release tag.

## Development

### Requirements

- Node.js 22 or newer
- npm
- Windows, Linux, or another Electron-supported development environment

### Run locally

```powershell
npm install
npm run dev
```

### Validate and build

```powershell
npm run typecheck
npm run build
```

Build local installers with:

```powershell
# Windows
npm run dist

# Linux AppImage and Debian package
npm run dist:linux
```

## Architecture

npmUI keeps privileged desktop operations outside the renderer:

```text
src/
├── main/       Electron main process: filesystem, processes, settings, packaging workflows
├── preload/    Narrow, typed contextBridge API
├── renderer/   React interface and workspace views
└── shared/     TypeScript contracts shared across process boundaries
```

Security boundaries include:

- `contextIsolation` enabled
- Node integration disabled in the renderer
- Sandboxed preload
- Explicit typed IPC handlers
- Validated filesystem and process operations
- Restricted external URL handling

## Toolchain setup

The Settings view detects Node.js, npm, pnpm, Yarn, Git, Python, and PHP. Missing tools can be installed from the app on Windows using `winget` or Corepack where supported. Installation is always an explicit user action and progress is shown in process tracking.

## Releases

Releases are created by pushing a version tag:

```powershell
git tag v0.2.0
git push origin v0.2.0
```

GitHub Actions then builds and publishes Windows and Linux artifacts automatically. See [RELEASING.md](RELEASING.md) for the full release process.

## Project status

npmUI is under active development. The current release focuses on the local workspace, project discovery, script execution, process tracking, terminal workflows, package operations, and cross-platform packaging foundation.

## License

No license has been declared yet. Until one is added, all rights are reserved.
