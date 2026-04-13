# Domain Context Enrichment for Intake and Plan

## The Problem

Forge's Steps 1-4 are designed deterministic-first — AI is optional, not in the critical path. This works well for structural tasks like parsing specs, mapping dependencies, and building verification cases.

**But there's a gap:** Forge doesn't understand *what a codebase is about* — only its structure.

### Intake Gap

Running `forge intake` on a new repo with just a spec:

```bash
forge intake --spec "add maritime conflict tracking"
```

Forge sees:
- File tree, languages, package manager
- `src/globe/`, `src/feeds/`, `src/api/`
- TypeScript, Python, React

Forge has **no idea** this is TerraWatch — a real-time plane/ship tracking globe with ADS-B and AIS feeds. It can map spec requirements to files structurally, but it can't reason about:
- Why the architecture is the way it is
- What domain concepts mean (ADS-B, AIS, GEOINT)
- Key patterns and conventions unique to this codebase
- Implicit relationships between components

### Plan Gap

Similarly, `forge plan` builds a dependency graph and assigns parallelization signals — all structural reasoning. But generating a *good* plan for a complex task requires understanding:
- The problem domain deeply
- What "done" looks like for this kind of change
- What patterns the codebase expects new code to follow
- Risk assessment beyond file conflicts

---

## The Solution: Domain Context Enrichment

Two-layer approach:

1. **Domain Scan** — Before intake builds its artifact, an LLM scans the codebase and produces structured domain knowledge
2. **Enriched Intake** — The domain knowledge feeds into intake, producing richer context
3. **Plan Assist** — Plan uses the enriched context to generate better recommendations

### Flag: `--with-context`

```bash
forge intake --spec task.md --with-context
```

This is **additive and optional** — like `--llm-assist`:
- Users who want better plans use `--with-context`
- Users who want speed/determinism skip it
- Forge's deterministic-first philosophy stays intact

---

## Architecture

### Domain Scan (pre-intake phase)

When `--with-context` is passed, Forge runs a domain scan before intake:

```
forge intake --spec task.md --with-context
│
├── [1] DOMAIN SCAN (LLM)
│   │   Reads: All source files, README, package structure
│   │   Produces: domain.json
│   │
│   ▼
├── [2] INTAKE (deterministic + enriched)
│   │   Reads: spec.md + domain.json
│   │   Produces: intake.json (with richer context)
│   │
│   ▼
├── [3] PLAN (deterministic + enriched)
│       Reads: intake.json + domain.json
│       Produces: plan.json (with domain-aware recommendations)
```

### Domain Artifact

```json
// .forge/domain.json
{
  "schemaVersion": "1.0",
  "project": {
    "name": "TerraWatch",
    "description": "Real-time GEOINT visualization platform tracking aircraft and vessels globally",
    "domain": "Defense/Intelligence, Maritime/Aerial Tracking, OSINT",
    "architecture": "3D globe with WebSocket feed ingestion, separate backend/frontend"
  },
  "keyConcepts": {
    "ADS-B": "Automatic Dependent Surveillance-Broadcast — plane position broadcast",
    "AIS": "Automatic Identification System — ship position broadcast",
    "GEOINT": "Geospatial Intelligence"
  },
  "dataSources": {
    "feeds": {
      "planes": "OpenSky Network (ADS-B), ADSB.lol",
      "ships": "Digitraffic (AIS), aisstream.io"
    },
    "protocols": ["WebSocket", "REST"]
  },
  "codebasePatterns": {
    "frontend": "React + deck.gl for globe rendering",
    "backend": "FastAPI with WebSocket endpoints",
    "data": "TypeScript interfaces for plane/ship entities"
  },
  "conventions": {
    "fileNaming": "kebab-case",
    "errorHandling": "Result type pattern with error fields",
    "apiStyle": "REST + WebSocket for real-time"
  },
  "entryPoints": {
    "frontend": "src/globe/App.tsx",
    "backend": "src/api/main.py"
  }
}
```

---

## Domain Scan Implementation

```typescript
// src/intake/domain-scanner.ts
export interface DomainScanOptions {
  repoRoot: string;
  specPath?: string;  // Optional: if spec mentions specific areas, prioritize those
  outputRoot: string;
}

export async function runDomainScan(options: DomainScanOptions): Promise<DomainArtifact> {
  // 1. Collect source files
  const sourceFiles = await collectSourceFiles(options.repoRoot);
  
  // 2. Read key files for context
  const readme = await readFile(path.join(options.repoRoot, "README.md"), "utf-8");
  const packageJson = await readFile(path.join(options.repoRoot, "package.json"), "utf-8");
  
  // 3. Read representative source files (top 20 by importance)
  const keyFiles = await selectKeyFiles(sourceFiles, { max: 20 });
  
  // 4. Build LLM prompt
  const prompt = buildDomainScanPrompt({
    projectName: extractProjectName(readme),
    description: extractDescription(readme),
    keyFiles,
    packageJson,
  });
  
  // 5. Call LLM with prompt
  const response = await callLLM(prompt);
  
  // 6. Parse and structure response
  const domainArtifact = parseDomainArtifact(response);
  
  // 7. Persist
  await writeFile(path.join(options.outputRoot, "domain.json"), JSON.stringify(domainArtifact, null, 2));
  
  return domainArtifact;
}

function buildDomainScanPrompt(params: {
  projectName: string;
  description: string;
  keyFiles: FileContent[];
  packageJson: string;
}): string {
  return `You are analyzing a codebase to extract domain knowledge.
  
