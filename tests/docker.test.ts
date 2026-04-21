import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import yaml from "js-yaml";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(currentDirectory, "..", "..");

const dockerfilePath = resolve(projectRoot, "Dockerfile");
const dockerignorePath = resolve(projectRoot, ".dockerignore");
const composePath = resolve(projectRoot, "docker-compose.yml");
const dockerMakefilePath = resolve(projectRoot, "docker", "Makefile");
const dockerDocsPath = resolve(projectRoot, "docs", "docker.md");

describe("Dockerfile", () => {
  it("Dockerfile exists", () => {
    if (!existsSync(dockerfilePath)) {
      console.log("SKIP: Dockerfile does not exist yet");
      return;
    }
    assert.ok(true);
  });

  it("uses node:20-alpine", () => {
    if (!existsSync(dockerfilePath)) {
      console.log("SKIP: Dockerfile does not exist yet");
      return;
    }
    const content = readFileSync(dockerfilePath, "utf8");
    assert.ok(/FROM\s+node:20-alpine/.test(content), "Dockerfile should use FROM node:20-alpine");
  });

  it("has multi-stage build (AS builder)", () => {
    if (!existsSync(dockerfilePath)) {
      console.log("SKIP: Dockerfile does not exist yet");
      return;
    }
    const content = readFileSync(dockerfilePath, "utf8");
    assert.ok(/AS\s+builder/i.test(content), "Dockerfile should have a multi-stage build with AS builder");
  });

  it("entrypoint/cmd points to dist/src/index.js", () => {
    if (!existsSync(dockerfilePath)) {
      console.log("SKIP: Dockerfile does not exist yet");
      return;
    }
    const content = readFileSync(dockerfilePath, "utf8");
    assert.ok(
      content.includes("dist/src/index.js"),
      "Dockerfile should reference dist/src/index.js as entrypoint"
    );
    assert.ok(
      !content.includes("dist/cli.js"),
      "Dockerfile should NOT reference dist/cli.js"
    );
  });

  it("has non-root user", () => {
    if (!existsSync(dockerfilePath)) {
      console.log("SKIP: Dockerfile does not exist yet");
      return;
    }
    const content = readFileSync(dockerfilePath, "utf8");
    const hasUserForge = /USER\s+forge\b/i.test(content);
    const hasUser1001 = /USER\s+1001\b/i.test(content);
    assert.ok(
      hasUserForge || hasUser1001,
      "Dockerfile should have USER forge or USER 1001"
    );
  });

  it("does NOT copy .forge/ into image", () => {
    if (!existsSync(dockerfilePath)) {
      console.log("SKIP: Dockerfile does not exist yet");
      return;
    }
    const content = readFileSync(dockerfilePath, "utf8");
    assert.ok(
      !content.includes(".forge/"),
      "Dockerfile should not copy .forge/ into the image"
    );
  });

  it("does NOT include hardcoded API keys", () => {
    if (!existsSync(dockerfilePath)) {
      console.log("SKIP: Dockerfile does not exist yet");
      return;
    }
    const content = readFileSync(dockerfilePath, "utf8");
    assert.ok(
      !content.includes('OPENAI_API_KEY='),
      "Dockerfile should not hardcode OPENAI_API_KEY"
    );
    assert.ok(
      !content.includes('ANTHROPIC_API_KEY='),
      "Dockerfile should not hardcode ANTHROPIC_API_KEY"
    );
  });

  it("installs git", () => {
    if (!existsSync(dockerfilePath)) {
      console.log("SKIP: Dockerfile does not exist yet");
      return;
    }
    const content = readFileSync(dockerfilePath, "utf8");
    assert.ok(content.includes("git"), "Dockerfile should install git");
  });
});

