"""Loopback-only authenticated analysis companion. Start with the OSIPY Python environment."""

from __future__ import annotations

import argparse
import hmac
import json
import multiprocessing
import os
import secrets
import signal
import shutil
import tempfile
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from queue import Empty
from urllib.parse import urlsplit

from core import (
    MAX_BYTES,
    job_process,
    model_catalog,
    result_bytes,
    unpack_dataset,
    utcnow,
    validate_config,
)


MAX_CACHED_DATASETS = 6
MAX_CACHED_DATASET_BYTES = 768 * 1024 * 1024


class Companion(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, port, token, origins, bind="127.0.0.1"):
        super().__init__((bind, port), Handler)
        self.token = token
        self.origins = set(origins)
        self.temp = tempfile.TemporaryDirectory(prefix="osipy-companion-")
        self.root = Path(self.temp.name)
        self.datasets = {}
        self.jobs = {}
        self.lock = threading.RLock()
        self.context = multiprocessing.get_context("spawn")

    @staticmethod
    def dataset_fingerprint(meta):
        return tuple(
            json.dumps(meta[key], sort_keys=True, separators=(",", ":"))
            for key in (
                "payloadSha256",
                "sha256",
                "dimensions",
                "dtype",
                "bValues",
                "affine",
                "slope",
                "intercept",
                "spatialUnit",
                "name",
            )
        )

    def retain_dataset(self, identifier, meta):
        fingerprint = self.dataset_fingerprint(meta)
        for existing_id, existing in list(self.datasets.items()):
            if self.dataset_fingerprint(existing) == fingerprint:
                # Moving a reused entry to the end makes dict order an LRU order.
                self.datasets.pop(existing_id)
                self.datasets[existing_id] = existing
                return existing_id, existing

        protected = {
            job["datasetId"]
            for job in self.jobs.values()
            if job["state"] == "running"
        }
        cached_count = len(self.datasets)
        cached_bytes = sum(item["byteLength"] for item in self.datasets.values())
        removals = []
        removable = iter(
            dataset_id for dataset_id in self.datasets if dataset_id not in protected
        )
        while (
            cached_count >= MAX_CACHED_DATASETS
            or cached_bytes + meta["byteLength"] > MAX_CACHED_DATASET_BYTES
        ):
            dataset_id = next(removable, None)
            if dataset_id is None:
                raise ValueError(
                    "Dataset cache cannot fit this upload while an active run retains its input; wait for or cancel the run, or upload a smaller dataset"
                )
            removals.append(dataset_id)
            cached_count -= 1
            cached_bytes -= self.datasets[dataset_id]["byteLength"]
        for dataset_id in removals:
            shutil.rmtree(self.root / dataset_id, ignore_errors=True)
            del self.datasets[dataset_id]
        self.datasets[identifier] = meta
        return identifier, meta

    def touch_dataset(self, identifier):
        meta = self.datasets.pop(identifier)
        self.datasets[identifier] = meta
        return meta

    def refresh(self):
        for job in self.jobs.values():
            while True:
                try:
                    update = job["queue"].get_nowait()
                except Empty:
                    break
                if job["state"] not in ("cancelled", "failed"):
                    job.update(update)
                    if "state" in update:
                        job["finishedAt"] = utcnow()
            if job["state"] == "running" and job["process"].exitcode is not None:
                # A terminated process without a terminal queue message is a failed run.
                if time.monotonic() - job["startedMonotonic"] > 2:
                    job.update(
                        state="failed",
                        error="Worker exited before publishing a result",
                        finishedAt=utcnow(),
                    )
            if (
                job["state"] == "running"
                and time.monotonic() - job["startedMonotonic"] > 3600
            ):
                self.cancel(job)
                job["error"] = "One-hour run limit reached"

    def cancel(self, job):
        if job["process"].is_alive():
            job["process"].terminate()
            job["process"].join(timeout=5)
        job.update(state="cancelled", finishedAt=utcnow())

    def close(self):
        with self.lock:
            for job in self.jobs.values():
                if job["process"].is_alive():
                    self.cancel(job)
                job["queue"].close()
        self.server_close()
        self.temp.cleanup()


