#!/usr/bin/env bash
set -e

# Release script — bump version, build, tag, and prepare for npm publish
# Usage: ./scripts/release.sh [patch|minor|major]

VERSION_TYPE=${1:-patch}

# Ensure clean working tree
git diff --quiet || {
  echo "Error: working tree is dirty. Commit or stash changes first."
  exit 1
}

git diff --cached --quiet || {
  echo "Error: staged changes exist. Commit them first."
  exit 1
}

# Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo "Current version: $CURRENT_VERSION"

# Bump version (creates git tag automatically from npm version)
npm version "$VERSION_TYPE" --no-git-tag-version

# Get new version
NEW_VERSION=$(node -p "require('./package.json').version")
echo "New version: $NEW_VERSION"

# Build
echo "Building..."
npm run build

# Update changelog header with today's date
today=$(date +%Y-%m-%d)
sed -i.bak "s/## \[1.0.0\] - .*/## [1.0.0] - $today/" CHANGELOG.md 2>/dev/null || true
rm -f CHANGELOG.md.bak

# Commit version bump (do NOT add dist/ — it's .gitignored)
git add package.json package-lock.json CHANGELOG.md
git commit -m "chore: bump version to $NEW_VERSION"

# Create the final tag
git tag "v$NEW_VERSION"

echo ""
echo "Version bumped to $NEW_VERSION and tagged."
echo ""
echo "NEXT STEPS:"
echo "  1. Review the changes: git show HEAD"
echo "  2. Push the tag: git push origin v$NEW_VERSION"
echo "  3. Publish to npm: npm publish --access public"
echo "  4. Create a GitHub Release at https://github.com/RishiJain905/Forge/releases"
echo ""
echo "If you're not ready to publish yet, the commit and tag are ready whenever you are."
echo "Make sure you have:"
echo "  - npm account with access to @forge-cli organization"
echo "  - npm login completed (npm whoami to verify)"
echo "  - 2FA enabled on npm"
echo ""
