# Bundled TLC (`tla2tools.jar`) with the Forge npm package

This document describes **Idea 1**: ship the TLA+ tools JAR inside `@forgecli/forge` so `forge verify` can run TLC **without** users manually downloading a jar or setting `FORGE_TLC_JAR_PATH`, while keeping a clear story for licensing, upgrades, and the Java runtime.

**Status:** Future / design only — no implementation commitment in this file.

**Upstream project:** [tlaplus/tlaplus](https://github.com/tlaplus/tlaplus) — TLA+ parser, TLC model checker, and related CLI tools. The repository README states the tools are **MIT licensed** and that **`tla2tools.jar`** is the standard command-line distribution (multiple tools in one jar; `java tlc2.TLC` for TLC). Forge today already integrates with TLC by spawning Java with a classpath pointing at that jar when `FORGE_TLC_JAR_PATH` is set (see `src/verify/formal.ts` and `FORGE_TLC_JAR_PATH` in `src/verify/constants.ts`).

---

## 1. Goals

| Goal | Detail |
|------|--------|
| **Zero-config TLC for npm installs** | After `npm i -g @forgecli/forge` (or local `npm install`), `forge verify` can run TLC when the formal lane selects cases, without the user hunting for a jar. |
| **License compatibility** | Rely on upstream **MIT** terms from [tlaplus/tlaplus](https://github.com/tlaplus/tlaplus); reproduce copyright and license text in Forge’s `NOTICE` or third-party attributions as required by MIT. |
| **Predictable versions** | Pin a **specific** `tla2tools.jar` version (e.g. from a named [GitHub Release](https://github.com/tlaplus/tlaplus/releases)) so support and bug reports are reproducible. |
| **Override path** | Power users, air-gapped CI, or newer TLC builds can still set **`FORGE_TLC_JAR_PATH`** to override the bundled jar (current behavior: explicit env wins). |

Non-goals for v1 of this idea:

- Bundling the **TLA+ Toolbox** (Eclipse IDE) or replacing VS Code TLA+ workflows.
- Shipping a **JVM** — users still need **Java 11+** on `PATH` (same as upstream; see [tlaplus/tlaplus README](https://github.com/tlaplus/tlaplus)).

---

## 2. Why bundle (and why be careful)

### Benefits

- **Lower friction:** Most developers never configure `FORGE_TLC_JAR_PATH`; formal lane stops at “TLC not run.”
- **CI parity:** GitHub Actions jobs get TLC without a separate “download tla2tools” step (still need `actions/setup-java` or equivalent).
- **Determinism:** One known TLC build per Forge release reduces “works on my machine” TLC skew.

### Costs and risks

| Risk | Mitigation idea |
|------|------------------|
| **npm package size** | `tla2tools.jar` is large relative to a tiny CLI; monitor `npm pack` / `npm view @forgecli/forge dist unpackedSize`; consider optional `@forgecli/forge-tlc` package if size becomes unacceptable. |
| **Security / supply chain** | Vendor jar only from **official** [tlaplus/tlaplus releases](https://github.com/tlaplus/tlaplus/releases); store **SHA-256** in repo; verify in `prepublishOnly` or a `scripts/vendor-tlc.mjs` gate; document upgrade procedure. |
| **Release coupling** | Forge patch releases should not silently jump TLC minor versions without changelog entry; pin jar version in `package.json` or `vendor/tlc-version.json`. |
| **Java not installed** | Clear error when TLC is invoked: “Java 11+ required”; link to Adoptium / Oracle docs; `forge doctor` could optionally check `java -version`. |
| **Platform assumptions** | Jar is JVM bytecode — same jar across OSes; no native addon. |

---

## 3. Licensing and attribution (MIT)

The [tlaplus/tlaplus](https://github.com/tlaplus/tlaplus) repository declares **MIT License** in its GitHub metadata and README; copyright holders are listed in their `LICENSE` file (HP, Microsoft, Linux Foundation per their README summary).

**Forge obligations when redistributing the jar:**

1. **Include a copy of the MIT license text** that applies to `tla2tools.jar` (or the full third-party notice file listing TLA+ Tools).
2. **Include copyright notices** from upstream’s `LICENSE` / notice files as MIT requires.
3. **Do not remove** existing license headers inside the jar if policy requires preserving them (usually the jar is shipped as-is).
4. **Document** in Forge’s main `README` or `NOTICE`: “This distribution includes TLA+ Tools (`tla2tools.jar`) from the TLA+ project (MIT). Source: https://github.com/tlaplus/tlaplus.”

This is standard MIT redistribution hygiene and aligns with the user’s “we are good” assumption **provided** attribution is done correctly—**MIT does not waive the notice requirement**.

---

## 4. Proposed layout in the Forge repo

```
vendor/
  tla2tools/
    README.md              # Pinning instructions + upstream URL + checksum
    tla2tools.jar          # Binary (git-lfs or fetch script — see §6)
  tlc-version.json         # { "version": "…", "source": "github:tlaplus/tlaplus@…", "sha256": "…" }
```

**`package.json` `files` array** must include the vendor path so `npm publish` ships the jar:

```json
"files": ["dist", "scripts/postinstall-init.mjs", "vendor/tla2tools/tla2tools.jar"]
```

(Exact paths depend on where the team places the jar.)

---

## 5. Runtime resolution order (conceptual)

When `forge verify` decides TLC should run:

1. If **`process.env.FORGE_TLC_JAR_PATH`** is set and non-empty → use it (today’s behavior; **user wins**).
2. Else if **bundled jar** exists next to the installed package (e.g. `path.join(dirname(packageJson), 'vendor/tla2tools/tla2tools.jar')`) → use that path.
3. Else → current behavior: TLC not run; summary explains missing jar.

Implementation detail: resolve the package root via `import.meta.url` / `fileURLToPath` from a known module (e.g. `src/verify/constants.ts` or a tiny `tlc-path.ts`) so global `npm install -g` and local `node_modules` both work.

---

## 6. How the jar gets into the repo (two viable models)

### Model A — Committed binary (simplest operationally)

- Add `vendor/tla2tools/tla2tools.jar` to the repo.
- **Git LFS** recommended if the team wants to avoid bloating raw git history for clones that never need TLC.
- Pros: Reproducible offline builds. Cons: LFS setup; repo weight.

### Model B — Fetch at build / prepublish (smaller git)

- Add `scripts/vendor-tlc.mjs` that downloads a pinned release asset from GitHub, verifies SHA-256, writes `vendor/tla2tools/tla2tools.jar`.
- Wire `prepublishOnly` to `npm run build && node scripts/vendor-tlc.mjs` **or** require maintainers to run `npm run vendor:tlc` before publish.
- Pros: Git stays smaller. Cons: Network during release; must lock URL and hash.

**Recommendation:** Model B for open-source clones; Model A + LFS if the team wants fully offline `npm publish` from a clean checkout without a fetch step.

---

## 7. Version pinning and upgrades

1. **Pin** to a specific upstream tag (e.g. release name from [Releases](https://github.com/tlaplus/tlaplus/releases)).
2. Record in `vendor/tlc-version.json`:
   - `upstreamTag` or `releaseUrl`
   - `sha256` of the jar
   - `forgeReleaseNote`: “TLC bumped to …”
3. **Upgrade policy:** align TLC bumps with **minor** Forge releases unless a security fix forces a patch; document in `CHANGELOG.md`.

---

## 8. `forge doctor` (optional enhancement)

Extend `forge doctor` to report:

- Java on PATH and version ≥ 11.
- Whether bundled TLC jar is present and readable.
- Whether `FORGE_TLC_JAR_PATH` overrides the bundle.

This reduces support load when TLC still does not run (wrong Java, corrupted jar, antivirus blocking read).

---

## 9. Testing strategy (high level)

| Test | Purpose |
|------|--------|
| Unit / integration | When bundled path exists (fixture jar or temp copy), `forge verify` formal path invokes Java with expected `-cp` / `tlc2.TLC` args (can mock spawn). |
| CI matrix | Job with `setup-java` + Forge build verifies at least one TLC run in a controlled fixture repo. |
| Size regression | Script fails if unpacked npm tarball exceeds N MB (optional). |

Existing tests under `tests/verify.*` may already assume TLC optional; extend with a **“bundled jar present”** fixture without requiring real TLC in every developer machine.

---

## 10. Documentation updates (when implemented)

- **`README.md`:** Formal verification section — explain bundled jar, Java 11+, override via `FORGE_TLC_JAR_PATH`, link to [tlaplus/tlaplus](https://github.com/tlaplus/tlaplus).
- **`NOTICE` or `THIRD_PARTY_NOTICES.md`:** Full MIT text + copyright for bundled `tla2tools.jar`.
- **`docs/docker.md`** (if applicable): Docker image can install OpenJDK + copy bundled jar into image for parity.

---

## 11. Rollout phases (suggested)

| Phase | Deliverable |
|-------|-------------|
| **0** | This design doc + legal review checklist (MIT notices). |
| **1** | Vendor script + checksum gate; jar included in `npm pack`; resolution order in code (env overrides bundle). |
| **2** | Doctor checks + CI job running TLC on a tiny spec. |
| **3** | Optional split: `@forgecli/forge-slim` without jar if npm size complaints dominate (larger ecosystem change). |

---

## 12. Open questions

1. **npm unpacked size budget** — What is the maximum acceptable size for `@forgecli/forge`?
2. **Air-gapped installs** — Is Model A (committed jar) mandatory for some users?
3. **Alpine / musl** — Only Java matters for the jar; any edge cases with `java` binary names on minimal images?
4. **Windows long paths** — Rare TLC temp paths; worth a smoke test on Windows CI.

---

## 13. References

- TLA+ Tools source and releases: [https://github.com/tlaplus/tlaplus](https://github.com/tlaplus/tlaplus)
- Upstream use notes (`tla2tools.jar`, Java 11+, `java tlc2.TLC`): same repository README and `USE.md` linked from that repo.
- Forge current env contract: `FORGE_TLC_JAR_PATH` (`src/verify/constants.ts`).

---

## 14. Summary

Bundling **`tla2tools.jar`** from the **MIT-licensed** [tlaplus/tlaplus](https://github.com/tlaplus/tlaplus) project is feasible and aligns with Forge’s existing TLC integration: ship the jar under `vendor/`, include it in the npm `files` list, resolve a default classpath before falling back to “TLC not run,” and keep **`FORGE_TLC_JAR_PATH`** as the override. The remaining hard requirement is **Java 11+** on the user machine; the remaining **project** requirement is correct **MIT attribution** and a disciplined **pin + checksum** process for the vendored binary.
