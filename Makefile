.PHONY: dev release release-dry-run

FRONTEND_PORT ?= 60010

dev:
	@echo "Starting dashboard on http://localhost:$(FRONTEND_PORT)"
	@FRONTEND_PORT=$(FRONTEND_PORT) docker compose up frontend

release:
	bun scripts/release.ts

release-dry-run:
	bun scripts/release.ts --dry-run
