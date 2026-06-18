# Release Workflow Guide

## Overview

This guide covers the release process for **45Flow** in this repository.

### Repository Structure
- **45flow-premium-dev**: Source + releases
- **GitHub target**: `45Drives/45flow-premium-dev`

### Downstream Sync Status

The old downstream sync hook/workflow is kept in the repo for reference only and is disabled by default.

---

## Quick Start

### Common Release Commands

All commands below target this repository.

```bash
# Bump patch version (0.7.0 → 0.7.1) and build all platforms
yarn release:patch

# Bump minor version (0.7.0 → 0.8.0) and build all platforms
yarn release:minor

# Bump major version (0.7.0 → 1.0.0) and build all platforms
yarn release:major

# Build without bumping version
yarn release:quick

# Build specific platforms
yarn release:linux
yarn release:mac
yarn release:windows

# Windows signing workflow (two-phase)
yarn release:windows:stage      # Build → upload unsigned
yarn release:windows:finalize   # Fetch signed executables
```

---

## Detailed Usage

### The Unified Release Script

The new `scripts/release/release.sh` wrapper simplifies the entire release process:

#### Basic Syntax
```bash
bash scripts/release/release.sh [OPTIONS]
```

#### Options

| Option | Description | Values |
|--------|-------------|--------|
| `--bump <type>` | Bump package.json version before build | `patch`, `minor`, `major` |
| `--os <platform>` | Build for specific OS(es) | `linux`, `windows`, `mac`, `all` |
| `--stage` | Stage Windows build only | - |
| `--finalize` | Finalize Windows build (fetch signed) | - |
| `--config <file>` | Use custom config file | Path to `.env.orchestrator.*` |
| `--dry-run` | Preview what would be done | - |
| `--help`, `-h` | Show help | - |

#### Examples

```bash
# Patch version bump + build all platforms
bash scripts/release/release.sh --bump patch --os all

# Build Mac only without version bump
bash scripts/release/release.sh --os mac

# Build multiple platforms
bash scripts/release/release.sh --os linux --os mac

# Stage Windows build for signing
bash scripts/release/release.sh --os windows --stage

# Finalize Windows after manual signing
bash scripts/release/release.sh --os windows --finalize

# Dry run to preview
bash scripts/release/release.sh --bump minor --dry-run
```

---

## Configuration Files

### 45flow-premium-dev
- **Config**: `.env.orchestrator.premium`
- **GitHub Target**: `45Drives/45flow-premium-dev`
- **Title Format**: `45Flow vX.Y.Z`

`GH_REPO` defaults to `45Drives/45flow-premium-dev`.

---

## Version Management

### How Version Bumping Works

1. Reads current version from `package.json`
2. Increments based on type:
   - **patch**: `0.7.0` → `0.7.1`
   - **minor**: `0.7.0` → `0.8.0`
   - **major**: `0.7.0` → `1.0.0`
3. Updates `package.json`
4. Stages the change with `git add package.json`

### Manual Version Management

You can also bump the version manually:

```bash
# Update package.json version manually
vim package.json

# Then build without --bump
bash scripts/release/release.sh --os all
```

### Committing Version Changes

After a version bump, remember to commit and tag:

```bash
git commit -m "Bump version to 0.7.1"
git tag -a v0.7.1 -m "Release v0.7.1"
git push && git push --tags
```

The release script will remind you of this after completion.

---

## Platform-Specific Notes

### Linux
- Builds locally on the orchestrator machine
- No special setup required

### macOS
- Uses remote build chain:
  1. ARM Mac builds the app bundle
  2. Intel Mac signs and notarizes
  3. Artifacts fetched back to orchestrator
- Both universal and architecture-specific builds supported

### Windows
- **Two-phase workflow** for code signing:

#### Phase 1: Stage
```bash
yarn release:windows:stage
```
- Builds unsigned executable on Windows build host
- Downloads to local `builds/release/X.Y.Z/windows/`
- **Manual action required**: Sign the `.exe` using Windows signing tools

#### Phase 2: Finalize
```bash
yarn release:windows:finalize
```
- Skips rebuild
- Fetches signed `.exe` and `.blockmap` back from Windows host
- Uploads to GitHub release

---

## GitHub Release Workflow

### Default Behavior

Configured in `.env.orchestrator.free` and `.env.orchestrator.premium`:

```bash
GH_CREATE_DRAFT=1      # Create draft release
GH_UPLOAD_RELEASE=1    # Upload artifacts
GH_PUBLISH_RELEASE=0   # Don't auto-publish (manual review)
```

### Publishing Flow

1. **Build completes** → Draft release created on GitHub
2. **Review artifacts** on GitHub Releases page
3. **Manually publish** when ready

### Customizing Release Metadata

Override in your config file or via environment:

```bash
# In .env.orchestrator.free or .env.orchestrator.premium
GH_TITLE="45Flow v__VERSION__"
GH_TAG_MESSAGE="v__VERSION__"
GH_NOTES="Release notes go here"
```

Or pass at runtime:

```bash
GH_NOTES="Major bug fixes" bash scripts/release/release.sh --bump patch
```

---

## Troubleshooting

### Downstream Sync Hook

The downstream sync hook is disabled by default. If you need it for reference testing only:

```bash
bash scripts/install-git-hooks.sh --enable-downstream-sync
```

### Config File Not Found

**Problem**: `Warning: Config file not found`

**Solution**:
```bash
# Copy from example
cp scripts/release/.env.orchestrator.example scripts/release/.env.orchestrator.free
# Or for premium:
cp scripts/release/.env.orchestrator.example scripts/release/.env.orchestrator.premium

# Edit with your settings
vim scripts/release/.env.orchestrator.free
```

### Version Mismatch

The orchestrator always uses the version from `package.json`. If you set `RELEASE_VERSION` in the config, it will be ignored with a warning.

---

## Advanced: Direct Orchestrator Usage

You can still call the underlying orchestrator directly:

```bash
# Using default config
bash scripts/release/orchestrate-release.sh

# With custom config
bash scripts/release/orchestrate-release.sh --env-file my-custom.env

# With runtime overrides
RUN_LINUX_BUILD=0 RUN_MAC_BUILD=1 RUN_WINDOWS_BUILD=0 \
  bash scripts/release/orchestrate-release.sh
```

---

## Migration from Old Scripts

### Old Commands

```bash
# OLD: Manual env var juggling
RUN_LINUX_BUILD=0 RUN_MAC_BUILD=0 RUN_WINDOWS_BUILD=1 \
  WIN_PHASE=stage GH_CREATE_DRAFT=0 GH_UPLOAD_RELEASE=0 \
  bash scripts/release/orchestrate-release.sh
```

### New Commands

```bash
# NEW: Clean, simple
yarn release:windows:stage
```

### Benefits of New System

1. ✅ **Version management built-in** - bump with one flag
2. ✅ **Cleaner syntax** - fewer environment variables
3. ✅ **Standalone target** - single release repo and workflow
4. ✅ **Documented** - `--help` always available

---

## Summary

### 45Flow Version (45flow-premium-dev)
```bash
cd ~/45flow-premium-dev

yarn release:patch              # Bump + build all platforms
# Releases to: 45Drives/45flow-premium-dev
```

### Key Points
- ✅ Downstream sync hook/workflow is disabled by default
- ✅ GitHub release target is this repository
- ✅ Version bumping is integrated
- ✅ Config files are repo-specific

---

## Questions?

For more details, run:
```bash
bash scripts/release/release.sh --help
```
