import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(currentDirectory, "..", "..");
const packageJsonPath = resolve(projectRoot, "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));

describe("npm packaging contract", () => {
  it("has scoped package name @forgecli/forge", () => {
    assert.equal(packageJson.name, "@forgecli/forge");
  });

  it("has semver version on the 1.x release line", () => {
    assert.match(
      packageJson.version,
      /^1\.\d+\.\d+$/,
      `expected 1.x.y semver, got ${packageJson.version}`,
    );
  });

  it("has a description", () => {
    assert.ok(typeof packageJson.description === "string" && packageJson.description.length > 0);
  });

  it("has bin entry pointing to dist/src/index.js", () => {
    assert.ok(packageJson.bin);
    assert.equal(packageJson.bin.forge, "./dist/src/index.js");
  });

  it("has engines.node >=20", () => {
    assert.ok(packageJson.engines);
    assert.ok(packageJson.engines.node);
    const version = packageJson.engines.node.replace(/>=|\s/g, "");
    const major = parseInt(version, 10);
    assert.ok(major >= 20, `expected node >=20, got ${packageJson.engines.node}`);
  });

  it("has os field with darwin, linux, win32", () => {
    assert.ok(packageJson.os);
    assert.ok(packageJson.os.includes("darwin"));
    assert.ok(packageJson.os.includes("linux"));
    assert.ok(packageJson.os.includes("win32"));
  });

  it("has keywords including cli, forge", () => {
    assert.ok(Array.isArray(packageJson.keywords));
    assert.ok(packageJson.keywords.includes("cli"));
    assert.ok(packageJson.keywords.includes("forge"));
  });

  it("has exports map with main and package.json entries", () => {
    assert.ok(packageJson.exports);
    assert.ok(packageJson.exports["."]);
    assert.ok(packageJson.exports["."].import);
    assert.ok(packageJson.exports["."].types);
    assert.ok(packageJson.exports["./package.json"]);
  });

  it("has repository field", () => {
    assert.ok(packageJson.repository);
    assert.equal(packageJson.repository.type, "git");
    assert.ok(packageJson.repository.url.includes("RishiJain905/Forge"));
  });

  it("has MIT license", () => {
    assert.equal(packageJson.license, "MIT");
  });

  it("has publishConfig with public access", () => {
    assert.ok(packageJson.publishConfig);
    assert.equal(packageJson.publishConfig.access, "public");
    assert.ok(packageJson.publishConfig.registry.includes("registry.npmjs.org"));
  });

  it("has type module", () => {
    assert.equal(packageJson.type, "module");
  });

  it("has files field including dist", () => {
    assert.ok(Array.isArray(packageJson.files));
    assert.ok(packageJson.files.includes("dist"));
  });

  it("has prepublishOnly script", () => {
    assert.ok(packageJson.scripts.prepublishOnly);
  });

  it("has cross-platform postinstall that runs forge init", () => {
    assert.ok(packageJson.scripts.postinstall);
    assert.match(packageJson.scripts.postinstall, /postinstall-init\.mjs/);
    assert.ok(
      Array.isArray(packageJson.files) &&
        packageJson.files.includes("scripts/postinstall-init.mjs"),
      "postinstall helper must be listed in files so publish includes it",
    );
  });
});

describe("shebang preservation", () => {
  it("dist/src/index.js starts with #!/usr/bin/env node after build", () => {
    const cliPath = resolve(projectRoot, "dist", "src", "index.js");
    let content: string;
    try {
      content = readFileSync(cliPath, "utf8");
    } catch {
      assert.ok(false, `dist/src/index.js not found — run npm run build first`);
    }
    assert.ok(
      content.startsWith("#!/usr/bin/env node"),
      `CLI entry point must start with #!/usr/bin/env node, got: ${content.slice(0, 40)}...`
    );
  });
});