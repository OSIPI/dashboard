#!/bin/sh
set -eu

export OSIPY_API_PORT=60016
if [ -z "${OSIPY_API_CORS_ORIGINS:-}" ]; then
	OSIPY_API_CORS_ORIGINS='["https://osipi.github.io","http://localhost:60010","http://127.0.0.1:60010","http://localhost:60014","http://127.0.0.1:60014"]'
fi
export OSIPY_API_CORS_ORIGINS
python - <<'PY'
import os

pink = "\033[95m" if "NO_COLOR" not in os.environ else ""
coral = "\033[91m" if "NO_COLOR" not in os.environ else ""
bold = "\033[1m" if "NO_COLOR" not in os.environ else ""
reset = "\033[0m" if "NO_COLOR" not in os.environ else ""
logo = (
    "         ⣠⣴⣶⣶⣦⡀",
    "        ⢰⣿⠋⠁⠈⢻⣿⡆",
    "        ⢸⣿  ⢀⣸⣿⠇",
    " ⢀⣴⣾⡿⠿⠿⠇⢸⣿⠸⠿⠿⠟⠃",
    "⢠⣿⡟⠁    ⢸⣿",
    "⢸⣿⡀     ⣼⣿",
    "⠈⢿⣷⣄⣀⢀⣀⣴⣿⠃",
    "  ⠙⠻⠿⠿⠿⠛⠁",
)
width = 43
border = "═" * (width + 4)

def row(text=""):
    return f"║  {text:<{width}}  ║"

print("OSIPY REST API: http://127.0.0.1:60016", flush=True)
for index, line in enumerate(logo):
    print(f"{pink if index < 4 else coral}{line}{reset}" + (f"  {bold}OSIPY{reset}" if index == 3 else ""))
print(f"\n{pink}╔{border}╗{reset}")
print(row("OSIPY LOCAL FITTING — STARTING"))
print(row())
print(row("API READY ON LOOPBACK PORT 60016"))
print(f"{pink}╚{border}╝{reset}\n")
print("Connect from Local analysis at https://osipi.github.io/dashboard/")
print("Publish Docker port 60016 on 127.0.0.1 only.")
print("Input/results are in memory and discarded when this container stops.")
print("Press Ctrl+C to stop; Docker --rm removes this container.\n", flush=True)
PY
exec uvicorn osipy_rest_api.main:app --host 0.0.0.0 --port 60016
