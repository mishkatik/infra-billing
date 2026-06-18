.PHONY: help install dev build typecheck lint format check check-fix hooks test \
        db-up db-down db-logs migrate generate studio \
        docker-build docker-save docker-up docker-down \
        bump-patch bump-minor bump-major tag-release

IMAGE := infra-billing

# Default target
help:
	@echo "Infra Billing — make targets:"
	@echo "  install       - npm ci (install all workspaces)"
	@echo "  dev           - run backend + frontend in watch mode"
	@echo "  build         - build shared -> frontend -> backend"
	@echo "  typecheck     - tsc --noEmit across workspaces"
	@echo "  lint          - Biome lint (no writes)"
	@echo "  format        - Biome format --write (apply formatting)"
	@echo "  check         - Biome check (lint + format, no writes)"
	@echo "  check-fix     - Biome check --write (apply safe fixes + formatting)"
	@echo "  hooks         - install the git pre-commit hook (.githooks)"
	@echo "  test          - build + run backend unit tests (node --test)"
	@echo "  db-up         - start only the postgres service (compose)"
	@echo "  db-down       - stop the postgres service"
	@echo "  db-logs       - tail postgres logs"
	@echo "  migrate       - prisma migrate dev (apps/backend)"
	@echo "  generate      - prisma generate (apps/backend)"
	@echo "  studio        - open prisma studio"
	@echo "  docker-build  - build the production image locally"
	@echo "  docker-save   - build and save the image to $(IMAGE).tar.gz"
	@echo "  docker-up     - docker compose up -d (postgres + infra-billing)"
	@echo "  docker-down   - docker compose down"
	@echo "  bump-patch|minor|major - bump version (root + all workspaces in sync) and reinstall"
	@echo "  tag-release   - create and push a signed git tag"

install:
	npm ci

dev:
	npm run dev

build:
	npm run build

typecheck:
	npm run typecheck

lint:
	npm run lint

format:
	npm run format

check:
	npm run check

check-fix:
	npm run check:fix

# Install the Biome pre-commit hook (version-controlled in .githooks). Needs a git repo.
hooks:
	@git rev-parse --git-dir >/dev/null 2>&1 || { echo "Not a git repo — run 'git init' first."; exit 1; }
	@chmod +x .githooks/pre-commit
	@git config core.hooksPath .githooks
	@echo "Hooks installed: pre-commit runs 'biome check' on staged files (core.hooksPath=.githooks)."

test:
	npm run test

# ---- database (Postgres 17 via docker compose) ----------------------------
db-up:
	docker compose up -d infra-billing-db

db-down:
	docker compose stop infra-billing-db

db-logs:
	docker compose logs -f infra-billing-db

# Host → dockerized Postgres (published on 127.0.0.1). Built from .env's POSTGRES_* so host-side
# prisma commands work without .env's docker-internal host (infra-billing-db). DB must be up (db-up).
LOCAL_DATABASE_URL := $(shell [ -f .env ] && . ./.env; echo "postgresql://$$POSTGRES_USER:$$POSTGRES_PASSWORD@127.0.0.1:$${POSTGRES_HOST_PORT:-5432}/$$POSTGRES_DB?schema=public")

migrate:
	DATABASE_URL="$(LOCAL_DATABASE_URL)" npm run prisma:migrate -w @infra/backend

generate:
	npm run prisma:generate -w @infra/backend

studio:
	DATABASE_URL="$(LOCAL_DATABASE_URL)" npm run prisma:studio -w @infra/backend

# ---- docker ---------------------------------------------------------------
docker-build:
	@VERSION=$$(node -p "require('./package.json').version") && \
	docker build \
		--build-arg APP_VERSION=$$VERSION \
		--build-arg BUILD_TIME=$$(date -u +'%Y-%m-%dT%H:%M:%SZ') \
		--build-arg GIT_COMMIT=$$(git rev-parse HEAD 2>/dev/null || echo unknown) \
		-t $(IMAGE):$$VERSION -t $(IMAGE):latest .

docker-save: docker-build
	@VERSION=$$(node -p "require('./package.json').version") && \
	echo "Saving $(IMAGE):$$VERSION -> $(IMAGE).tar.gz..." && \
	docker save $(IMAGE):$$VERSION | gzip > $(IMAGE).tar.gz && \
	echo "Wrote $(IMAGE).tar.gz ($$(du -h $(IMAGE).tar.gz | cut -f1))"

docker-up:
	docker compose up -d

docker-down:
	docker compose down

# ---- versioning -----------------------------------------------------------
# Bump the root version, then sync all workspaces (backend/frontend/shared) to the same version,
# then refresh the lockfile. Workspaces are private/internal — only the root version drives the
# image tag / build-info; they're kept in sync just for clarity.
bump-patch: BUMP=patch
bump-minor: BUMP=minor
bump-major: BUMP=major
bump-patch bump-minor bump-major:
	@npm version $(BUMP) --no-git-tag-version >/dev/null
	@V=$$(node -p "require('./package.json').version"); \
	  npm version "$$V" --no-git-tag-version --workspaces --allow-same-version >/dev/null; \
	  echo "Bumped all packages to $$V"
	npm install

tag-release:
	@VERSION=$$(node -p "require('./package.json').version") && \
	echo "Creating signed tag for version $$VERSION..." && \
	git tag -s "$$VERSION" -m "Release $$VERSION" && \
	git push origin --follow-tags && \
	echo "Signed tag $$VERSION created and pushed"
