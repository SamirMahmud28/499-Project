"""Tavily API client for general web search."""

import os
from pathlib import Path
from dotenv import load_dotenv
import httpx

from ._http import TIMEOUT, safe_request

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "")
BASE_URL = "https://api.tavily.com"


async def search_web(query: str, max_results: int = 5) -> list[dict]:
    """Search the web using Tavily.

    Returns list of dicts with: title, url, snippet, domain.
    """
    if not TAVILY_API_KEY:
        return []

    body = {
        "api_key": TAVILY_API_KEY,
        "query": query,
        "max_results": max_results,
        "include_answer": False,
    }

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        resp = await safe_request(
            client, "POST", f"{BASE_URL}/search",
            json=body,
        )
        if resp is None:
            return []

    try:
        data = resp.json()
    except Exception:
        return []

    results = []
    for item in data.get("results", []):
        results.append({
            "title": item.get("title", ""),
            "url": item.get("url", ""),
            "snippet": item.get("content", ""),
            "domain": item.get("url", "").split("/")[2] if "/" in item.get("url", "") else "",
        })

    return results
