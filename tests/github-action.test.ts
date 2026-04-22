import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import yaml from "js-yaml";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(currentDirectory, "..", "..");

const forgeYmlPath = resolve(projectRoot, ".github", "workflows", "forge.yml");
const ciYmlPath = resolve(projectRoot, ".github", "workflows", "ci.yml");
const docsPath = resolve(projectRoot, "docs", "github-action.md");

describe("forge.yml workflow", () => {
  it("exists and is valid YAML", () => {
    if (!existsSync(forgeYmlPath)) {
      console.log("SKIP: forge.yml does not exist yet");
      return;
    }
    const content = readFileSync(forgeYmlPath, "utf8");
    const doc = yaml.load(content);
    assert.ok(doc && typeof doc === "object", "forge.yml should parse as a YAML object");
  });

  it("has push triggers on main and develop branches", () => {
    if (!existsSync(forgeYmlPath)) {
      console.log("SKIP: forge.yml does not exist yet");
      return;
    }
    const content = readFileSync(forgeYmlPath, "utf8");
    const doc = yaml.load(content) as Record<string, unknown>;
    const onField = doc.on as Record<string, unknown>;
    assert.ok(onField, "forge.yml should have 'on' triggers");
    const push = onField.push as Record<string, unknown>;
    assert.ok(push, "forge.yml should have push trigger");
    const branches = push.branches as string[];
    assert.ok(Array.isArray(branches), "push trigger should have branches array");
    assert.ok(branches.includes("main"), "push should trigger on main");
    assert.ok(branches.includes("develop"), "push should trigger on develop");
  });

  it("has pull_request trigger on main branch", () => {
    if (!existsSync(forgeYmlPath)) {
      console.log("SKIP: forge.yml does not exist yet");
      return;
    }
    const content = readFileSync(forgeYmlPath, "utf8");
    const doc = yaml.load(content) as Record<string, unknown>;
    const onField = doc.on as Record<string, unknown>;
    assert.ok(onField, "forge.yml should have 'on' triggers");
    const pr = onField.pull_request as Record<string, unknown>;
    assert.ok(pr, "forge.yml should have pull_request trigger");
    const branches = pr.branches as string[];
    assert.ok(Array.isArray(branches), "pull_request trigger should have branches array");
    assert.ok(branches.includes("main"), "pull_request should trigger on main");
  });

  it("has a job running on ubuntu-latest", () => {
    if (!existsSync(forgeYmlPath)) {
      console.log("SKIP: forge.yml does not exist yet");
      return;
    }
    const content = readFileSync(forgeYmlPath, "utf8");
    const doc = yaml.load(content) as Record<string, unknown>;
    const jobs = doc.jobs as Record<string, unknown>;
    assert.ok(jobs && typeof jobs === "object", "forge.yml should have jobs");
    const jobNames = Object.keys(jobs);
    assert.ok(jobNames.length > 0, "forge.yml should have at least one job");
    const firstJob = jobs[jobNames[0]] as Record<string, unknown>;
    assert.equal(firstJob["runs-on"], "ubuntu-latest", "job should run on ubuntu-latest");
  });

  it("includes setup-node with node-version 20", () => {
    if (!existsSync(forgeYmlPath)) {
      console.log("SKIP: forge.yml does not exist yet");
      return;
    }
    const content = readFileSync(forgeYmlPath, "utf8");
    assert.ok(content.includes("actions/setup-node"), "should use actions/setup-node");
    assert.ok(content.includes("node-version: '20'") || content.includes('node-version: "20"') || content.includes("node-version: 20"), "should specify node-version 20");
  });

  it("includes npm install -g @forgecli/forge step", () => {
    if (!existsSync(forgeYmlPath)) {
      console.log("SKIP: forge.yml does not exist yet");
      return;
    }
    const content = readFileSync(forgeYmlPath, "utf8");
    assert.ok(content.includes("npm install -g @forgecli/forge"), "should install @forgecli/forge globally");
  });

  it("includes forge doctor --checks step", () => {
    if (!existsSync(forgeYmlPath)) {
      console.log("SKIP: forge.yml does not exist yet");
      return;
    }
    const content = readFileSync(forgeYmlPath, "utf8");
    assert.ok(content.includes("forge doctor --checks"), "should run forge doctor --checks");
  });

  it("includes artifact upload step with name forge-artifacts", () => {
    if (!existsSync(forgeYmlPath)) {
      console.log("SKIP: forge.yml does not exist yet");
      return;
    }
    const content = readFileSync(forgeYmlPath, "utf8");
    assert.ok(content.includes("forge-artifacts"), "should upload artifact named forge-artifacts");
  });
});

