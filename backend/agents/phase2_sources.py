"""LangGraph workflow for Phase 2 Step 3: SourceScout + EvidencePlanner.

2-node sequential graph:
  source_scout -> evidence_planner -> END

SourceScout calls 5 external APIs (OpenAlex, Semantic Scholar, Crossref,
Unpaywall, Tavily) to find real papers, datasets, tools, and knowledge bases.
EvidencePlanner generates an approach-specific evidence collection plan.
"""

from __future__ import annotations

import asyncio
import json
import re
from datetime import datetime
from typing import TypedDict

from langgraph.graph import StateGraph, END
from langchain_core.messages import HumanMessage, SystemMessage

from groq_client import get_chat_groq, GROQ_MODEL
from log_helpers import emit_log, create_artifact, update_run


# ── Graph State ────────────────────────────────────────────────


class SourcesState(TypedDict):
    run_id: str
    token: str
    model: str
    accepted_topic: dict
    outline: dict
    constraints: dict
    selected_approach: dict
    feedback: str | None
    sources_pack: dict
    evidence_plan: dict


# ── Helpers ────────────────────────────────────────────────────


def _parse_json(text: str) -> dict:
    """Parse JSON from LLM output, with fallback for markdown-wrapped responses."""
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            return json.loads(match.group())
        raise ValueError(f"Failed to parse JSON from LLM output: {text[:300]}")


def _normalize_doi(doi: str | None) -> str | None:
    """Normalize DOI to lowercase, strip URL prefixes."""
    if not doi:
        return None
    doi = doi.strip().lower()
    for prefix in ("https://doi.org/", "http://doi.org/", "doi:"):
        if doi.startswith(prefix):
            doi = doi[len(prefix):]
    return doi or None


def _normalize_title_key(title: str) -> str:
    """Create a normalized key from a title for dedup (lowercase, no punctuation)."""
    return re.sub(r"[^a-z0-9 ]", "", title.lower()).strip()


def _clean_snippet(text: str, max_len: int = 200) -> str:
    """Clean and truncate a snippet from web search results."""
    if not text:
        return ""
    # Remove markdown images ![...](...)
    text = re.sub(r"!\[.*?\]\(.*?\)", "", text)
    # Remove markdown links but keep text: [text](url) -> text
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)
    # Remove raw HTML tags
    text = re.sub(r"<[^>]+>", "", text)
    # Collapse whitespace
    text = re.sub(r"\s+", " ", text).strip()
    # Truncate
    if len(text) > max_len:
        text = text[:max_len].rsplit(" ", 1)[0] + "..."
    return text


def _merge_papers(oa_papers: list[dict], ss_papers: list[dict]) -> list[dict]:
    """Merge and deduplicate papers from OpenAlex and Semantic Scholar."""
    merged: dict[str, dict] = {}  # key -> paper

    # Index OpenAlex papers
    for p in oa_papers:
        doi = _normalize_doi(p.get("doi"))
        key = doi if doi else _normalize_title_key(p.get("title", ""))
        if not key:
            continue
        merged[key] = {**p, "_source": "openalex"}

    # Merge Semantic Scholar papers
    for p in ss_papers:
        doi = _normalize_doi(p.get("doi"))
        key = doi if doi else _normalize_title_key(p.get("title", ""))
        if not key:
            continue

        if key in merged:
            existing = merged[key]
            # Prefer SS for citations and abstract
            if p.get("citation_count"):
                existing["cited_by_count"] = p["citation_count"]
            if p.get("influential_citation_count"):
                existing["influential_citation_count"] = p["influential_citation_count"]
            if p.get("abstract"):
                existing["abstract"] = p["abstract"]
            # Prefer OA for open_access_url (already in existing)
            # Add SS url/pdf_url if missing
            if not existing.get("url") and p.get("url"):
                existing["url"] = p["url"]
            if not existing.get("pdf_url") and p.get("pdf_url"):
                existing["pdf_url"] = p["pdf_url"]
            existing["_source"] = "both"
        else:
            merged[key] = {**p, "_source": "semantic_scholar"}
            # Normalize citation field name
            if "citation_count" in p and "cited_by_count" not in merged[key]:
                merged[key]["cited_by_count"] = p["citation_count"]

    # Sort by citation count descending
    papers = list(merged.values())
    papers.sort(key=lambda x: x.get("cited_by_count", 0) or 0, reverse=True)
    return papers


