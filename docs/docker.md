# Using Forge with Docker

This guide covers building and running the Forge CLI inside a Docker container.

## Quick Start — `docker build` and `docker run` examples

Build the image from the repo root (where the `Dockerfile` is expected to live):

```bash
cd docker
make build
```

Run an arbitrary Forge command via the `CMD` variable:

```bash
cd docker
make run CMD="doctor --checks node,git,npm,config"
```

Or build and run a `plan` in one step:

```bash
cd docker
make build-and-plan
```

## Docker Compose — `docker-compose up` example

Create the following `docker-compose.yml` next to the `Dockerfile` (repo root):

```yaml
version: "3.9"
services:
  forge:
    build: .
    image: forge:latest
    container_name: forge
    volumes:
      - .:/repo
      - forge-data:/home/forge/.forge
    environment:
      - OPENAI_API_KEY
      - ANTHROPIC_API_KEY
    command: ["doctor", "--checks", "node,git,npm,config"]

volumes:
  forge-data:
```

Run with:

```bash
docker-compose up forge
```

Override the command inline:

```bash
docker-compose run --rm forge plan --repo /repo --output-dir /repo/.forge
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes (for OpenAI models) | API key for OpenAI. Pass `--env OPENAI_API_KEY` or set in host env. |
| `ANTHROPIC_API_KEY` | Yes (for Anthropic models) | API key for Anthropic. Pass `--env ANTHROPIC_API_KEY` or set in host env. |
| `FORGE_*` | Optional | Any environment variable prefixed with `FORGE_` can be forwarded if the CLI or plugins consume it. |

All sensitive keys are read **at runtime** from the host environment and are **not** baked into the image.

## Volume Mapping

| Host path | Container path | Purpose |
|-----------|----------------|---------|
| `.` (repo root) | `/repo` | Mount the current repository as the working directory so Forge can analyze it. |
| `forge-data` (named volume) | `/home/forge/.forge` | Persistent storage for Forge state, caches, and generated artifacts across runs. |

The named volume `forge-data` survives container restarts and must be explicitly removed (see `make clean`).

## Makefile Targets

| Target | Purpose |
|--------|---------|
| `make build` | Builds the `forge:latest` image using the `Dockerfile` in the parent directory. |
| `make run` | Runs a one-off container with repo and data volumes mounted. Set `CMD="..."` to pass a command. |
| `make build-and-plan` | Builds the image, then runs `forge plan --repo /repo --output-dir /repo/.forge`. |
| `make clean` | Removes the local image (`forge:latest`) and the `forge-data` named volume. Errors are ignored if they do not exist. |

## Security — non-root user `forge` in container

The container should run as a dedicated non-root user (`forge`). This limits the blast radius if the container is compromised and prevents generated files from being owned by `root` on the host mount. Ensure the `Dockerfile` includes a step such as:

```dockerfile
RUN useradd -m forge
USER forge
```

## Non-Goals

- **No pre-built image**: This repo does not publish an official Docker image to a registry. Build locally with `make build`.
- **No API keys baked into image**: `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` are never included in the image layers. They are injected at runtime via environment variables.
