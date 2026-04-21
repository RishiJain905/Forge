# Task 3: Release Process

## Goal

Establish the release process for Forge including semantic versioning, changelog generation, and the `npm publish --access public` workflow.

## Context

Read these first:
- `package.json` — Current npm configuration
- `future_idea_implementation/step7-deploy.md` — Design reference (lines 340-390)

## What To Do

### 1. Create `CHANGELOG.md`

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - YYYY-MM-DD

### Added
- Initial stable release
- `forge intake` — Task specification and repo analysis
- `forge plan` — Planning from intake artifacts
- `forge verify` — Structural and formal verification (TLA+)
- `forge split` — Workstream partitioning
- `forge execute` — Parallel workstream execution
- `forge integrate` — Test generation and integration
- `forge init` — Initialize Forge in a repository
- `forge doctor` — Pre-flight environment checks
- `forge update` — Self-update functionality
- `forge config` — Configuration management
- Docker support
- GitHub Actions integration
```

### 2. Create release scripts

**`scripts/release.sh`**

```bash
#!/usr/bin/env bash
set -e

# Release script — tag, build, publish
# Usage: ./scripts/release.sh [patch|minor|major]

VERSION_TYPE=${1:-patch}

# Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo "Current version: $CURRENT_VERSION"

# Bump version
npm version $VERSION_TYPE --no-git-tag-version

# Get new version
NEW_VERSION=$(node -p "require('./package.json').version")
echo "New version: $NEW_VERSION"

# Build
echo "Building..."
npm run build

# Generate changelog (if changelog script exists)
if npm run changelog 2>/dev/null; then
  echo "Changelog updated"
fi

# Commit the version bump
git add package.json package-lock.json CHANGELOG.md dist/
git commit -m "chore: bump version to $NEW_VERSION"

# Tag
git tag "v$NEW_VERSION"

# Publish
echo "Publishing to npm..."
npm publish --access public

# Push
git push origin "v$NEW_VERSION"
git push

echo "Released $NEW_VERSION"
```

**`scripts/changelog.sh`**

```bash
#!/usr/bin/env bash
# Generate changelog from git commits
# Usage: ./scripts/changelog.sh [since_version]

SINCE=${1:-""}

if [ -n "$SINCE" ]; then
  echo "## [${SINCE}] - $(date +%Y-%m-%d)"
  git log --oneline "v${SINCE}..HEAD" | while read commit msg; do
    echo "- $msg"
  done
else
  # Full changelog
  echo "# Changelog"
  git log --oneline --reverse | while read commit msg; do
    echo "- $msg"
  done
fi
```

### 3. Create `scripts/publish.sh`

```bash
#!/usr/bin/env bash
set -e

# Dry run first
echo "Running dry run..."
npm publish --dry-run --access public

echo ""
echo "To publish for real, run:"
echo "  npm publish --access public"
```

### 4. Make scripts executable

```bash
chmod +x scripts/release.sh
chmod +x scripts/changelog.sh
chmod +x scripts/publish.sh
```

### 5. Update `package.json` with release scripts

```json
{
  "scripts": {
    "release": "bash scripts/release.sh",
    "changelog": "bash scripts/changelog.sh",
    "publish:dry": "bash scripts/publish.sh",
    "publish": "npm publish --access public"
  }
}
```

### 6. Update `CHANGELOG.md` for V1

Before release, update `CHANGELOG.md` with all the features from Steps 1-7.

### 7. Add `npm-shrinkwrap.json` or ensure `package-lock.json` is committed

```bash
npm shrinkwrap
# OR ensure package-lock.json is in .gitignore if using yarn
git add package-lock.json
```

### 8. Add release documentation

Create `docs/release-process.md`:

```markdown
# Forge Release Process

## Versioning

Forge follows [Semantic Versioning](https://semver.org/):
- `1.0.0` — Initial stable release
- `1.1.0` — Minor: new features, backwards compatible
- `2.0.0` — Major: breaking changes

## Pre-Release Checklist

1. All tests pass: `npm test && npm run typecheck && npm run build && npm run smoke`
2. Changelog is updated with all changes since last release
3. `package.json` version is correct
4. `npm publish --dry-run` passes without errors
5. Git working tree is clean

## Release Steps

### Patch Release (bug fixes)

```bash
./scripts/release.sh patch
```

### Minor Release (new features)

```bash
./scripts/release.sh minor
```

### Major Release (breaking changes)

```bash
./scripts/release.sh major
```

## Manual Release (if scripts fail)

1. Bump version: `npm version patch` (or `minor`, `major`)
2. Update CHANGELOG.md
3. Build: `npm run build`
4. Commit: `git add -A && git commit -m "chore: bump to vX.Y.Z"`
5. Tag: `git tag vX.Y.Z`
6. Publish: `npm publish --access public`
7. Push: `git push && git push --tags`

## After Publishing

1. Verify on npm: `npm view @forge-cli/forge`
2. Create GitHub Release at: https://github.com/RishiJain905/Forge/releases/new
3. Update README with installation instructions

## npm Access

Publishing requires:
- npm account with access to `@forge-cli` organization
- 2FA enabled on npm
- `npm login` completed locally

To check access:
```bash
npm access ls-collab @forge-cli/forge
```
```

## Verification

- `CHANGELOG.md` exists and is properly formatted
- `scripts/release.sh` is executable and works
- `npm publish --dry-run` passes
- Release documentation is clear

## Files Created/Modified

- `CHANGELOG.md` — NEW — Changelog file
- `scripts/release.sh` — NEW — Release script
- `scripts/changelog.sh` — NEW — Changelog generator
- `scripts/publish.sh` — NEW — Publish dry-run wrapper
- `package.json` — MODIFY — add release scripts
- `docs/release-process.md` — NEW — Release documentation

## Non-Goals

- Do not actually publish to npm during Step 7 (this is configuration)
- Do not create GitHub Releases automatically (manual step after publish)
- Do not set up GitHub Actions automatic publishing on tag (future enhancement)
