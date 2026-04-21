import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = join(__dirname, "..", "dist", "src", "index.js");

try {
  const content = readFileSync(cliPath, "utf8");
  if (!content.startsWith("#!")) {
    writeFileSync(cliPath, "#!/usr/bin/env node\n" + content, "utf8");
    console.log("fix-shebang: prepended shebang to dist/src/index.js");
  } else {
    console.log("fix-shebang: shebang already present in dist/src/index.js");
  }
} catch (err) {
  if (err.code === "ENOENT") {
    console.error("fix-shebang: dist/src/index.js not found — run build first");
    process.exit(1);
  }
  throw err;
}