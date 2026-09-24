"""Loopback-published static dashboard with an authenticated same-origin API proxy."""

from __future__ import annotations

import http.client
import mimetypes
import os
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent / "build"
ALLOWED_HOSTS = {"localhost:60010", "127.0.0.1:60010"}
GET_PATH = re.compile(r"/(?:models|runs(?:/[a-f0-9-]+(?:/result)?)?)\Z")
DELETE_PATH = re.compile(r"/runs/[a-f0-9-]+\Z")
MAX_DATASET = 512 * 1024 * 1024 + 65540


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass  # Never log patient data, URL metadata, or credentials.

    def do_GET(self):
        self.route()

    def do_POST(self):
        self.route()

    def do_DELETE(self):
        self.route()

    def route(self):
        path = urlsplit(self.path)
        if path.path.startswith("/local-companion"):
            self.proxy(path)
        elif self.command == "GET":
            self.static(path)
        else:
            self.send_error(404)

    def proxy(self, path):
        host = self.headers.get("Host", "")
        origin = self.headers.get("Origin")
        target = path.path.removeprefix("/local-companion")
        allowed = (
            (self.command == "GET" and GET_PATH.fullmatch(target))
            or (self.command == "POST" and target in ("/datasets", "/runs"))
            or (self.command == "DELETE" and DELETE_PATH.fullmatch(target))
        )
        if (
            host not in ALLOWED_HOSTS
            or (origin and origin != f"http://{host}")
            or self.headers.get("Sec-Fetch-Site") != "same-origin"
            or self.headers.get("Transfer-Encoding")
            or path.query
            or not allowed
        ):
            self.send_error(403)
            return
        length = self.headers.get("Content-Length", "0")
        try:
            size = int(length)
        except ValueError:
            self.send_error(400)
            return
        limit = MAX_DATASET if target == "/datasets" else 8 * 1024 * 1024
        if size < 0 or size > limit or (self.command == "POST" and size == 0):
            self.send_error(413)
            return
        self.connection.settimeout(120)
        connection = http.client.HTTPConnection("127.0.0.1", 60016, timeout=120)
        headers_sent = False
        try:
            connection.putrequest(self.command, target)
            connection.putheader("Authorization", "Bearer " + os.environ["OSIPY_DASHBOARD_TOKEN"])
            connection.putheader("Content-Length", str(size))
            if self.headers.get("Content-Type"):
                connection.putheader("Content-Type", self.headers["Content-Type"])
            connection.endheaders()
            remaining = size
            while remaining:
                chunk = self.rfile.read(min(65536, remaining))
                if not chunk:
                    raise ConnectionError("Truncated request")
                connection.send(chunk)
                remaining -= len(chunk)
            response = connection.getresponse()
            self.send_response(response.status)
            self.send_header("Content-Type", response.getheader("Content-Type", "application/octet-stream"))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            if response.getheader("Content-Length"):
                self.send_header("Content-Length", response.getheader("Content-Length"))
            self.end_headers()
            headers_sent = True
            while chunk := response.read(65536):
                self.wfile.write(chunk)
        except (OSError, http.client.HTTPException):
            if not headers_sent:
                try:
                    self.send_error(502)
                except OSError:
                    pass
        finally:
            connection.close()

    def static(self, url):
        host = self.headers.get("Host", "")
        if host not in ALLOWED_HOSTS:
            self.send_error(403)
            return
        if url.path == "/":
            self.send_response(302)
            self.send_header("Location", "/dashboard/")
            self.end_headers()
            return
        if not url.path.startswith("/dashboard/"):
            self.send_error(404)
            return
        relative = url.path.removeprefix("/dashboard/") or "index.html"
        file = (ROOT / relative).resolve()
        if not file.is_relative_to(ROOT) or (file.exists() and not file.is_file()):
            self.send_error(404)
            return
        if not file.is_file():
            if "." in Path(relative).name or relative.startswith(("_app/", "datasets/")):
                self.send_error(404)
                return
            file = ROOT / "index.html"
        self.send_response(200)
        self.send_header("Content-Type", mimetypes.guess_type(file.name)[0] or "application/octet-stream")
        self.send_header("Content-Length", str(file.stat().st_size))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "no-store" if file.name == "index.html" else "public, max-age=3600")
        self.end_headers()
        with file.open("rb") as source:
            while chunk := source.read(65536):
                self.wfile.write(chunk)


if __name__ == "__main__":
    print("Dashboard: http://localhost:60010/dashboard/", flush=True)
    server = ThreadingHTTPServer(("0.0.0.0", 37183), Handler)
    try:
        server.serve_forever()
    finally:
        server.server_close()
