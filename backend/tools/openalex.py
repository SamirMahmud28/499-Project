"""OpenAlex API client for academic paper search."""

import os
from pathlib import Path
from dotenv import load_dotenv
import httpx

from ._http import TIMEOUT, safe_request

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

OPENALEX_EMAIL = os.getenv("OPENALEX_EMAIL") or os.getenv("UNPAYWALL_EMAIL", "")
BASE_URL = "https://api.openalex.org"


async def search_papers(keywords: list[str], limit: int = 10) -> list[dict]:
    """Search OpenAlex for papers matching keywords.

    Returns list of dicts with: title, authors, year, doi, url, venue,
    cited_by_count, open_access_url.
    """
    query = " ".join(keywords)
    params = {
        "search": query,
        "per_page": limit,
        "sort": "cited_by_count:desc",
    }
    if OPENALEX_EMAIL:
        params["mailto"] = OPENALEX_EMAIL

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        resp = await safe_request(client, "GET", f"{BASE_URL}/works", params=params)
        if resp is None:
            return []

    try:
        data = resp.json()
    except Exception:
        return []

    results = []
    for work in data.get("results", []):
        # Extract author names
        authors = []
        for authorship in work.get("authorships", []):
            author = authorship.get("author", {})
            name = author.get("display_name")
            if name:
                authors.append(name)

        # Extract DOI (strip URL prefix)
        doi_raw = work.get("doi") or ""
        doi = doi_raw.replace("https://doi.org/", "").strip() if doi_raw else None

        # Extract open access URL
        oa = work.get("open_access", {})
        oa_url = oa.get("oa_url")

        # Extract venue
        location = work.get("primary_location", {}) or {}
        source = location.get("source", {}) or {}
        venue = source.get("display_name", "")

        results.append({
            "title": work.get("display_name", ""),
            "authors": authors,
            "year": work.get("publication_year"),
            "doi": doi,
            "url": doi_raw or work.get("id", ""),
            "venue": venue,
            "cited_by_count": work.get("cited_by_count", 0),
            "open_access_url": oa_url,
        })

    return results
