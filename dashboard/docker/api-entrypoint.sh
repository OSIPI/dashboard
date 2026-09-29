#!/bin/sh
set -eu

if [ -z "${OSIPY_API_SESSION_TOKEN:-}" ]; then
	OSIPY_API_SESSION_TOKEN="$(python -c 'import secrets; print(secrets.token_urlsafe(32))')"
	export OSIPY_API_SESSION_TOKEN
fi
export OSIPY_API_PORT=60016
if [ -z "${OSIPY_API_CORS_ORIGINS:-}" ]; then
	OSIPY_API_CORS_ORIGINS='["https://osipi.github.io","http://localhost:60010","http://127.0.0.1:60010","http://localhost:60014","http://127.0.0.1:60014"]'
fi
export OSIPY_API_CORS_ORIGINS
printf 'Local OSIPY REST API token: %s\n' "$OSIPY_API_SESSION_TOKEN"
exec uvicorn osipy_rest_api.main:app --host 0.0.0.0 --port 60016
