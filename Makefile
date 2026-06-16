.PHONY: dev

FRONTEND_PORT ?= 37183

dev:
	@echo "Starting dashboard on http://localhost:$(FRONTEND_PORT)"
	@FRONTEND_PORT=$(FRONTEND_PORT) docker compose up frontend