def public_job(job):
    return {
        k: v
        for k, v in job.items()
        if k not in ("process", "queue", "startedMonotonic")
    }


class Handler(BaseHTTPRequestHandler):
    server: Companion

    def log_message(self, *_args):
        pass  # Never log dataset identifiers, uploaded metadata, or credentials.

    def authorized(self, preflight=False):
        host = self.headers.get("Host", "")
        port = self.server.server_address[1]
        origin = self.headers.get("Origin")
        if host not in (f"localhost:{port}", f"127.0.0.1:{port}") or (
            origin and origin not in self.server.origins
        ):
            self.respond(403, {"error": "Host or origin is not allowed"})
            return False
        if not preflight and not hmac.compare_digest(
            self.headers.get("Authorization", ""), "Bearer " + self.server.token
        ):
            self.respond(401, {"error": "Invalid companion token"})
            return False
        return True

    def respond(self, code, body, content_type="application/json"):
        payload = (
            json.dumps(body, allow_nan=False).encode()
            if content_type == "application/json"
            else body
        )
        self.send_response(code)
        origin = self.headers.get("Origin")
        if origin in self.server.origins:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        try:
            self.wfile.write(payload)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def read_body(self, limit):
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > limit or self.headers.get("Transfer-Encoding"):
            raise ValueError("Invalid or oversized request body")
        self.connection.settimeout(120)
        body = self.rfile.read(length)
        if len(body) != length:
            raise ValueError("Truncated request")
        return body

    def do_OPTIONS(self):
        if self.authorized(preflight=True):
            self.respond(200, {})

    def do_GET(self):
        if not self.authorized():
            return
        path = urlsplit(self.path).path
        try:
            with self.server.lock:
                self.server.refresh()
                if path == "/models":
                    return self.respond(200, model_catalog())
                if path == "/runs":
                    return self.respond(
                        200, [public_job(j) for j in self.server.jobs.values()]
                    )
                parts = path.strip("/").split("/")
                if (
                    len(parts) in (2, 3)
                    and parts[0] == "runs"
                    and parts[1] in self.server.jobs
                ):
                    job = self.server.jobs[parts[1]]
                    if len(parts) == 2:
                        return self.respond(200, public_job(job))
                    if parts[2] == "result" and job["state"] == "completed":
                        return self.respond(
                            200,
                            result_bytes(self.server.root / job["id"]),
                            "application/octet-stream",
                        )
                self.respond(404, {"error": "Resource not available"})
        except Exception as error:
            self.respond(400, {"error": str(error)[:500]})

    def do_POST(self):
        if not self.authorized():
            return
        path = urlsplit(self.path).path
        try:
            if path == "/datasets":
                if self.headers.get("Content-Type") != "application/octet-stream":
                    raise ValueError("Expected binary dataset envelope")
                body = self.read_body(MAX_BYTES + 65540)
                with self.server.lock:
                    self.server.refresh()
                    identifier = str(uuid.uuid4())
                    try:
                        meta = unpack_dataset(body, self.server.root / identifier)
                        retained_id, meta = self.server.retain_dataset(identifier, meta)
                    except Exception:
                        shutil.rmtree(self.server.root / identifier, ignore_errors=True)
                        raise
                    if retained_id != identifier:
                        shutil.rmtree(self.server.root / identifier, ignore_errors=True)
                return self.respond(
                    201, {"id": retained_id, "payloadSha256": meta["payloadSha256"]}
                )
            if path == "/runs":
                data = json.loads(self.read_body(8 * 1024 * 1024))
                with self.server.lock:
                    self.server.refresh()
                    if any(j["state"] == "running" for j in self.server.jobs.values()):
                        raise ValueError(
                            "One run is already active; cancel it or wait for completion"
                        )
                    dataset_id = data.get("datasetId")
                    if dataset_id not in self.server.datasets:
                        raise ValueError("Unknown dataset")
                    meta = self.server.touch_dataset(dataset_id)
                    config = validate_config(data.get("config"), meta)
                    scope = data.get("scope")
                    indices = data.get("indices", [])
                    n = (
                        meta["dimensions"][0]
                        * meta["dimensions"][1]
                        * meta["dimensions"][2]
                    )
                    if scope not in ("voxel", "roi", "dataset"):
                        raise ValueError("Unknown fitting scope")
                    if scope != "dataset" and (
                        not isinstance(indices, list)
                        or not indices
                        or len(indices) > n
                        or any(type(i) is not int or not 0 <= i < n for i in indices)
                        or len(set(indices)) != len(indices)
                        or (scope == "voxel" and len(indices) != 1)
                    ):
                        raise ValueError("Invalid selected voxel indices")
                    while len(self.server.jobs) >= 10:
                        old_id, old = next(iter(self.server.jobs.items()))
                        old["queue"].close()
                        shutil.rmtree(self.server.root / old_id, ignore_errors=True)
                        del self.server.jobs[old_id]
                    identifier = str(uuid.uuid4())
                    queue = self.server.context.Queue()
                    process = self.server.context.Process(
                        target=job_process,
                        args=(
                            str(self.server.root / dataset_id),
                            str(self.server.root / identifier),
                            config,
                            scope,
                            indices,
                            queue,
                        ),
                    )
                    job = {
                        "id": identifier,
                        "datasetId": dataset_id,
                        "sourceHash": meta["sha256"],
                        "config": config,
                        "scope": scope,
                        "state": "running",
                        "progress": 0,
                        "startedAt": utcnow(),
                        "startedMonotonic": time.monotonic(),
                        "process": process,
                        "queue": queue,
                    }
                    self.server.jobs[identifier] = job
                    process.start()
                    return self.respond(201, public_job(job))
            self.respond(404, {"error": "Unknown endpoint"})
        except Exception as error:
            self.respond(400, {"error": str(error)[:500]})

    def do_DELETE(self):
        if not self.authorized():
            return
        parts = urlsplit(self.path).path.strip("/").split("/")
        with self.server.lock:
            if len(parts) == 2 and parts[0] == "runs" and parts[1] in self.server.jobs:
                job = self.server.jobs[parts[1]]
                if job["state"] == "running":
                    self.server.cancel(job)
                return self.respond(200, public_job(job))
        self.respond(404, {"error": "Unknown run"})


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=60016)
    parser.add_argument("--bind", choices=("127.0.0.1", "0.0.0.0"), default="127.0.0.1")
    parser.add_argument(
        "--origin",
        action="append",
        default=[
            "http://localhost:60010",
            "http://127.0.0.1:60010",
            "http://localhost:60014",
            "http://127.0.0.1:60014",
            "https://osipi.github.io",
        ],
    )
    args = parser.parse_args()
    token = os.environ.get("OSIPY_DASHBOARD_TOKEN") or secrets.token_urlsafe(32)
    if len(token) < 16:
        parser.error("OSIPY_DASHBOARD_TOKEN must contain at least 16 characters")
    server = Companion(args.port, token, args.origin, bind=args.bind)

    def stop(_signum, _frame):
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, stop)
    print(f"OSIPY companion: http://127.0.0.1:{server.server_address[1]}", flush=True)
    if not os.environ.get("OSIPY_DASHBOARD_TOKEN"):
        print(f"Paste this session token into the dashboard: {token}", flush=True)
    print(
        "Loopback only. Inputs/results are temporary and removed on exit. Ctrl+C to stop.",
        flush=True,
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.close()
