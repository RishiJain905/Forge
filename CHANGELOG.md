# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.2] - 2026-04-21

### Fixed
- `execute.model-connector` tests: isolate model-related env vars so a host `OLLAMA_API_KEY` does not break expectations.
- npm packaging contract test: assert `1.x.y` semver instead of a pinned patch version.

## [1.0.0] - 2026-04-21

### Added
- `forge intake` — Task specification and repo analysis
- `forge plan` — Planning from intake artifacts
- `forge verify` — Structural and formal verification (TLA+)
- `forge split` — Workstream partitioning
- `forge execute` — Parallel workstream execution with AI integration
- `forge integrate` — Test generation and integration
- `forge init` — Initialize Forge in a repository
- `forge doctor` — Pre-flight environment checks
- `forge update` — Self-update functionality
- `forge config` — Configuration management with env var support
- Docker support with multi-stage Dockerfile
- GitHub Actions integration
- npm packaging as `@forgecli/forge`
