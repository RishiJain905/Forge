# Task 2: Docker Integration

## Goal

Add Dockerfile and docker-compose.yml so Forge can run in a container, enabling CI/CD and cloud-native usage.

## Context

Read these first:
- `future_idea_implementation/step7-deploy.md` — Design reference (lines 312-339)
- `package.json` — Build output (dist/)

## What To Do

### 1. Create `Dockerfile`

```dockerfile
# Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Remove dev dependencies
RUN npm prune --omit=dev

FROM node:20-alpine
WORKDIR /app

# Install git for Forge's git-aware features
RUN apk add --no-cache git curl

# Copy built artifacts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules

# Set up non-root user for security
RUN addgroup -g 1001 -S forge && \
    adduser -S forge -u 1001 -G forge
USER forge

# Create .forge directory for config
WORKDIR /home/forge

ENTRYPOINT ["node", "dist/cli.js"]
```

### 2. Create `docker-compose.yml`

```yaml
# docker-compose.yml
version: "3.9"

services:
  forge:
    image: forge:latest
    build:
      context: .
      dockerfile: Dockerfile
    volumes:
      - .:/repo
      - forge-data:/home/forge/.forge
    environment:
      - FORGE_OPENAI_API_KEY=${FORGE_OPENAI_API_KEY}
      - FORGE_ANTHROPIC_API_KEY=${FORGE_ANTHROPIC_API_KEY}
      - FORGE_MODEL=${FORGE_MODEL:-openai/gpt-4o}
      - FORGE_LOG_LEVEL=${FORGE_LOG_LEVEL:-info}
      - FORGE_EXECUTE_PARALLEL=${FORGE_EXECUTE_PARALLEL:-true}
      - FORGE_MAX_WORKSTREAMS=${FORGE_MAX_WORKSTREAMS:-10}
    working_dir: /repo
    command: --help

volumes:
  forge-data:
```

### 3. Create `.dockerignore`

```dockerignore
# Git
.git
.gitignore

# Dependencies
node_modules/

# Build outputs
dist/

# Forge data (don't copy into image)
.forge/
*.log

# IDE
.vscode/
.idea/
*.swp

# OS
.DS_Store
Thumbs.db

# Test
coverage/
*.test.*
*.spec.*

# Documentation
*.md
docs/
```

### 4. Create a `docker` directory with a Makefile for convenience

```makefile
# docker/Makefile
.PHONY: build run clean

IMAGE := forge
TAG := latest

build:
	docker build -t $(IMAGE):$(TAG) .

run:
	docker run --rm \
		-v $$(pwd):/repo \
		-v forge-data:/home/forge/.forge \
		-e FORGE_OPENAI_API_KEY \
		$(IMAGE):$(TAG) $(CMD)

build-and-plan: build
	docker run --rm \
		-v $$(pwd):/repo \
		-v forge-data:/home/forge/.forge \
		-e FORGE_OPENAI_API_KEY \
		$(IMAGE):$(TAG) plan --spec .forge/task-spec.yaml --repo /repo

clean:
	docker rmi $(IMAGE):$(TAG) || true
	docker volume rm forge-data 2>/dev/null || true
```

## Verification

- `docker build -t forge .` builds successfully
- `docker run --rm forge --version` prints correct version
- `docker run --rm forge --help` shows all commands
- `docker-compose up` starts the container
- Docker image size is reasonable (<500MB)
- Non-root user is used in the final image

## Files Created

- `Dockerfile` — Multi-stage build for Forge CLI
- `docker-compose.yml` — Docker Compose setup
- `.dockerignore` — Docker ignore patterns
- `docker/Makefile` — Convenience Makefile for docker commands

## Non-Goals

- Do not include OpenAI/Anthropic API keys in the image
- Do not run Forge as root in the container
- Do not copy `.forge/` into the image (use volumes for persistence)
- Do not provide a pre-built image on Docker Hub (that's a publishing decision)
