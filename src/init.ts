import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";

export interface InitOptions {
  dir?: string;
  yes?: boolean;
  force?: boolean;
}

const DEFAULT_CONFIG = `forge:
  version: "1.0.0"
  log_level: info  # debug | info | warn | error
  default_model: openai/gpt-4o

intake:
  default_llm_mode: auto

execute:
  parallel_workstreams: true
  max_workstreams: 10
  default_model: openai/gpt-4o

integrate:
  auto_run: true
  test_framework: auto  # auto-detect
`;

const DEFAULT_FORGEIGNORE = `# Forge ignore patterns
node_modules/
dist/
.env
*.log
.DS_Store
.vscode/
.idea/
`;

const DEFAULT_FORGE_CONFIG_TS = `// Forge configuration
// See https://github.com/RishiJain905/Forge for documentation

export default {
  forge: {
    version: "1.0.0",
    logLevel: "info",
    defaultModel: "openai/gpt-4o",
  },
  intake: {
    defaultLlmMode: "auto",
  },
  execute: {
    parallelWorkstreams: true,
    maxWorkstreams: 10,
    defaultModel: "openai/gpt-4o",
  },
  integrate: {
    autoRun: true,
    testFramework: "auto",
  },
};
`;

export async function initForge(options: InitOptions = {}): Promise<void> {
  const targetDir = options.dir ? resolve(options.dir) : process.cwd();
  const forgeDir = join(targetDir, ".forge");

  if (existsSync(forgeDir) && !options.force) {
    throw new Error(
      `.forge/ already exists at ${forgeDir}. Use --force to overwrite.`
    );
  }

  await mkdir(forgeDir, { recursive: true });
  await mkdir(join(forgeDir, "reports"), { recursive: true });
  await mkdir(join(forgeDir, "debug"), { recursive: true });

  await writeFile(join(forgeDir, "config.yaml"), DEFAULT_CONFIG, "utf8");
  await writeFile(join(forgeDir, ".forgeignore"), DEFAULT_FORGEIGNORE, "utf8");

  if (options.yes) {
    await writeFile(join(forgeDir, "forge.config.ts"), DEFAULT_FORGE_CONFIG_TS, "utf8");
  }

  console.log(`Created .forge/ directory at ${forgeDir}`);
  console.log("  - config.yaml");
  console.log("  - .forgeignore");
  if (options.yes) console.log("  - forge.config.ts");
  console.log("  - reports/");
  console.log("  - debug/");
  console.log("\nRun 'forge --help' to get started.");
}