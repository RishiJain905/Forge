# npm Publishing Checklist — Forge CLI

This checklist walks you through everything needed to publish `@forge-cli/forge` to npm. Go through each step in order. All steps are manual — none of the scripts in this repo will publish without your explicit action.

---

## Step 1: Get an npm Account

1. Go to https://www.npmjs.com/signup
2. Create an account (username: your choice)
3. After signup, go to **Account** and enable **Two-Factor Authentication (2FA)** under **Security**
   - Use an authenticator app or security key
   - Download backup codes and store them safely

---

## Step 2: Create the `@forge-cli` Organization

1. Log into npm at https://www.npmjs.com/login
2. Go to **Organizations** and click **Create Organization**
3. Name it `forge-cli`
4. Choose the **Free** plan (or **Pro** if you need private packages)
5. After creation, go to **Organization Settings** and invite collaborators if needed

---

## Step 3: Log In Locally

```bash
npm login
```

- Enter your username, password, and email
- Enter the 2FA OTP from your authenticator app when prompted

Verify login:

```bash
npm whoami
```

Expected output: your npm username.

---

## Step 4: Verify Organization Access

```bash
npm access ls-collaborators @forge-cli/forge
```

If you just created the org, this may show an error (package doesn't exist yet). That's okay.

To verify you can publish scoped packages:

```bash
npm access ls-packages
```

You should see `@forge-cli` listed.

---

## Step 5: Run Pre-Flight Checks in This Repo

```bash
cd /home/trjxter/Forge

# Full test/typecheck/build/smoke pipeline
npm test && npm run typecheck && npm run build && npm run smoke

# Verify dry-run
npm run publish:dry
```

All must pass before proceeding.

---

## Step 6: Decide Release Version

Forge is currently at `1.0.0`. When you're ready for the first real publish, the version in `package.json` is what npm will use.

Run the release script to bump the version + tag:

```bash
# This is the very first release — you may want to keep 1.0.0
npm run release major   # if you want 2.0.0 — unlikely
npm run release minor   # if you want 1.1.0 — new features
npm run release patch   # if you want 1.0.1 — bug fixes
```

For the **initial publish**, just verify `package.json` says `1.0.0` and skip version bumping unless you've already changed it.

---

## Step 7: Publish

### Option A: Use the publish script (safe, does dry-run first)

```bash
npm run publish:dry
```

Review the dry-run output:
- Package name should be `@forge-cli/forge`
- Version should be correct
- No sensitive files should be in the tarball

If dry-run looks good, publish for real:

```bash
npm publish --access public
```

You will be prompted for your 2FA OTP.

### Option B: Publish directly

```bash
npm publish --access public
```

---

## Step 8: Verify on npm

Wait 30-60 seconds, then:

```bash
npm view @forge-cli/forge
```

This should show the published package with version, description, and README.

Also test npx:

```bash
npx @forge-cli/forge --version
```

This should download and run the package, printing the version.

---

## Step 9: Push the Tag

After `npm run release` (which creates a commit and tag):

```bash
git push
```

If you haven't pushed the tag yet:

```bash
git push origin v1.0.0
```

---

## Step 10: Create a GitHub Release

1. Go to https://github.com/RishiJain905/Forge/releases/new
2. Choose tag `v1.0.0`
3. Title: `Forge v1.0.0`
4. Paste the contents of `CHANGELOG.md` under the heading for this version
5. Click **Publish release**

---

## Troubleshooting

### "403 Forbidden — Package name already exists"

Someone else has claimed `@forge-cli/forge`. Try a different scope if needed, or request ownership transfer from npm support.

### "404 Not Found — scope not found"

The `@forge-cli` organization doesn't exist. Create it first (Step 2).

### "ENEEDAUTH — need auth"

Run `npm login` again and check `npm whoami`.

### "EOTP — One Time Password required"

Your 2FA is working. Enter the OTP from your authenticator app.

### "Working tree is dirty" from release.sh

Run `git status`. Commit or stash any uncommitted changes before running `npm run release`.

---

## Summary of Commands

```bash
# Setup (one-time)
npm login
npm whoami
npm access ls-collaborators @forge-cli/forge

# Pre-flight (every time)
npm test && npm run typecheck && npm run build && npm run smoke
npm run publish:dry

# Release (automated version bump + commit + tag)
npm run release patch   # or minor / major

# Publish
npm publish --access public

# Verify
npm view @forge-cli/forge
npx @forge-cli/forge --version

# Push
git push && git push origin v1.0.0

# GitHub Release (web UI)
# https://github.com/RishiJain905/Forge/releases/new
```

---

*Last updated: 2026-04-21*