Project: ${params.projectName}
Description: ${params.description}

Package.json:
${params.packageJson}

Key source files:
${params.keyFiles.map((f) => `\n--- ${f.path} ---\n${f.content.slice(0, 2000)}`).join("\n")}

Extract structured domain knowledge including:
1. Project purpose and domain (defense, commerce, etc.)
2. Key domain concepts and terminology
3. Architecture patterns used
4. Data flow patterns
5. Coding conventions
6. Important entry points and APIs

Return a JSON artifact matching this schema:
{
  "project": { "name", "description", "domain", "architecture" },
  "keyConcepts": { [term]: definition },
  "codebasePatterns": { frontend, backend, data },
  "conventions": { fileNaming, errorHandling, apiStyle },
  "entryPoints": { [component]: path }
}`;
}
```

---

## Enriched Intake

With `--with-context`, intake reads `domain.json` and uses it to:

1. **Better candidate selection** — Prioritize files related to domain concepts mentioned in the spec
2. **Deeper risk analysis** — Understand which changes are high-risk in this domain
3. **Improved ambiguity detection** — Domain terms in spec might need clarification
4. **Domain-specific warnings** — e.g., "changing feed protocol affects all data sources"

```typescript
// src/intake/enricher.ts
export function enrichWithDomainContext(
  intake: IntakeArtifact,
  domain: DomainArtifact
): IntakeArtifact {
  return {
    ...intake,
    domainContext: {
      projectName: domain.project.name,
      keyConcepts: domain.keyConcepts,
      conventions: domain.conventions,
    },
    enrichedWarnings: [
      ...intake.warnings,
      ...inferDomainWarnings(intake.taskSpec, domain),
    ],
    enrichedRiskZones: [
      ...intake.riskZones,
      ...inferDomainRiskZones(intake.taskSpec, domain),
    ],
  };
}
```

---

## Plan Assist

The enriched context also flows into plan:

```typescript
// src/plan/enricher.ts
export function enrichPlanWithDomainContext(
  plan: PlanArtifact,
  domain: DomainArtifact
): PlanArtifact {
  return {
    ...plan,
    planItems: plan.planItems.map((item) => ({
      ...item,
      domainRelevance: assessDomainRelevance(item, domain),
      riskExplanation: explainRiskInDomainContext(item, domain),
    })),
    domainAwareRecommendations: generateRecommendations(plan, domain),
  };
}
```

---

## Key Insight: Determinism Preserved

**The deterministic-first philosophy stays intact:**

- **Intake without `--with-context`:** Fully deterministic — same inputs, same output
- **Intake with `--with-context`:** LLM produces domain context, but intake itself still deterministic
- **Plan:** Same — deterministic structure, optional LLM enrichment via `--llm-assist`

The AI is **additive enrichment**, not changing the core deterministic behavior. You can always run without AI and get reproducible results.

---

## What This Enables

Without domain enrichment:
```
forge intake --spec "add conflict detection"
→ PlanItem: implement conflict detection
→ candidateFiles: [any file with "detection" in name]
→ Risk: medium (generic)
```

With domain enrichment:
```
forge intake --spec "add conflict detection"
→ PlanItem: implement ACLED conflict event ingestion + correlation with vessel positions
→ candidateFiles: [src/feeds/ais.ts, src/api/geoint.ts, src/db/conflicts.ts]
→ Risk: high (requires GDELT API integration + geospatial correlation)
→ Domain warnings: "GDELT has rate limits — consider caching strategy"
```

---

## Implementation Checklist

- [ ] Define `DomainArtifact` schema in `src/intake/domain-schema.ts`
- [ ] Implement `runDomainScan()` in `src/intake/domain-scanner.ts`
- [ ] Implement `enrichWithDomainContext()` in `src/intake/enricher.ts`
- [ ] Wire `--with-context` flag into intake CLI
- [ ] Persist `domain.json` to `.forge/domain.json`
- [ ] Update plan to read `domain.json` for enriched recommendations
- [ ] Add `--with-context` to plan CLI as well
- [ ] Write tests for domain scan (deterministic output given same source)
- [ ] Document in `docs/domain-context.md`
