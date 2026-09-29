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
python - <<'PY'
import os

token = os.environ["OSIPY_API_SESSION_TOKEN"]
logo = (
    "         ⣠⣴⣶⣶⣦⡀",
    "        ⢰⣿⠋⠁⠈⢻⣿⡆",
    "        ⢸⣿  ⢀⣸⣿⠇",
    " ⢀⣴⣾⡿⠿⠿⠇⢸⣿⠸⠿⠿⠟⠃  OSIPY",
    "⢠⣿⡟⠁    ⢸⣿",
    "⢸⣿⡀     ⣼⣿",
    "⠈⢿⣷⣄⣀⢀⣀⣴⣿⠃",
    "  ⠙⠻⠿⠿⠿⠛⠁",
)
width = max(31, len(token))
border = "═" * (width + 4)

def row(text=""):
    return f"║  {text:<{width}}  ║"

print("OSIPY REST API: http://127.0.0.1:60016", flush=True)
print("\n".join(logo))
print(f"\n╔{border}╗")
print(row("OSIPY LOCAL FITTING — STARTING"))
print(row())
print(row("SESSION TOKEN — COPY BELOW:"))
print(row(token))
print(f"╚{border}╝\n")
print("Paste the token into Local analysis at https://osipi.github.io/dashboard/")
print("Keep the token private. Publish Docker port 60016 on 127.0.0.1 only.")
print("Input/results are in memory and discarded when this container stops.")
print("Press Ctrl+C to stop; Docker --rm removes this container.\n", flush=True)
PY
exec uvicorn osipy_rest_api.main:app --host 0.0.0.0 --port 60016
