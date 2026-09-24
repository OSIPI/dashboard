.PHONY: dev stop

FRONTEND_PORT ?= 60010
COMPANION_PYTHON ?= ../../osipy/.venv/bin/python

dev:
	@test -x "$(COMPANION_PYTHON)" || { echo "OSIPY Python not found at $(COMPANION_PYTHON). See companion/README.md"; exit 1; }
	@$(COMPANION_PYTHON) -c 'import sys; sys.path.insert(0, "companion"); from core import model_catalog; model_catalog()' || { echo "Companion dependencies unavailable. See companion/README.md"; exit 1; }
	@$(COMPANION_PYTHON) -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", $(FRONTEND_PORT))); s.close()' 2>/dev/null || { echo "Port $(FRONTEND_PORT) is in use. Stop the previous dashboard server or Docker Compose before running make dev."; exit 1; }
	@bun install --frozen-lockfile
	@echo "Starting dashboard on http://localhost:$(FRONTEND_PORT) and local OSIPY companion"
	@token=`$(COMPANION_PYTHON) -c 'import secrets; print(secrets.token_urlsafe(32))'`; \
		OSIPY_DASHBOARD_TOKEN=$$token $(COMPANION_PYTHON) $(abspath companion/server.py) & companion=$$!; \
		frontend=; \
		trap 'test -z "$$frontend" || kill $$frontend 2>/dev/null || true; kill $$companion 2>/dev/null || true; test -z "$$frontend" || wait $$frontend 2>/dev/null || true; wait $$companion 2>/dev/null || true; rm -f .dev-pids' EXIT; \
		attempts=0; ready=0; \
		while [ $$attempts -lt 20 ] && kill -0 $$companion 2>/dev/null; do \
			if OSIPY_DASHBOARD_TOKEN=$$token $(COMPANION_PYTHON) -c 'import os, urllib.request; urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:60016/models", headers={"Host": "127.0.0.1:60016", "Authorization": "Bearer " + os.environ["OSIPY_DASHBOARD_TOKEN"]}), timeout=1)' >/dev/null 2>&1; then ready=1; break; fi; \
			attempts=$$((attempts + 1)); sleep .25; \
		done; \
		[ $$ready -eq 1 ] || { echo "Companion did not start or port 60016 is in use"; exit 1; }; \
		OSIPY_DASHBOARD_TOKEN=$$token $(abspath node_modules/.bin/vite) dev --host 127.0.0.1 --port $(FRONTEND_PORT) --strictPort & frontend=$$!; \
		umask 077; printf '%s\n%s\n%s\n%s\n' "$$companion" "$$frontend" "$$(ps -p $$companion -o lstart=)" "$$(ps -p $$frontend -o lstart=)" > .dev-pids; \
		wait $$frontend; status=$$?; [ $$status -eq 143 ] && exit 0; exit $$status

stop:
	@if [ ! -f .dev-pids ]; then echo "No tracked dashboard dev server to stop."; exit 0; fi; \
		{ IFS= read -r companion && IFS= read -r frontend && IFS= read -r companion_started && IFS= read -r frontend_started; } < .dev-pids || { echo "Invalid .dev-pids; refusing to stop processes."; exit 1; }; \
		case "$$companion:$$frontend" in *[!0-9:]*|:*|*:) echo "Invalid .dev-pids; refusing to stop processes."; exit 1;; esac; \
		[ -n "$$companion_started" ] && [ -n "$$frontend_started" ] || { echo "Invalid .dev-pids; refusing to stop processes."; exit 1; }; \
		companion_cmd=`ps -p "$$companion" -o command= 2>/dev/null || true`; \
		frontend_cmd=`ps -p "$$frontend" -o command= 2>/dev/null || true`; \
		case "$$companion_cmd" in *'$(abspath companion/server.py)'*) [ "$$(ps -p "$$companion" -o lstart=)" = "$$companion_started" ] && kill "$$companion" 2>/dev/null || true;; *) echo "Companion PID no longer belongs to this dashboard; skipping.";; esac; \
		case "$$frontend_cmd" in *'$(abspath node_modules/.bin/vite)'*'--port $(FRONTEND_PORT)'*) [ "$$(ps -p "$$frontend" -o lstart=)" = "$$frontend_started" ] && kill "$$frontend" 2>/dev/null || true;; *) echo "Frontend PID no longer belongs to this dashboard; skipping.";; esac; \
		rm -f .dev-pids; echo "Stopped tracked dashboard dev processes."
