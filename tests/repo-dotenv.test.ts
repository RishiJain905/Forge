import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, beforeEach, afterEach } from "node:test";

import { loadRepoDotenv } from "../src/repo-dotenv.js";

describe("loadRepoDotenv", () => {
  let dir: string;
  const saved: Record<string, string | undefined> = {};

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "forge-repo-dotenv-"));
    for (const key of ["FORGE_MODEL_API_KEY", "FORGE_MODEL", "FORGE_X"]) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(async () => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    await rm(dir, { recursive: true, force: true });
  });

  it("no-op when .env is missing", () => {
    loadRepoDotenv(dir);
    assert.equal(process.env.FORGE_MODEL_API_KEY, undefined);
  });

  it("sets process.env from KEY=value", async () => {
    await writeFile(
      join(dir, ".env"),
      "FORGE_MODEL_API_KEY=secret123\nFORGE_MODEL=openai/gpt-4o-mini\n",
      "utf8"
    );
    loadRepoDotenv(dir);
    assert.equal(process.env.FORGE_MODEL_API_KEY, "secret123");
    assert.equal(process.env.FORGE_MODEL, "openai/gpt-4o-mini");
  });

  it("does not override an existing process.env value", async () => {
    process.env.FORGE_MODEL = "openai/from-host";
    await writeFile(
      join(dir, ".env"),
      "FORGE_MODEL=openai/from-file\n",
      "utf8"
    );
    loadRepoDotenv(dir);
    assert.equal(process.env.FORGE_MODEL, "openai/from-host");
  });

  it("strips optional double quotes on values", async () => {
    await writeFile(
      join(dir, ".env"),
      'FORGE_X="quoted"\n',
      "utf8"
    );
    loadRepoDotenv(dir);
    assert.equal(process.env.FORGE_X, "quoted");
  });

  it("skips comment and blank lines", async () => {
    await writeFile(
      join(dir, ".env"),
      "\n# comment\nFORGE_X=y\n\n",
      "utf8"
    );
    loadRepoDotenv(dir);
    assert.equal(process.env.FORGE_X, "y");
  });

  it("strips UTF-8 BOM", async () => {
    await writeFile(join(dir, ".env"), "\uFEFFFORGE_X=bom\n", "utf8");
    loadRepoDotenv(dir);
    assert.equal(process.env.FORGE_X, "bom");
  });
});