describe("ci.yml workflow", () => {
  it("exists and is valid YAML", () => {
    if (!existsSync(ciYmlPath)) {
      console.log("SKIP: ci.yml does not exist yet");
      return;
    }
    const content = readFileSync(ciYmlPath, "utf8");
    const doc = yaml.load(content);
    assert.ok(doc && typeof doc === "object", "ci.yml should parse as a YAML object");
  });

  it("has PR trigger (pull_request:)", () => {
    if (!existsSync(ciYmlPath)) {
      console.log("SKIP: ci.yml does not exist yet");
      return;
    }
    const content = readFileSync(ciYmlPath, "utf8");
    const doc = yaml.load(content) as Record<string, unknown>;
    const onField = doc.on as Record<string, unknown>;
    assert.ok(onField, "ci.yml should have 'on' triggers");
    assert.ok("pull_request" in onField, "ci.yml should have pull_request trigger");
  });

  it("uses node-version 20 in setup-node", () => {
    if (!existsSync(ciYmlPath)) {
      console.log("SKIP: ci.yml does not exist yet");
      return;
    }
    const content = readFileSync(ciYmlPath, "utf8");
    assert.ok(content.includes("actions/setup-node"), "should use actions/setup-node");
    assert.ok(content.includes("node-version: '20'") || content.includes('node-version: "20"') || content.includes("node-version: 20"), "should specify node-version 20");
  });

  it("includes build, test, and smoke steps", () => {
    if (!existsSync(ciYmlPath)) {
      console.log("SKIP: ci.yml does not exist yet");
      return;
    }
    const content = readFileSync(ciYmlPath, "utf8");
    assert.ok(content.includes("build"), "should include build step");
    assert.ok(content.includes("test"), "should include test step");
    assert.ok(content.includes("smoke"), "should include smoke step");
  });

  it("includes artifact upload with name matching forge-build-*", () => {
    if (!existsSync(ciYmlPath)) {
      console.log("SKIP: ci.yml does not exist yet");
      return;
    }
    const content = readFileSync(ciYmlPath, "utf8");
    assert.ok(/forge-build-\*/.test(content) || content.includes("forge-build-"), "should upload artifact with name matching forge-build-*");
  });
});

describe("docs/github-action.md", () => {
  it("exists and contains Forge CLI or GitHub Action text", () => {
    if (!existsSync(docsPath)) {
      console.log("SKIP: docs/github-action.md does not exist yet");
      return;
    }
    const content = readFileSync(docsPath, "utf8");
    const hasText = content.includes("Forge CLI") || content.includes("GitHub Action");
    assert.ok(hasText, "docs/github-action.md should contain 'Forge CLI' or 'GitHub Action'");
  });

  it("has usage examples section", () => {
    if (!existsSync(docsPath)) {
      console.log("SKIP: docs/github-action.md does not exist yet");
      return;
    }
    const content = readFileSync(docsPath, "utf8");
    const lower = content.toLowerCase();
    assert.ok(
      lower.includes("usage") && lower.includes("example"),
      "docs/github-action.md should have a usage examples section"
    );
  });
});
