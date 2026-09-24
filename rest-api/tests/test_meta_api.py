async def test_health(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


async def test_root(client):
    resp = await client.get("/")
    body = resp.json()
    assert body["name"] == "osipy-rest-api"
    assert body["version"] == "0.1.0"
    assert body["docs"] == "/docs"


async def test_openapi_docs_served(client):
    assert (await client.get("/openapi.json")).status_code == 200
