"""Run the static dashboard and its private companion with one in-memory credential."""

import os
import secrets
import signal
import subprocess
import sys
import time
import urllib.request

token = secrets.token_urlsafe(32)
environment = {**os.environ, "OSIPY_DASHBOARD_TOKEN": token}
processes = [
    subprocess.Popen([sys.executable, "companion/server.py"], env=environment),
]


def stop(_signal=None, _frame=None):
    for process in processes:
        if process.poll() is None:
            process.terminate()
    for process in processes:
        try:
            process.wait(timeout=6)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()


signal.signal(signal.SIGTERM, stop)
signal.signal(signal.SIGINT, stop)
try:
    for _ in range(80):
        if processes[0].poll() is not None:
            raise RuntimeError("OSIPY companion exited during startup")
        try:
            urllib.request.urlopen(
                urllib.request.Request(
                    "http://127.0.0.1:60016/models",
                    headers={"Authorization": "Bearer " + token},
                ),
                timeout=1,
            ).close()
            break
        except OSError:
            time.sleep(0.25)
    else:
        raise RuntimeError("OSIPY companion did not become ready")
    processes.append(subprocess.Popen([sys.executable, "docker/serve.py"], env=environment))
    while all(process.poll() is None for process in processes):
        time.sleep(0.25)
finally:
    stop()
sys.exit(1 if any(process.returncode not in (0, -signal.SIGTERM) for process in processes) else 0)
