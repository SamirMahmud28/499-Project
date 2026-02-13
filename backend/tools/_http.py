"""Shared HTTP helper with retry logic for all API tool clients."""

import asyncio
import httpx

TIMEOUT = httpx.Timeout(15.0, connect=5.0)
MAX_RETRIES = 2  # 3 total attempts


async def safe_request(
    client: httpx.AsyncClient,
    method: str,
    url: str,
    retries: int = MAX_RETRIES,
    **kwargs,
) -> httpx.Response | None:
    """Make an HTTP request with retry logic for timeouts, 429s, and 5xx errors."""
    for attempt in range(retries + 1):
        try:
            resp = await client.request(method, url, **kwargs)
            if resp.status_code == 429:
                wait = float(resp.headers.get("retry-after", 2))
                await asyncio.sleep(wait)
                continue
            if resp.status_code >= 500 and attempt < retries:
                await asyncio.sleep(1 * (attempt + 1))
                continue
            resp.raise_for_status()
            return resp
        except (httpx.ConnectTimeout, httpx.ReadTimeout, httpx.ConnectError):
            if attempt < retries:
                await asyncio.sleep(1 * (attempt + 1))
                continue
            return None
        except httpx.HTTPStatusError:
            return None
    return None
