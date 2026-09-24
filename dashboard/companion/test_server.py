import json
import struct
import threading
import time
import unittest
import urllib.error
import urllib.request
from queue import Empty
from unittest import mock

import numpy as np
from core import model_catalog
from server import Companion


class ServerTests(unittest.TestCase):
    def setUp(self):
        self.server = Companion(
            0, "unit-test-session-token", ["http://localhost:60010"]
        )
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.url = f"http://127.0.0.1:{self.server.server_address[1]}"

    def tearDown(self):
        self.server.shutdown()
        self.thread.join()
        self.server.close()

    def request(
        self,
        path,
        body=None,
        method="GET",
        token="unit-test-session-token",
        origin="http://localhost:60010",
        content_type="application/json",
    ):
        request = urllib.request.Request(
            self.url + path,
            data=body,
            method=method,
            headers={
                "Authorization": "Bearer " + token,
                "Origin": origin,
                "Content-Type": content_type,
            },
        )
        return urllib.request.urlopen(request, timeout=10)

    def dataset_envelope(self, value=1, source_hash=None):
        meta = {
            "dimensions": [2, 2, 2, 8],
            "dtype": "float32",
            "bValues": [0, 10, 20, 50, 100, 200, 400, 800],
            "affine": np.eye(4).tolist(),
            "slope": 1,
            "intercept": 0,
            "spatialUnit": "mm",
            "sha256": source_hash or f"{value:064x}",
        }
        header = json.dumps(meta).encode()
        return (
            struct.pack("<I", len(header))
            + header
            + np.full(64, value, dtype="<f4").tobytes()
        )

    def upload(self, body):
        return json.load(
            self.request(
                "/datasets",
                body,
                "POST",
                content_type="application/octet-stream",
            )
        )

    def test_repeated_upload_is_idempotent(self):
        body = self.dataset_envelope()

        first = self.upload(body)
        repeated = [self.upload(body) for _ in range(7)]

        self.assertTrue(all(item == first for item in repeated))
        self.assertEqual(len(self.server.datasets), 1)

    def test_full_cache_evicts_oldest_dataset(self):
        uploaded = [self.upload(self.dataset_envelope(value)) for value in range(1, 7)]
        self.assertEqual(self.upload(self.dataset_envelope(1)), uploaded[0])
        retained_result = self.server.root / "retained-result"
        retained_result.mkdir()
        (retained_result / "sentinel").write_text("result")

        newest = self.upload(self.dataset_envelope(7))

        self.assertEqual(len(self.server.datasets), 6)
        self.assertIn(uploaded[0]["id"], self.server.datasets)
        self.assertNotIn(uploaded[1]["id"], self.server.datasets)
        self.assertIn(newest["id"], self.server.datasets)
        self.assertTrue((retained_result / "sentinel").is_file())

    def test_full_cache_never_evicts_running_dataset(self):
        active = self.upload(self.dataset_envelope(1))
        process = mock.Mock(exitcode=None)
        process.is_alive.return_value = False
        queue = mock.Mock()
        queue.get_nowait.side_effect = Empty
        self.server.jobs["active-run"] = {
            "id": "active-run",
            "datasetId": active["id"],
            "state": "running",
            "startedMonotonic": time.monotonic(),
            "process": process,
            "queue": queue,
        }

        with mock.patch("server.MAX_CACHED_DATASETS", 1):
            with self.assertRaises(urllib.error.HTTPError) as error:
                self.upload(self.dataset_envelope(2))

        self.assertEqual(error.exception.code, 400)
        message = json.load(error.exception)["error"]
        self.assertIn("wait for or cancel the run", message)
        self.assertEqual(list(self.server.datasets), [active["id"]])

    def test_auth_origin_and_cancellation(self):
        for token, origin, code in [
            ("wrong", "http://localhost:60010", 401),
            ("unit-test-session-token", "https://untrusted.example", 403),
        ]:
            with self.assertRaises(urllib.error.HTTPError) as error:
                self.request("/models", token=token, origin=origin)
            self.assertEqual(error.exception.code, code)
        dataset = self.upload(self.dataset_envelope(source_hash="b" * 64))
        config = {
            "datasetId": dataset["id"],
            "config": model_catalog()["defaults"],
            "scope": "dataset",
            "indices": [],
        }
        job = json.load(self.request("/runs", json.dumps(config).encode(), "POST"))
        cancelled = json.load(self.request("/runs/" + job["id"], method="DELETE"))
        self.assertEqual(cancelled["state"], "cancelled")
        self.assertEqual(
            json.load(self.request("/runs/" + job["id"]))["state"], "cancelled"
        )


if __name__ == "__main__":
    unittest.main()
