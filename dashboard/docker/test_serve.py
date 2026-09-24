import http.client
import threading
import unittest
from http.server import ThreadingHTTPServer

from serve import Handler


class DashboardServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def get(self, path, headers=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port)
        connection.request("GET", path, headers={"Host": "localhost:60010", **(headers or {})})
        response = connection.getresponse()
        result = response.status, dict(response.getheaders()), response.read()
        connection.close()
        return result

    def test_root_redirect_and_viewer_fallback(self):
        status, headers, _ = self.get("/")
        self.assertEqual(status, 302)
        self.assertEqual(headers["Location"], "/dashboard/")
        for path in ("/dashboard/", "/dashboard/viewer?scan=demo"):
            status, _, body = self.get(path)
            self.assertEqual(status, 200)
            self.assertIn(b"<html", body.lower())

    def test_static_files_and_host_restrictions(self):
        self.assertEqual(self.get("/dashboard/companion/server.py")[0], 404)
        self.assertEqual(self.get("/dashboard/_app/missing.js")[0], 404)
        self.assertEqual(self.get("/dashboard/", {"Host": "other.example:60010"})[0], 403)

    def test_proxy_rejects_cross_site_and_unknown_paths(self):
        self.assertEqual(self.get("/local-companion/models")[0], 403)
        self.assertEqual(
            self.get("/local-companion/models", {"Sec-Fetch-Site": "cross-site"})[0], 403
        )
        self.assertEqual(
            self.get(
                "/local-companion/models",
                {"Sec-Fetch-Site": "same-origin", "Origin": "https://evil.example"},
            )[0],
            403,
        )
        self.assertEqual(
            self.get("/local-companion/unknown", {"Sec-Fetch-Site": "same-origin"})[0],
            403,
        )


if __name__ == "__main__":
    unittest.main()
