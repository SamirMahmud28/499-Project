"""Semantic Scholar API client for paper search and enrichment."""

import os
from pathlib import Path
from dotenv import load_dotenv
import httpx

from ._http import TIMEOUT, safe_request

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

API_KEY = os.getenv("SEMANTIC_SCHOLAR_API_KEY", "")
BASE_URL = "https://api.semanticscholar.org/graph/v1"
FIELDS = "title,authors,year,venue,citationCount,influentialCitationCount,abstract,externalIds,url,openAccessPdf"


async def search_papers(query: str, limit: int = 10) -> list[dict]:
    """Search Semantic Scholar for papers.

    Returns list of dicts with: title, authors, year, venue, doi, url,
    pdf_url, citation_count, influential_citation_count, abstract.
    """
    params = {"query": query, "limit": limit, "fields": FIELDS}
    headers = {}
    if API_KEY:
        headers["x-api-key"] = API_KEY

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        resp = await safe_request(
            client, "GET", f"{BASE_URL}/paper/search",
            params=params, headers=headers,
        )
        if resp is None:
            return []

    try:
        data = resp.json()
    except Exception:
        return []

    return [_normalize_paper(p) for p in data.get("data", [])]


async def get_paper_details(paper_id: str) -> dict | None:
    """Get details for a single paper by Semantic Scholar ID or DOI."""
    headers = {}
    if API_KEY:
        headers["x-api-key"] = API_KEY

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        resp = await safe_request(
            client, "GET", f"{BASE_URL}/paper/{paper_id}",
            params={"fields": FIELDS}, headers=headers,
        )
        if resp is None:
            return None

    try:
        return _normalize_paper(resp.json())
    except Exception:
        return None


def _normalize_paper(paper: dict) -> dict:
    """Normalize a Semantic Scholar paper response to our standard format."""
    # Extract authors
    authors = []
    for a in paper.get("authors", []):
        name = a.get("name")
        if name:
            authors.append(name)

    # Extract DOI from externalIds
    ext_ids = paper.get("externalIds", {}) or {}
    doi = ext_ids.get("DOI")

    # Extract PDF URL
    oa_pdf = paper.get("openAccessPdf", {}) or {}
    pdf_url = oa_pdf.get("url")

    return {
        "title": paper.get("title", ""),
        "authors": authors,
        "year": paper.get("year"),
        "venue": paper.get("venue", ""),
        "doi": doi,
        "url": paper.get("url", ""),
        "pdf_url": pdf_url,
        "citation_count": paper.get("citationCount", 0),
        "influential_citation_count": paper.get("influentialCitationCount", 0),
        "abstract": paper.get("abstract"),
    }
