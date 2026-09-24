.PHONY: dev

FRONTEND_PORT ?= 60010
COMPANION_PYTHON ?= ../../osipy/.venv/bin/python

dev:
	@test -x "$(COMPANION_PYTHON)" || { echo "OSIPY Python not found at $(COMPANION_PYTHON). See companion/README.md"; exit 1; }
	@$(COMPANION_PYTHON) -c 'import sys; sys.path.insert(0, "companion"); from core import model_catalog; model_catalog()' || { echo "Companion dependencies unavailable. See companion/README.md"; exit 1; }
	@echo "Starting dashboard on http://localhost:$(FRONTEND_PORT) and local OSIPY companion"
	@$(COMPANION_PYTHON) companion/server.py & companion=$$!; \
		trap 'kill $$companion 2>/dev/null || true; wait $$companion 2>/dev/null || true' EXIT; \
		sleep 1; kill -0 $$companion 2>/dev/null || { echo "Companion failed to start"; exit 1; }; \
		FRONTEND_PORT=$(FRONTEND_PORT) docker compose up frontend