# ── Node 1: Source Scout ──────────────────────────────────────


async def source_scout_node(state: SourcesState) -> dict:
    run_id = state["run_id"]
    token = state["token"]
    accepted_topic = state["accepted_topic"]
    outline = state["outline"]
    selected_approach = state["selected_approach"]
    feedback = state.get("feedback")

    await emit_log(run_id, token, "SourceScout", "start", {
        "message": "Starting source discovery across academic and web databases...",
    })

    # Extract topic info
    selected = accepted_topic.get("selected", accepted_topic)
    topic_title = selected.get("title", "")
    topic_desc = selected.get("description", "")
    topic_keywords = selected.get("keywords", [])
    approach = selected_approach.get("selected_approach", "")
    sel_title = selected_approach.get("selected_title", "")

    # ── Step 1: Generate search keywords via LLM ──────────────

    outline_sections = outline.get("sections", [])
    sections_summary = "; ".join(
        s.get("name", "") for s in outline_sections[:6]
    ) if outline_sections else "No sections"

    feedback_section = ""
    if feedback:
        feedback_section = (
            f"\n\nUser feedback on previous results:\n\"{feedback}\"\n"
            "Adjust your keyword selection accordingly.\n"
        )

    kw_prompt = f"""Generate 5-10 targeted search keywords/phrases for finding academic papers related to this research.

Topic: "{topic_title}"
Description: {topic_desc}
Keywords: {", ".join(topic_keywords) if topic_keywords else "N/A"}
Research approach: {approach}
Outline sections: {sections_summary}
{feedback_section}
Respond ONLY with valid JSON:
{{
  "keywords": ["keyword1", "keyword2", ...]
}}
No markdown, no extra text."""

    await emit_log(run_id, token, "SourceScout", "thinking", {
        "message": "Generating targeted search keywords...",
    })

    llm = get_chat_groq(temperature=0.3)
    kw_response = await llm.ainvoke([
        SystemMessage(content="You are a research librarian expert at crafting search queries. Generate specific, targeted keywords for academic database searches."),
        HumanMessage(content=kw_prompt),
    ])

    kw_result = _parse_json(kw_response.content)
    keywords = kw_result.get("keywords", [topic_title])

    await emit_log(run_id, token, "SourceScout", "thinking", {
        "message": f"Generated {len(keywords)} search keywords: {', '.join(keywords[:5])}{'...' if len(keywords) > 5 else ''}",
    })

    # ── Step 2: Paper search (OpenAlex + Semantic Scholar in parallel) ──

    from tools.openalex import search_papers as oa_search
    from tools.semantic_scholar import search_papers as ss_search

    search_query = " ".join(keywords[:3])  # Use top 3 keywords as query

    oa_papers, ss_papers = await asyncio.gather(
        oa_search(keywords[:5], limit=10),
        ss_search(search_query, limit=10),
        return_exceptions=True,
    )

    # Handle failures gracefully
    if isinstance(oa_papers, Exception):
        await emit_log(run_id, token, "SourceScout", "warning", {
            "message": f"OpenAlex search failed: {str(oa_papers)[:100]}",
        })
        oa_papers = []
    if isinstance(ss_papers, Exception):
        await emit_log(run_id, token, "SourceScout", "warning", {
            "message": f"Semantic Scholar search failed: {str(ss_papers)[:100]}",
        })
        ss_papers = []

    # Merge and deduplicate
    all_papers = _merge_papers(oa_papers, ss_papers)

    await emit_log(run_id, token, "SourceScout", "searching", {
        "message": f"Found {len(oa_papers)} papers from OpenAlex, {len(ss_papers)} from Semantic Scholar, {len(all_papers)} unique after dedup",
    })

    # ── Step 3: DOI verification via Crossref ──────────────────

    from tools.crossref import verify_doi

    dois = [p.get("doi") for p in all_papers if p.get("doi")]
    verified_count = 0

    if dois:
        verify_tasks = [verify_doi(doi) for doi in dois[:15]]  # Cap at 15
        verify_results = await asyncio.gather(*verify_tasks, return_exceptions=True)

        doi_data = {}
        for doi, result in zip(dois[:15], verify_results):
            if isinstance(result, Exception) or result is None:
                continue
            ndoi = _normalize_doi(doi)
            if ndoi:
                doi_data[ndoi] = result
                verified_count += 1

        # Enrich papers with Crossref metadata
        for paper in all_papers:
            ndoi = _normalize_doi(paper.get("doi"))
            if ndoi and ndoi in doi_data:
                cr = doi_data[ndoi]
                if not paper.get("venue") and cr.get("venue"):
                    paper["venue"] = cr["venue"]
                if not paper.get("year") and cr.get("year"):
                    paper["year"] = cr["year"]
                if not paper.get("url") and cr.get("url"):
                    paper["url"] = cr["url"]

    await emit_log(run_id, token, "SourceScout", "searching", {
        "message": f"Verified {verified_count} DOIs via Crossref",
    })

    # ── Step 4: Open access links via Unpaywall ────────────────

    from tools.unpaywall import get_open_access_url

    oa_count = 0
    if dois:
        oa_tasks = [get_open_access_url(doi) for doi in dois[:15]]
        oa_results = await asyncio.gather(*oa_tasks, return_exceptions=True)

        doi_to_pdf: dict[str, str] = {}
        for doi, result in zip(dois[:15], oa_results):
            if isinstance(result, Exception) or result is None:
                continue
            ndoi = _normalize_doi(doi)
            if ndoi and result:
                doi_to_pdf[ndoi] = result
                oa_count += 1

        for paper in all_papers:
            ndoi = _normalize_doi(paper.get("doi"))
            if ndoi and ndoi in doi_to_pdf:
                paper["pdf_url"] = doi_to_pdf[ndoi]

    await emit_log(run_id, token, "SourceScout", "searching", {
        "message": f"Found {oa_count} open-access PDFs via Unpaywall",
    })

    # ── Step 5: Ranking papers via LLM ──────────────────────────

    await emit_log(run_id, token, "SourceScout", "ranking", {
        "message": "Ranking and annotating papers by relevance...",
    })

    # Build source mapping before LLM (so we can re-attach after)
    paper_source_map: dict[str, str] = {}  # normalized_title -> source
    for p in all_papers:
        tkey = _normalize_title_key(p.get("title", ""))
        if tkey:
            paper_source_map[tkey] = p.get("_source", "unknown")

    # Prepare papers summary for LLM (only papers go through LLM)
    papers_for_llm = []
    for p in all_papers[:15]:
        papers_for_llm.append({
            "title": p.get("title", ""),
            "authors": p.get("authors", [])[:3],
            "year": p.get("year"),
            "venue": p.get("venue", ""),
            "doi": p.get("doi", ""),
            "url": p.get("url", ""),
            "pdf_url": p.get("pdf_url", ""),
            "cited_by_count": p.get("cited_by_count", 0),
        })

    ranking_prompt = f"""You are ranking academic papers for relevance to this research project.

Topic: "{sel_title}"
Approach: {approach}
Description: {topic_desc}

## Papers found ({len(papers_for_llm)} total):
{json.dumps(papers_for_llm, indent=2)}

For each paper:
1. Add "why_relevant" — one sentence explaining relevance
2. Add "credibility_notes" — one of: "peer-reviewed", "preprint", "report", "unknown"
3. IMPORTANT: Preserve ALL original fields exactly (title, authors, year, venue, doi, url, pdf_url)

Remove clearly irrelevant papers. Keep the rest sorted by relevance.

Respond ONLY with valid JSON:
{{
  "papers": [{{ "title": "...", "authors": [...], "year": N, "venue": "...", "doi": "...", "url": "...", "pdf_url": "...", "why_relevant": "...", "credibility_notes": "..." }}]
}}
No markdown, no extra text."""

    ranking_response = await llm.ainvoke([
        SystemMessage(content="You are a research resource evaluator. Rank and annotate papers. You MUST preserve all original URLs and DOIs exactly. Respond with JSON only."),
        HumanMessage(content=ranking_prompt),
    ])

    try:
        ranked_papers = _parse_json(ranking_response.content).get("papers", [])
    except (ValueError, json.JSONDecodeError):
        # Fallback: use unranked papers with basic annotations
        ranked_papers = [
            {**{k: v for k, v in p.items() if not k.startswith("_")},
             "why_relevant": "Found via academic database search",
             "credibility_notes": "unknown"}
            for p in all_papers[:10]
        ]

    # Re-attach source info from mapping
    source_labels = {"openalex": "OpenAlex", "semantic_scholar": "Semantic Scholar", "both": "OpenAlex + Semantic Scholar"}
    for p in ranked_papers:
        tkey = _normalize_title_key(p.get("title", ""))
        raw_src = paper_source_map.get(tkey, "unknown")
        p["source"] = source_labels.get(raw_src, "Academic Database")

    # ── Step 6: Tavily searches for datasets, learning resources & tools (parallel) ──

    from tools.tavily_search import search_web

    await emit_log(run_id, token, "SourceScout", "searching", {
        "message": "Searching for datasets, learning resources, and tools via Tavily...",
    })

    # Dataset queries (2-3)
    dataset_queries = [
        f"{topic_title} dataset",
        f"{topic_title} open data benchmark",
    ]
    if topic_keywords:
        dataset_queries.append(f"{topic_keywords[0]} dataset repository")

    # Learning resource queries (4) — use full topic title for relevance
    lr_queries = [
        f"{sel_title} tutorial guide",
        f"{sel_title} online course",
        f"{sel_title} YouTube",
        f"{sel_title} introduction overview",
    ]

    # Tool queries (3-4) — search for actual software/libraries/platforms
    tool_queries = [
        f"{sel_title} software tools library",
        f"{sel_title} research tools platform",
        f"{topic_title} {approach} tools github",
    ]
    if topic_keywords and len(topic_keywords) >= 2:
        tool_queries.append(f"{topic_keywords[0]} {topic_keywords[1]} library framework")

    # Run ALL Tavily queries in parallel
    all_tavily_tasks = (
        [search_web(q, max_results=5) for q in dataset_queries]
        + [search_web(q, max_results=5) for q in lr_queries]
        + [search_web(q, max_results=5) for q in tool_queries]
    )
    all_tavily_results = await asyncio.gather(*all_tavily_tasks, return_exceptions=True)

    # Split results back into dataset vs learning resource vs tool groups
    n_ds_queries = len(dataset_queries)
    n_lr_queries = len(lr_queries)
    ds_results_raw = all_tavily_results[:n_ds_queries]
    lr_results_raw = all_tavily_results[n_ds_queries:n_ds_queries + n_lr_queries]
    tool_results_raw = all_tavily_results[n_ds_queries + n_lr_queries:]

    # ── Flatten & dedup datasets ──
    seen_urls: set[str] = set()
    raw_datasets: list[dict] = []
    for result in ds_results_raw:
        if isinstance(result, Exception) or not result:
            continue
        for item in result:
            url = item.get("url", "")
            if url and url not in seen_urls:
                seen_urls.add(url)
                raw_datasets.append(item)

    # ── Flatten & dedup learning resources ──
    raw_lrs: list[dict] = []
    for result in lr_results_raw:
        if isinstance(result, Exception) or not result:
            continue
        for item in result:
            url = item.get("url", "")
            if url and url not in seen_urls:
                seen_urls.add(url)
                raw_lrs.append(item)

    # ── Flatten & dedup tools ──
    raw_tools: list[dict] = []
    for result in tool_results_raw:
        if isinstance(result, Exception) or not result:
            continue
        for item in result:
            url = item.get("url", "")
            if url and url not in seen_urls:
                seen_urls.add(url)
                raw_tools.append(item)

    await emit_log(run_id, token, "SourceScout", "searching", {
        "message": f"Found {len(raw_datasets)} dataset, {len(raw_lrs)} learning resource, and {len(raw_tools)} tool results via Tavily",
    })

    # ── LLM filter: datasets ──────────────────────────────────

    if raw_datasets:
        ds_summary = json.dumps(
            [{"title": d.get("title",""), "url": d.get("url",""), "snippet": _clean_snippet(d.get("snippet",""), 150)} for d in raw_datasets],
            indent=2,
        )
        dataset_filter_prompt = f"""You are a research data expert. From the following web search results, identify which ones are ACTUAL DATASETS or direct links to dataset repositories.

Topic: "{sel_title}"
Research approach: {approach}

Search results:
{ds_summary}

Rules:
- ONLY include results that are actual datasets, data repositories, or direct links to downloadable data
- Exclude articles ABOUT data, blog posts, tutorials, or papers — those are NOT datasets
- Look for URLs from: kaggle.com, huggingface.co, zenodo.org, data.gov, github.com (with /datasets or data files), archive.ics.uci.edu, figshare.com, dataverse, etc.
- For each real dataset, provide: name, domain (topic area), url (from the search result), why_relevant (one sentence), and license if apparent
- If NONE of the results are actual datasets, return an empty array

Respond ONLY with valid JSON:
{{
  "datasets": [{{"name": "...", "domain": "...", "url": "https://...", "why_relevant": "one sentence", "license": "if known or null"}}]
}}
No markdown, no extra text."""

        dataset_filter_resp = await llm.ainvoke([
            SystemMessage(content="You are a dataset curator. Only select actual datasets from search results. Be strict — articles and papers are NOT datasets."),
            HumanMessage(content=dataset_filter_prompt),
        ])

        try:
            final_datasets = _parse_json(dataset_filter_resp.content).get("datasets", [])
        except (ValueError, json.JSONDecodeError):
            final_datasets = []
    else:
        final_datasets = []

    await emit_log(run_id, token, "SourceScout", "searching", {
        "message": f"Identified {len(final_datasets)} real datasets after filtering",
    })

    # ── LLM filter: learning resources ────────────────────────

    if raw_lrs:
        lr_summary = json.dumps(
            [{"title": d.get("title",""), "url": d.get("url",""), "snippet": _clean_snippet(d.get("snippet",""), 150), "domain": d.get("domain","")} for d in raw_lrs],
            indent=2,
        )
        lr_filter_prompt = f"""You are a research learning resources curator. From the following web search results, select the ones that are genuinely useful learning resources for this research topic.

Full research topic: "{sel_title}"
Description: {topic_desc}
Research approach: {approach}

Search results:
{lr_summary}

Rules:
- Select 8-12 resources that are DIRECTLY relevant to the FULL research topic "{sel_title}"
- A resource must be about the topic as a whole, not just matching a single word from the title
- KEEP: tutorials, online courses, YouTube videos/lectures, blog posts, Wikipedia articles, guides, educational content
- REMOVE: product pages, job listings, news unrelated to the topic, duplicate content, low-quality pages
- For each resource use the EXACT url from the search result (do not modify URLs)
- Extract the source domain from the URL (e.g. "youtube.com", "medium.com", "coursera.org", "wikipedia.org")
- Write a concise why_useful (max 1 sentence, under 150 characters)

Respond ONLY with valid JSON:
{{
  "resources": [{{"name": "...", "url": "https://...", "why_useful": "one short sentence", "source": "domain.com"}}]
}}
No markdown, no extra text."""

        lr_filter_resp = await llm.ainvoke([
            SystemMessage(content="You are a learning resources curator. Select only resources that are directly relevant to the full research topic. Be strict about relevance — each resource must be about the whole topic, not a tangentially related concept."),
            HumanMessage(content=lr_filter_prompt),
        ])

        try:
            lr_filtered = _parse_json(lr_filter_resp.content).get("resources", [])
            # Clean snippets in why_useful
            for r in lr_filtered:
                r["why_useful"] = _clean_snippet(r.get("why_useful", ""), 150)
            final_kbs = lr_filtered
        except (ValueError, json.JSONDecodeError):
            final_kbs = []
    else:
        final_kbs = []

    await emit_log(run_id, token, "SourceScout", "searching", {
        "message": f"Selected {len(final_kbs)} relevant learning resources after filtering",
    })

    # ── Step 7: LLM filters tools from Tavily results ───────

    await emit_log(run_id, token, "SourceScout", "thinking", {
        "message": f"Filtering {len(raw_tools)} tool results for relevance...",
    })

    # Build outline context for tools reasoning
    outline_bullets = []
    for sec in outline_sections[:6]:
        sec_name = sec.get("name", "")
        bullets = sec.get("bullets", [])
        if bullets:
            outline_bullets.append(f"- {sec_name}: {'; '.join(bullets[:3])}")
        else:
            outline_bullets.append(f"- {sec_name}")
    outline_context = "\n".join(outline_bullets) if outline_bullets else "N/A"

    if raw_tools:
        tools_summary = json.dumps(
            [{"title": d.get("title",""), "url": d.get("url",""), "snippet": _clean_snippet(d.get("snippet",""), 200), "domain": d.get("domain","")} for d in raw_tools],
            indent=2,
        )
        tools_filter_prompt = f"""You are a research tools expert. From the following web search results, select ONLY the ones that are actual software tools, libraries, platforms, frameworks, or APIs that a researcher would use for this specific project.

RESEARCH PROJECT:
- Title: "{sel_title}"
- Approach: {approach}
- Description: {topic_desc}
- Outline sections:
{outline_context}

Search results:
{tools_summary}

Think about what tasks the researcher will ACTUALLY perform in this project (data collection, analysis, visualization, statistical testing, etc.), then select only tools that directly help with those tasks.

Rules:
- Select 5-10 tools that are REAL software, libraries, platforms, or APIs
- Each tool must be specifically useful for THIS research project, not just generically related
- KEEP: GitHub repos, official tool/library websites, platform landing pages, API documentation
- REMOVE: blog posts ABOUT tools, news articles, comparison articles, job listings, generic pages
- Use the EXACT url from the search result (do not modify URLs)
- NO generic tools (Python, R, Excel, Google Scholar, Word) — only specific, actionable tools
- Classify each tool type as: library, platform, api, instrument, framework, or dataset_tool
- Write why_useful explaining the SPECIFIC research task this tool helps with in THIS project

Respond ONLY with valid JSON:
{{
  "tools": [{{"name": "...", "type": "library|platform|api|instrument|framework|dataset_tool", "url": "https://...", "why_useful": "Helps with [specific task] in this project"}}]
}}
No markdown, no extra text."""

        tools_filter_resp = await llm.ainvoke([
            SystemMessage(content="You are a research tools curator. Select only actual software tools, libraries, and platforms from search results that are specifically useful for the given research project. Be strict — articles about tools are NOT tools. Only include results where the URL leads to the actual tool/library."),
            HumanMessage(content=tools_filter_prompt),
        ])

        try:
            final_tools = _parse_json(tools_filter_resp.content).get("tools", [])
            for t in final_tools:
                t["why_useful"] = _clean_snippet(t.get("why_useful", ""), 150)
        except (ValueError, json.JSONDecodeError):
            final_tools = []
    else:
        final_tools = []

    n_papers = len(ranked_papers)
    n_datasets = len(final_datasets)
    n_tools = len(final_tools)
    n_kbs = len(final_kbs)

    await emit_log(run_id, token, "SourceScout", "ranking", {
        "message": f"Final resources: {n_papers} papers, {n_datasets} datasets, {n_tools} tools, {n_kbs} learning resources",
    })

    # Build final sources_pack
    sources_pack = {
        "metadata": {
            "created_at": datetime.utcnow().isoformat() + "Z",
            "search_keywords": keywords,
            "source_providers": ["openalex", "semanticscholar", "crossref", "unpaywall", "tavily"],
        },
        "papers": ranked_papers,
        "datasets": final_datasets,
        "tools": final_tools,
        "knowledge_bases": final_kbs,
    }

    total = n_papers + n_datasets + n_tools + n_kbs
    await emit_log(run_id, token, "SourceScout", "complete", {
        "message": f"Source discovery complete. {total} total resources with links.",
    })

    return {"sources_pack": sources_pack}