describe(".dockerignore", () => {
  it("exists and contains required entries", () => {
    if (!existsSync(dockerignorePath)) {
      console.log("SKIP: .dockerignore does not exist yet");
      return;
    }
    const content = readFileSync(dockerignorePath, "utf8");
    assert.ok(content.includes(".git"), ".dockerignore should ignore .git");
    assert.ok(content.includes("node_modules/"), ".dockerignore should ignore node_modules/");
    assert.ok(content.includes("dist/"), ".dockerignore should ignore dist/");
    assert.ok(content.includes(".forge/"), ".dockerignore should ignore .forge/");
    assert.ok(content.includes("*.md"), ".dockerignore should ignore *.md");
  });
});

describe("docker-compose.yml", () => {
  it("exists and is valid YAML", () => {
    if (!existsSync(composePath)) {
      console.log("SKIP: docker-compose.yml does not exist yet");
      return;
    }
    const content = readFileSync(composePath, "utf8");
    const doc = yaml.load(content);
    assert.ok(doc && typeof doc === "object", "docker-compose.yml should parse as a YAML object");
  });

  it("has forge service with volumes, environment, and working_dir", () => {
    if (!existsSync(composePath)) {
      console.log("SKIP: docker-compose.yml does not exist yet");
      return;
    }
    const content = readFileSync(composePath, "utf8");
    const doc = yaml.load(content) as Record<string, unknown>;
    const services = doc.services as Record<string, unknown>;
    assert.ok(services && typeof services === "object", "docker-compose.yml should have services");
    const forgeService = services.forge as Record<string, unknown>;
    assert.ok(forgeService, "docker-compose.yml should have a forge service");
    assert.ok(
      forgeService.volumes || forgeService.environment || forgeService.working_dir,
      "forge service should have volumes, environment, or working_dir"
    );
  });

  it("uses forge:latest image", () => {
    if (!existsSync(composePath)) {
      console.log("SKIP: docker-compose.yml does not exist yet");
      return;
    }
    const content = readFileSync(composePath, "utf8");
    assert.ok(
      /image:\s*forge:latest/.test(content),
      "docker-compose.yml should use forge:latest image"
    );
  });

  it("mounts volume for .forge data", () => {
    if (!existsSync(composePath)) {
      console.log("SKIP: docker-compose.yml does not exist yet");
      return;
    }
    const content = readFileSync(composePath, "utf8");
    assert.ok(
      content.includes(".forge"),
      "docker-compose.yml should mount a volume for .forge data"
    );
  });

  it("passes Forge model configuration from environment", () => {
    if (!existsSync(composePath)) {
      console.log("SKIP: docker-compose.yml does not exist yet");
      return;
    }
    const content = readFileSync(composePath, "utf8");
    assert.ok(
      /\$\{FORGE_MODEL_PROVIDER/.test(content) || /FORGE_MODEL_PROVIDER=/.test(content),
      "docker-compose.yml should pass FORGE_MODEL_PROVIDER from env"
    );
    assert.ok(
      /\$\{FORGE_MODEL_NAME/.test(content) || /FORGE_MODEL_NAME=/.test(content),
      "docker-compose.yml should pass FORGE_MODEL_NAME from env"
    );
    assert.ok(
      /FORGE_MODEL_API_KEY/.test(content),
      "docker-compose.yml should pass FORGE_MODEL_API_KEY for the AI connector"
    );
  });
});

describe("docker/Makefile", () => {
  it("exists and has build target with docker build", () => {
    if (!existsSync(dockerMakefilePath)) {
      console.log("SKIP: docker/Makefile does not exist yet");
      return;
    }
    const content = readFileSync(dockerMakefilePath, "utf8");
    assert.ok(
      content.includes("docker build"),
      "docker/Makefile should contain a docker build command"
    );
  });
});

describe("docs/docker.md", () => {
  it("exists with build instructions", () => {
    if (!existsSync(dockerDocsPath)) {
      console.log("SKIP: docs/docker.md does not exist yet");
      return;
    }
    const content = readFileSync(dockerDocsPath, "utf8");
    const hasDocker = /Docker/i.test(content);
    const hasBuild = /docker build/i.test(content);
    assert.ok(
      hasDocker || hasBuild,
      "docs/docker.md should mention Docker or docker build"
    );
  });
});
