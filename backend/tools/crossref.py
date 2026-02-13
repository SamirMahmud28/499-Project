"""Crossref API client for DOI verification and metadata lookup."""

import os
from pathlib import Path
from dotenv import load_dotenv
import httpx

from ._http import TIMEOUT, safe_request

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

MAILTO = os.getenv("OPENALEX_EMAIL") or os.getenv("UNPAYWALL_EMAIL", "")
BASE_URL = "https://api.crossref.org"


def _user_agent() -> str:
    ua = "ResearchGPT/1.0 (https://github.com/researchgpt)"
    if MAILTO:
        ua += f" mailto:{MAILTO}"
    return ua


async def verify_doi(doi: str) -> dict | None:
    """Verify a DOI and return cleaned metadata.

    Returns dict with: title, authors, year, venue, doi, url, type.
    Returns None if the DOI is invalid or not found.
    """
    headers = {"User-Agent": _user_agent()}

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        resp = await safe_request(
            client, "GET", f"{BASE_URL}/works/{doi}",
            headers=headers,
        )
        if resp is None:
            return None

    try:
        message = resp.json().get("message", {})
    except Exception:
        return None

    return _normalize_work(message)


async def search_works(query: str, limit: int = 5) -> list[dict]:
    """Search Crossref for works by query string.

    Returns list of dicts with: title, authors, year, venue, doi, url, type.
    """
    headers = {"User-Agent": _user_agent()}
    params = {"query": query, "rows": limit, "sort": "relevance"}

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        resp = await safe_request(
            client, "GET", f"{BASE_URL}/works",
            params=params, headers=headers,
        )
        if resp is None:
            return []

    try:
        items = resp.json().get("message", {}).get("items", [])
    except Exception:
        return []

    return [_normalize_work(item) for item in items]


def _normalize_work(work: dict) -> dict:
    """Normalize a Crossref work to our standard format."""
    # Title is a list in Crossref
    titles = work.get("title", [])
    title = titles[0] if titles else ""

    # Authors
    authors = []
    for a in work.get("author", []):
        given = a.get("given", "")
        family = a.get("family", "")
        name = f"{given} {family}".strip()
        if name:
            authors.append(name)

    # Year from published-print or published-online
    year = None
    for date_field in ("published-print", "published-online", "created"):
        date_parts = work.get(date_field, {}).get("date-parts", [[]])
        if date_parts and date_parts[0] and date_parts[0][0]:
            year = date_parts[0][0]
            break

    # Venue
    container = work.get("container-title", [])
    venue = container[0] if container else ""

    return {
        "title": title,
        "authors": authors,
        "year": year,
        "venue": venue,
        "doi": work.get("DOI", ""),
        "url": work.get("URL", ""),
        "type": work.get("type", ""),
    }