# ── Node 2: Evidence Planner ──────────────────────────────────


async def evidence_planner_node(state: SourcesState) -> dict:
    run_id = state["run_id"]
    token = state["token"]
    selected_approach = state["selected_approach"]
    constraints = state["constraints"]
    sources_pack = state["sources_pack"]

    await emit_log(run_id, token, "EvidencePlanner", "start", {
        "message": "Generating evidence collection plan based on selected approach...",
    })

    approach = selected_approach.get("selected_approach", "")
    title = selected_approach.get("selected_title", "")

    # Summarize available resources
    n_papers = len(sources_pack.get("papers", []))
    n_datasets = len(sources_pack.get("datasets", []))
    n_tools = len(sources_pack.get("tools", []))

    time_budget = constraints.get("time_budget", "weeks")
    data_availability = constraints.get("data_availability", "public_only")
    user_level = constraints.get("metadata", {}).get("user_level", "university")

    system_prompt = """You are an expert research methodology advisor. Generate a detailed evidence collection plan tailored to the selected research approach.

The plan must be specific to the approach type:
- Survey / Questionnaire → survey design, sampling, distribution, response analysis
- Controlled Experiment → variables, control/treatment groups, measurement, protocols
- Interview / Qualitative Study → participant selection, interview guide, coding, thematic analysis
- Public Dataset Analysis → dataset selection criteria, preprocessing, statistical methods
- Systematic Literature Review → database search strategy, screening criteria, synthesis method
- Comparative Evaluation → criteria definition, scoring rubric, comparison framework

Respond ONLY with valid JSON:
{
  "evidence_type": "primary|secondary",
  "collection_strategy": ["Step 1: ...", "Step 2: ...", "Step 3: ..."],
  "inclusion_exclusion": {
    "include": ["criteria 1", "criteria 2"],
    "exclude": ["criteria 1", "criteria 2"]
  },
  "analysis_overview": "Description of how data/evidence will be analyzed",
  "expected_outputs": ["output 1", "output 2"]
}
No markdown, no extra text."""

    user_prompt = f"""Generate an evidence collection plan for this research project.

Title: "{title}"
Approach: {approach}
Time Budget: {time_budget}
Data Availability: {data_availability}
User Level: {user_level}

Available Resources:
- {n_papers} academic papers found
- {n_datasets} datasets identified
- {n_tools} tools/software identified

Create a realistic, actionable plan that fits the constraints and leverages the available resources."""

    await emit_log(run_id, token, "EvidencePlanner", "thinking", {
        "message": f"Designing evidence plan for {approach} approach with {time_budget} time budget...",
    })

    llm = get_chat_groq(temperature=0.4)
    response = await llm.ainvoke([
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_prompt),
    ])

    evidence_plan = _parse_json(response.content)
    evidence_plan["metadata"] = {
        "created_at": datetime.utcnow().isoformat() + "Z",
    }

    ev_type = evidence_plan.get("evidence_type", "unknown")
    n_steps = len(evidence_plan.get("collection_strategy", []))

    await emit_log(run_id, token, "EvidencePlanner", "output", {
        "message": f"Evidence type: {ev_type}. Collection plan: {n_steps} steps. Analysis: {evidence_plan.get('analysis_overview', 'N/A')[:100]}...",
    })

    await emit_log(run_id, token, "EvidencePlanner", "complete", {
        "message": "Evidence collection plan complete.",
    })

    return {"evidence_plan": evidence_plan}


