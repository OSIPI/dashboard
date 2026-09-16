import json
import struct
import threading
import unittest
import urllib.error
import urllib.request

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

    def test_auth_origin_and_cancellation(self):
        for token, origin, code in [
            ("wrong", "http://localhost:60010", 401),
            ("unit-test-session-token", "https://untrusted.example", 403),
        ]:
            with self.assertRaises(urllib.error.HTTPError) as error:
                self.request("/models", token=token, origin=origin)
            self.assertEqual(error.exception.code, code)
        meta = {
            "dimensions": [2, 2, 2, 8],
            "dtype": "float32",
            "bValues": [0, 10, 20, 50, 100, 200, 400, 800],
            "affine": np.eye(4).tolist(),
            "slope": 1,
            "intercept": 0,
            "spatialUnit": "mm",
            "sha256": "b" * 64,
        }
        header = json.dumps(meta).encode()
        dataset = json.load(
            self.request(
                "/datasets",
                struct.pack("<I", len(header))
                + header
                + np.ones(64, dtype="<f4").tobytes(),
                "POST",
                content_type="application/octet-stream",
            )
        )
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
