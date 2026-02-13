# Phase 2 — Task 1: API Tool Clients

## Goal
Create the `backend/tools/` package with async clients for all 5 external APIs used by the SourceScoutAgent. These are standalone utility modules with no LangGraph or agent logic — just clean HTTP wrappers.

## Prerequisites
- Phase 1 codebase working and stable
- API keys obtained: Tavily, Semantic Scholar
- Email configured for Unpaywall

## Safety Rules
- DO NOT modify any existing files in this task (except `.env.example`)
- All new files go in `backend/tools/` (new directory)
- No changes to `main.py`, `log_helpers.py`, agents, or frontend

---

## New Files

### 1. `backend/tools/__init__.py`
Empty init file to make `tools` a Python package.

### 2. `backend/tools/openalex.py`
- **Function**: `async def search_papers(keywords: list[str], limit: int = 10) -> list[dict]`
- **API**: `GET https://api.openalex.org/works`
- **Query params**: `search` (joined keywords), `per_page` (limit), `sort` (cited_by_count:desc)
- **Returns**: List of dicts with keys: `title`, `authors` (list of names), `year`, `doi`, `url` (OpenAlex landing page or DOI link), `venue`, `cited_by_count`, `open_access_url` (if available)
- **Headers**: Include `mailto` param for polite pool (read from `OPENALEX_EMAIL` env var, fallback to `UNPAYWALL_EMAIL`)
- **Error handling**: Return empty list on failure, log warning
- **Rate limiting**: None needed (polite pool is sufficient)

### 3. `backend/tools/semantic_scholar.py`
- **Function**: `async def search_papers(query: str, limit: int = 10) -> list[dict]`
- **Function**: `async def get_paper_details(paper_id: str) -> dict | None`
- **API**: `GET https://api.semanticscholar.org/graph/v1/paper/search`
- **Query params**: `query`, `limit`, `fields` (title,authors,year,venue,citationCount,influentialCitationCount,abstract,externalIds,url,openAccessPdf)
- **Headers**: `x-api-key` from `SEMANTIC_SCHOLAR_API_KEY` env var (optional but recommended)
- **Returns**: List of dicts with keys: `title`, `authors`, `year`, `venue`, `doi`, `url`, `pdf_url`, `citation_count`, `influential_citation_count`, `abstract`
- **Error handling**: Return empty list on failure, respect 429 (rate limit)

### 4. `backend/tools/crossref.py`
- **Function**: `async def verify_doi(doi: str) -> dict | None`
- **Function**: `async def search_works(query: str, limit: int = 5) -> list[dict]`
- **API**: `GET https://api.crossref.org/works/{doi}` and `GET https://api.crossref.org/works`
- **Query params for search**: `query`, `rows` (limit), `sort` (relevance)
- **Headers**: Include `mailto` param in User-Agent for polite pool
- **Returns**: Dict with keys: `title`, `authors`, `year`, `venue` (container-title), `doi`, `url`, `type` (journal-article, proceedings-article, etc.)
- **Error handling**: Return None on 404 (invalid DOI), empty list on search failure

### 5. `backend/tools/unpaywall.py`
- **Function**: `async def get_open_access_url(doi: str) -> str | None`
- **API**: `GET https://api.unpaywall.org/v2/{doi}`
- **Query params**: `email` from `UNPAYWALL_EMAIL` env var
- **Returns**: Best open-access PDF URL (from `best_oa_location.url_for_pdf`) or None
- **Error handling**: Return None on 404 or failure

### 6. `backend/tools/tavily_search.py`
- **Function**: `async def search_web(query: str, max_results: int = 5) -> list[dict]`
- **API**: `POST https://api.tavily.com/search`
- **Body**: `{ "api_key": TAVILY_API_KEY, "query": query, "max_results": max_results, "include_answer": false }`
- **Returns**: List of dicts with keys: `title`, `url`, `snippet`, `domain`
- **Error handling**: Return empty list on failure

