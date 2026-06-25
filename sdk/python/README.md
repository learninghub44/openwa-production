# learninghub44-zetu

Official Python SDK for the [Zetu](https://github.com/learninghub44/Zetu) WhatsApp API Gateway.

A synchronous client built on [httpx](https://www.python-httpx.org/), with bundled type hints (PEP 561).

## Install

```bash
pip install learninghub44-zetu
```

Requires Python 3.9+. The importable module is `zetu`.

## Usage

```python
from zetu import ZetuClient

client = ZetuClient(
    base_url="https://your-gateway.example.com",
    api_key="owa_k1_…",
)

client.sessions.start("my-session")

result = client.messages.send_text("my-session", {
    "chatId": "628123456789@c.us",
    "text": "Hello from the Zetu Python SDK!",
})
print(result["messageId"])
```

The client is also a context manager (it closes the underlying connection pool on exit):

```python
with ZetuClient(base_url="…", api_key="…") as client:
    client.messages.send_text("my-session", {"chatId": "…@c.us", "text": "hi"})
```

For tests, pass an httpx transport — no global monkey-patching required:

```python
import httpx
client = ZetuClient(base_url="…", api_key="…", transport=httpx.MockTransport(handler))
```

## Errors

A non-2xx response raises a typed `ZetuApiError` subclass — `ZetuAuthError` (401),
`ZetuForbiddenError` (403), `ZetuNotFoundError` (404), `ZetuConflictError` (409),
`ZetuRateLimitError` (429), `ZetuNotImplementedError` (501) — each carrying `.status`
and the parsed `.body`. A timeout raises `ZetuTimeoutError`.

```python
from zetu import ZetuNotFoundError

try:
    client.sessions.get("missing")
except ZetuNotFoundError as e:
    print(e.status)  # 404
```

## Notes

- **Use HTTPS in production** — the API key is sent as `X-API-Key` and is bearer-equivalent.
- The SDK does **not** retry, and **never follows redirects** (so the key is never re-sent to
  a redirect target). Path segments are percent-encoded; a base-URL path prefix (e.g. behind a
  reverse proxy) is preserved.
- Escape hatch for endpoints the SDK does not wrap:
  `client.request(method, path, query=…, body=…)`.

## License

MIT
