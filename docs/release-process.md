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
npm run release patch
```

### Minor Release (new features)

```bash
npm run release minor
```

### Major Release (breaking changes)

```bash
npm run release major
```

### After the script runs:

1. Review the commit: `git show HEAD`
2. Push the tag: `git push origin vX.Y.Z`
3. Publish to npm: `npm publish --access public`
4. Create a GitHub Release at https://github.com/RishiJain905/Forge/releases

## Manual Release (if scripts fail)

1. Bump version: `npm version patch|minor|major`
2. Update CHANGELOG.md
3. Build: `npm run build`
4. Commit: `git add package.json package-lock.json CHANGELOG.md && git commit -m "chore: bump to vX.Y.Z"`
5. Tag: `git tag vX.Y.Z`
6. Push: `git push && git push --tags`
7. Publish: `npm publish --access public`

## npm Account Requirements

Publishing requires:
- npm account with access to `@forge-cli` organization
- 2FA enabled on npm
- `npm login` completed locally

To check:
```bash
npm whoami
npm access ls-collaborators @forge-cli/forge
```

## Post-Publish Verification

```bash
npm view @forge-cli/forge
npx @forge-cli/forge --version
```