---

## Environment Variables

Add to `backend/.env.example`:
```
# Phase 2: External API keys
TAVILY_API_KEY=
SEMANTIC_SCHOLAR_API_KEY=
UNPAYWALL_EMAIL=
```

Add actual values to `backend/.env` (not committed).

---

## Implementation Notes
- All functions use `httpx.AsyncClient` with timeouts (10s default)
- All functions are standalone — no imports from `log_helpers.py` or agents
- Each module reads its own env vars using `os.getenv()`
- Use `load_dotenv(Path(__file__).resolve().parent.parent / ".env")` at module level (same pattern as `groq_client.py`)
- All functions return clean Python dicts, not raw API responses
- Parse and normalize data — e.g., OpenAlex author names are nested, extract display_name

## Timeouts, Retries & Rate Limiting

Each client must implement:

### Timeouts
- **Default connect timeout**: 5 seconds
- **Default read timeout**: 15 seconds
- Use `httpx.Timeout(connect=5.0, read=15.0)` passed to AsyncClient

### Retry Logic
- **Max retries**: 2 (3 total attempts)
- **Retry on**: `httpx.ConnectTimeout`, `httpx.ReadTimeout`, HTTP 429, HTTP 500-503
- **Backoff**: 1s → 2s (simple doubling)
- **Implementation**: Use a shared `async def _request_with_retry(client, method, url, **kwargs)` helper in each module, or a small shared utility in `backend/tools/_http.py`

### Rate Limiting (per-API)
| API | Rate Limit | Strategy |
|-----|-----------|----------|
| OpenAlex | Polite pool (no hard limit) | Include `mailto` header; no throttling needed |
| Semantic Scholar | 100 req/s (with key), 1 req/s (without) | Respect 429 with retry-after header |
| Crossref | Polite pool (50 req/s recommended) | Include `mailto` in User-Agent |
| Unpaywall | 100,000 req/day | No throttling needed for our volume |
| Tavily | 1,000 searches/month (free tier) | No throttling; warn in logs if quota low |

### Error Handling Pattern
```python
async def _safe_request(client, method, url, retries=2, **kwargs):
    """Shared retry wrapper. Returns response or None."""
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
        except (httpx.ConnectTimeout, httpx.ReadTimeout):
            if attempt < retries:
                await asyncio.sleep(1 * (attempt + 1))
                continue
            return None
        except httpx.HTTPStatusError:
            return None
    return None
```

Place this in `backend/tools/_http.py` and import from all 5 clients.

---

## Testing

After implementation, verify each client works:
```python
# Quick test script (not committed)
import asyncio
from tools.openalex import search_papers
from tools.semantic_scholar import search_papers as ss_search
from tools.crossref import verify_doi
from tools.unpaywall import get_open_access_url
from tools.tavily_search import search_web

async def test():
    papers = await search_papers(["machine learning healthcare"], limit=3)
    print(f"OpenAlex: {len(papers)} papers")

    ss = await ss_search("deep learning medical imaging", limit=3)
    print(f"Semantic Scholar: {len(ss)} papers")

    doi_data = await verify_doi("10.1038/s41586-020-2649-2")
    print(f"Crossref: {doi_data['title'] if doi_data else 'None'}")

    pdf = await get_open_access_url("10.1038/s41586-020-2649-2")
    print(f"Unpaywall: {pdf or 'No PDF'}")

    web = await search_web("best datasets for NLP research 2024", max_results=3)
    print(f"Tavily: {len(web)} results")

asyncio.run(test())
```

---

## Verification Checklist
- [ ] `backend/tools/` directory created with `__init__.py`
- [ ] All 5 client modules created and importable
- [ ] `.env.example` updated with new variables
- [ ] Each function returns the documented dict structure
- [ ] Error cases handled gracefully (no crashes)
- [ ] No existing files modified (except `.env.example`)
- [ ] Backend server still starts and Phase 1 works normally
