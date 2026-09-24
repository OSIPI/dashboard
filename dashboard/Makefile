.PHONY: dev

FRONTEND_PORT ?= 60010
COMPANION_PYTHON ?= ../../osipy/.venv/bin/python

dev:
	@test -x "$(COMPANION_PYTHON)" || { echo "OSIPY Python not found at $(COMPANION_PYTHON). See companion/README.md"; exit 1; }
	@$(COMPANION_PYTHON) -c 'import sys; sys.path.insert(0, "companion"); from core import model_catalog; model_catalog()' || { echo "Companion dependencies unavailable. See companion/README.md"; exit 1; }
	@$(COMPANION_PYTHON) -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", $(FRONTEND_PORT))); s.close()' 2>/dev/null || { echo "Port $(FRONTEND_PORT) is in use. Stop the previous dashboard server or Docker Compose before running make dev."; exit 1; }
	@bun install --frozen-lockfile
	@echo "Starting dashboard on http://localhost:$(FRONTEND_PORT) and local OSIPY companion"
	@token=`$(COMPANION_PYTHON) -c 'import secrets; print(secrets.token_urlsafe(32))'`; \
		OSIPY_DASHBOARD_TOKEN=$$token $(COMPANION_PYTHON) companion/server.py & companion=$$!; \
		trap 'kill $$companion 2>/dev/null || true; wait $$companion 2>/dev/null || true' EXIT; \
		attempts=0; ready=0; \
		while [ $$attempts -lt 20 ] && kill -0 $$companion 2>/dev/null; do \
			if OSIPY_DASHBOARD_TOKEN=$$token $(COMPANION_PYTHON) -c 'import os, urllib.request; urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:60016/models", headers={"Host": "127.0.0.1:60016", "Authorization": "Bearer " + os.environ["OSIPY_DASHBOARD_TOKEN"]}), timeout=1)' >/dev/null 2>&1; then ready=1; break; fi; \
			attempts=$$((attempts + 1)); sleep .25; \
		done; \
		[ $$ready -eq 1 ] || { echo "Companion did not start or port 60016 is in use"; exit 1; }; \
		OSIPY_DASHBOARD_TOKEN=$$token bun run dev -- --host 127.0.0.1 --port $(FRONTEND_PORT) --strictPort
