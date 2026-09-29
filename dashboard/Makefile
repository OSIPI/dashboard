.PHONY: dev dev-prod stop

FRONTEND_PORT ?= 60010
API_PYTHON ?= ../rest-api/.venv/bin/python

dev:
	@test -x "$(API_PYTHON)" || { echo "REST API environment not found at $(API_PYTHON). Run uv sync in ../rest-api."; exit 1; }
	@$(API_PYTHON) -c 'import osipy_rest_api, uvicorn' || { echo "REST API dependencies unavailable. Run uv sync in ../rest-api."; exit 1; }
	@$(API_PYTHON) -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", $(FRONTEND_PORT))); s.close()' 2>/dev/null || { echo "Port $(FRONTEND_PORT) is in use. Stop the previous dashboard server or Docker Compose before running make dev."; exit 1; }
	@bun install --frozen-lockfile
	@echo "Starting dashboard on http://localhost:$(FRONTEND_PORT) and local OSIPY REST API"
	@token=`$(API_PYTHON) -c 'import secrets; print(secrets.token_urlsafe(32))'`; \
		OSIPY_API_SESSION_TOKEN=$$token OSIPY_API_PORT=60016 $(API_PYTHON) -m uvicorn osipy_rest_api.main:app --host 127.0.0.1 --port 60016 & api=$$!; \
		frontend=; \
		trap 'test -z "$$frontend" || kill $$frontend 2>/dev/null || true; kill $$api 2>/dev/null || true; test -z "$$frontend" || wait $$frontend 2>/dev/null || true; wait $$api 2>/dev/null || true; rm -f .dev-pids' EXIT; \
		attempts=0; ready=0; \
		while [ $$attempts -lt 40 ] && kill -0 $$api 2>/dev/null; do \
			if OSIPY_API_SESSION_TOKEN=$$token $(API_PYTHON) -c 'import os, urllib.request; urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:60016/health", headers={"Authorization": "Bearer " + os.environ["OSIPY_API_SESSION_TOKEN"]}), timeout=1)' >/dev/null 2>&1; then ready=1; break; fi; \
			attempts=$$((attempts + 1)); sleep .25; \
		done; \
		[ $$ready -eq 1 ] || { echo "REST API did not start or port 60016 is in use"; exit 1; }; \
		OSIPY_API_SESSION_TOKEN=$$token $(abspath node_modules/.bin/vite) dev --host 127.0.0.1 --port $(FRONTEND_PORT) --strictPort & frontend=$$!; \
		umask 077; printf '%s\n%s\n%s\n%s\n' "$$api" "$$frontend" "$$(ps -p $$api -o lstart=)" "$$(ps -p $$frontend -o lstart=)" > .dev-pids; \
		wait $$frontend; status=$$?; [ $$status -eq 143 ] && exit 0; exit $$status

dev-prod:
	@env -u OSIPY_API_SESSION_TOKEN -u OSIPY_LOCAL_API_PROXY sh -c 'bun install --frozen-lockfile && bun scripts/assert_sample_free.ts static && bun run build && bun scripts/assert_sample_free.ts build && bun run preview -- --host 127.0.0.1 --port 60014 --strictPort'

stop:
	@if [ ! -f .dev-pids ]; then echo "No tracked dashboard dev server to stop."; exit 0; fi; \
		{ IFS= read -r api && IFS= read -r frontend && IFS= read -r api_started && IFS= read -r frontend_started; } < .dev-pids || { echo "Invalid .dev-pids; refusing to stop processes."; exit 1; }; \
		case "$$api:$$frontend" in *[!0-9:]*|:*|*:) echo "Invalid .dev-pids; refusing to stop processes."; exit 1;; esac; \
		[ -n "$$api_started" ] && [ -n "$$frontend_started" ] || { echo "Invalid .dev-pids; refusing to stop processes."; exit 1; }; \
		api_cmd=`ps -p "$$api" -o command= 2>/dev/null || true`; \
		frontend_cmd=`ps -p "$$frontend" -o command= 2>/dev/null || true`; \
		case "$$api_cmd" in *'$(API_PYTHON) -m uvicorn osipy_rest_api.main:app --host 127.0.0.1 --port 60016'*) [ "$$(ps -p "$$api" -o lstart=)" = "$$api_started" ] && kill "$$api" 2>/dev/null || true;; *) echo "REST API PID no longer belongs to this dashboard; skipping.";; esac; \
		case "$$frontend_cmd" in *'$(abspath node_modules/.bin/vite)'*'--port $(FRONTEND_PORT)'*) [ "$$(ps -p "$$frontend" -o lstart=)" = "$$frontend_started" ] && kill "$$frontend" 2>/dev/null || true;; *) echo "Frontend PID no longer belongs to this dashboard; skipping.";; esac; \
		rm -f .dev-pids; echo "Stopped tracked dashboard dev processes."
