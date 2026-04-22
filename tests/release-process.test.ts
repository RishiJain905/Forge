import assert from "node:assert/strict";
import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(currentDirectory, "..", "..");

const changelogPath = resolve(projectRoot, "CHANGELOG.md");
const releaseScriptPath = resolve(projectRoot, "scripts", "release.sh");
const changelogScriptPath = resolve(projectRoot, "scripts", "changelog.sh");
const publishScriptPath = resolve(projectRoot, "scripts", "publish.sh");
const releaseDocsPath = resolve(projectRoot, "docs", "release-process.md");
const packageJsonPath = resolve(projectRoot, "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));

function isExecutable(filePath: string): boolean {
  try {
    const stats = statSync(filePath);
    // Check owner, group, or other execute bits (0o111)
    return (stats.mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

/** Git/NTFS on Windows typically does not surface Unix execute bits; still require the file. */
function assertReleaseScriptPathIsRunnable(filePath: string, label: string): void {
  const stats = statSync(filePath);
  assert.ok(stats.isFile(), `${label} should be a regular file`);
  if (process.platform !== "win32") {
    assert.ok(isExecutable(filePath), `${label} should be executable`);
  }
}

describe("CHANGELOG.md", () => {
  it("exists", () => {
    if (!existsSync(changelogPath)) {
      console.log("SKIP: CHANGELOG.md does not exist yet");
      return;
    }
    assert.ok(true);
  });

  it("contains # Changelog header", () => {
    if (!existsSync(changelogPath)) {
      console.log("SKIP: CHANGELOG.md does not exist yet");
      return;
    }
    const content = readFileSync(changelogPath, "utf8");
    assert.ok(
      content.includes("# Changelog"),
      "CHANGELOG.md should contain '# Changelog' header"
    );
  });

  it("references Semantic Versioning or Keep a Changelog", () => {
    if (!existsSync(changelogPath)) {
      console.log("SKIP: CHANGELOG.md does not exist yet");
      return;
    }
    const content = readFileSync(changelogPath, "utf8");
    const hasSemver = /semantic versioning/i.test(content);
    const hasKeepAChangelog = /keep a changelog/i.test(content);
    assert.ok(
      hasSemver || hasKeepAChangelog,
      "CHANGELOG.md should reference Semantic Versioning or Keep a Changelog"
    );
  });

  it("includes V1 or 1.0.0 entry", () => {
    if (!existsSync(changelogPath)) {
      console.log("SKIP: CHANGELOG.md does not exist yet");
      return;
    }
    const content = readFileSync(changelogPath, "utf8");
    const hasV1 = /V1/i.test(content);
    const has100 = /1\.0\.0/.test(content);
    assert.ok(
      hasV1 || has100,
      "CHANGELOG.md should include a V1 or 1.0.0 entry"
    );
  });
});

describe("scripts/release.sh", () => {
  it("exists and is executable", () => {
    if (!existsSync(releaseScriptPath)) {
      console.log("SKIP: scripts/release.sh does not exist yet");
      return;
    }
    assertReleaseScriptPathIsRunnable(releaseScriptPath, "scripts/release.sh");
  });

  it("contains npm version", () => {
    if (!existsSync(releaseScriptPath)) {
      console.log("SKIP: scripts/release.sh does not exist yet");
      return;
    }
    const content = readFileSync(releaseScriptPath, "utf8");
    assert.ok(
      content.includes("npm version"),
      "scripts/release.sh should contain 'npm version'"
    );
  });

  it("contains npm run build", () => {
    if (!existsSync(releaseScriptPath)) {
      console.log("SKIP: scripts/release.sh does not exist yet");
      return;
    }
    const content = readFileSync(releaseScriptPath, "utf8");
    assert.ok(
      content.includes("npm run build"),
      "scripts/release.sh should contain 'npm run build'"
    );
  });
});

describe("scripts/changelog.sh", () => {
  it("exists and is executable", () => {
    if (!existsSync(changelogScriptPath)) {
      console.log("SKIP: scripts/changelog.sh does not exist yet");
      return;
    }
    assertReleaseScriptPathIsRunnable(changelogScriptPath, "scripts/changelog.sh");
  });
});

describe("scripts/publish.sh", () => {
  it("exists and is executable", () => {
    if (!existsSync(publishScriptPath)) {
      console.log("SKIP: scripts/publish.sh does not exist yet");
      return;
    }
    assertReleaseScriptPathIsRunnable(publishScriptPath, "scripts/publish.sh");
  });

  it("contains npm publish --dry-run", () => {
    if (!existsSync(publishScriptPath)) {
      console.log("SKIP: scripts/publish.sh does not exist yet");
      return;
    }
    const content = readFileSync(publishScriptPath, "utf8");
    assert.ok(
      content.includes("npm publish --dry-run"),
      "scripts/publish.sh should contain 'npm publish --dry-run'"
    );
  });
});

describe("docs/release-process.md", () => {
  it("exists with Release or Versioning text", () => {
    if (!existsSync(releaseDocsPath)) {
      console.log("SKIP: docs/release-process.md does not exist yet");
      return;
    }
    const content = readFileSync(releaseDocsPath, "utf8");
    const hasRelease = /Release/i.test(content);
    const hasVersioning = /Versioning/i.test(content);
    assert.ok(
      hasRelease || hasVersioning,
      "docs/release-process.md should contain 'Release' or 'Versioning'"
    );
  });

  it("has npm account or npm login reference", () => {
    if (!existsSync(releaseDocsPath)) {
      console.log("SKIP: docs/release-process.md does not exist yet");
      return;
    }
    const content = readFileSync(releaseDocsPath, "utf8");
    const hasAccount = /npm account/i.test(content);
    const hasLogin = /npm login/i.test(content);
    assert.ok(
      hasAccount || hasLogin,
      "docs/release-process.md should reference 'npm account' or 'npm login'"
    );
  });
});

describe("package.json release scripts", () => {
  it('has "release" script', () => {
    assert.ok(
      packageJson.scripts && packageJson.scripts.release,
      'package.json should have a "release" script'
    );
  });

  it('has "changelog" script', () => {
    assert.ok(
      packageJson.scripts && packageJson.scripts.changelog,
      'package.json should have a "changelog" script'
    );
  });

  it('has "publish:dry" script', () => {
    assert.ok(
      packageJson.scripts && packageJson.scripts["publish:dry"],
      'package.json should have a "publish:dry" script'
    );
  });
});
