"""Unpaywall API client for finding open-access PDF links."""

import os
from pathlib import Path
from dotenv import load_dotenv
import httpx

from ._http import TIMEOUT, safe_request

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

UNPAYWALL_EMAIL = os.getenv("UNPAYWALL_EMAIL", "")
BASE_URL = "https://api.unpaywall.org/v2"


async def get_open_access_url(doi: str) -> str | None:
    """Look up an open-access PDF URL for a given DOI.

    Returns the best open-access PDF URL, or None if not found.
    """
    if not UNPAYWALL_EMAIL:
        return None

    params = {"email": UNPAYWALL_EMAIL}

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        resp = await safe_request(
            client, "GET", f"{BASE_URL}/{doi}",
            params=params,
        )
        if resp is None:
            return None

    try:
        data = resp.json()
    except Exception:
        return None

    # Try best_oa_location first, then fall back to first oa_location
    best = data.get("best_oa_location") or {}
    pdf_url = best.get("url_for_pdf") or best.get("url")

    if not pdf_url:
        locations = data.get("oa_locations", [])
        for loc in locations:
            url = loc.get("url_for_pdf") or loc.get("url")
            if url:
                pdf_url = url
                break

    return pdf_url