# ── Build Graph ───────────────────────────────────────────────


def build_sources_graph():
    graph = StateGraph(SourcesState)
    graph.add_node("source_scout", source_scout_node)
    graph.add_node("evidence_planner", evidence_planner_node)
    graph.set_entry_point("source_scout")
    graph.add_edge("source_scout", "evidence_planner")
    graph.add_edge("evidence_planner", END)
    return graph.compile()


sources_graph = build_sources_graph()


# ── Entry Point ───────────────────────────────────────────────


async def run_sources_and_evidence(
    run_id: str,
    token: str,
    accepted_topic: dict,
    outline: dict,
    constraints: dict,
    selected_approach: dict,
    feedback: str | None = None,
) -> None:
    """Execute the SourceScout + EvidencePlanner pipeline as a background task."""
    model = GROQ_MODEL

    try:
        await update_run(run_id, token, step="phase2_sources", status="running")

        initial_state: SourcesState = {
            "run_id": run_id,
            "token": token,
            "model": model,
            "accepted_topic": accepted_topic,
            "outline": outline,
            "constraints": constraints,
            "selected_approach": selected_approach,
            "feedback": feedback,
            "sources_pack": {},
            "evidence_plan": {},
        }

        result = await sources_graph.ainvoke(initial_state)

        # Persist both artifacts
        await create_artifact(run_id, token, "phase2_sources_pack", result["sources_pack"])
        await create_artifact(run_id, token, "phase2_evidence_plan", result["evidence_plan"])

        await update_run(run_id, token, step="phase2_sources", status="awaiting_feedback")

    except Exception as e:
        await emit_log(run_id, token, "System", "error", {
            "message": f"Sources & evidence pipeline failed: {str(e)}",
        })
        await update_run(run_id, token, status="failed")
