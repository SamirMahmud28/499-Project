"""LangGraph workflow for Phase 1 Step 3: Outline Writer.

Graph: outline_writer -> END
Calls Groq to generate a structured research paper outline from an accepted topic.
"""

from __future__ import annotations

import json
import re
from typing import TypedDict

from langgraph.graph import StateGraph, END
from langchain_core.messages import HumanMessage, SystemMessage

from groq_client import get_chat_groq, GROQ_MODEL
from log_helpers import emit_log, create_artifact, update_run


# ── Graph State ────────────────────────────────────────────────


class OutlineState(TypedDict):
    run_id: str
    token: str
    accepted_topic: dict
    idea: str
    feedback: str | None
    outline: dict
    model: str


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


# ── Node: Outline Writer ─────────────────────────────────────


async def outline_writer_node(state: OutlineState) -> dict:
    run_id = state["run_id"]
    token = state["token"]
    accepted_topic = state["accepted_topic"]
    idea = state.get("idea", "")
    feedback = state.get("feedback")

    selected = accepted_topic.get("selected", {})
    topic_title = selected.get("title", "Untitled")
    topic_desc = selected.get("description", "")
    topic_keywords = selected.get("keywords", [])
    topic_angle = selected.get("research_angle", "")

    await emit_log(run_id, token, "OutlineWriter", "start", {
        "message": f"Generating structured outline for: \"{topic_title}\"",
    })

    feedback_section = ""
    if feedback:
        feedback_section = (
            f"\n\nIMPORTANT — The user provided feedback on a previous outline:\n"
            f"\"{feedback}\"\n"
            "You MUST incorporate this feedback. Adjust the outline accordingly.\n"
        )

    idea_section = ""
    if idea:
        idea_section = f"\nOriginal research idea: \"{idea}\"\n"

    system_prompt = (
        "You are an expert academic research outline architect. "
        "Your task is to create a comprehensive, well-structured research paper outline.\n\n"
        "The outline MUST include:\n"
        "- title: A refined, publication-ready title (may be adjusted from the accepted topic)\n"
        "- abstract: A 6-10 sentence abstract that summarizes the research question, methodology, expected contributions, and significance\n"
        "- sections: An array of section objects, each with:\n"
        "  - name: The section heading\n"
        "  - bullets: 3-6 specific content bullet points describing what goes in this section\n"
        "- keywords: 5-8 academic keywords for the paper\n\n"
        "Standard sections to include (adapt as appropriate for the research angle):\n"
        "1. Introduction (research question, motivation, contribution statement)\n"
        "2. Background & Related Work (literature context, gaps identified)\n"
        "3. Methodology / Theoretical Framework (approach, data sources, tools)\n"
        "4. Data Collection & Analysis / Experimental Design (specifics of how research is conducted)\n"
        "5. Expected Results / Discussion (anticipated findings, implications)\n"
        "6. Limitations & Future Work\n"
        "7. Conclusion\n\n"
        "Each bullet point should be specific and actionable — not vague placeholders.\n\n"
        'Respond ONLY with valid JSON: {"title": "...", "abstract": "...", "sections": [{"name": "...", "bullets": ["..."]}], "keywords": ["..."]}\n'
        "No markdown, no extra text, no explanation outside the JSON."
    )

    user_prompt = (
        f"Create a detailed research paper outline for the following accepted topic:\n\n"
        f"Title: \"{topic_title}\"\n"
        f"Description: {topic_desc}\n"
        f"Research angle: {topic_angle}\n"
        f"Keywords: {', '.join(topic_keywords) if topic_keywords else 'N/A'}\n"
        f"{idea_section}"
        f"{feedback_section}"
    )

    await emit_log(run_id, token, "OutlineWriter", "thinking", {
        "message": "Calling Groq LLM to generate structured outline with sections and bullet points...",
    })

    llm = get_chat_groq(temperature=0.6)
    response = await llm.ainvoke([
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_prompt),
    ])

    outline = _parse_json(response.content)

    # Log each section as it's processed
    sections = outline.get("sections", [])
    for i, section in enumerate(sections):
        section_name = section.get("name", f"Section {i+1}")
        bullet_count = len(section.get("bullets", []))
        await emit_log(run_id, token, "OutlineWriter", "section", {
            "message": f"Section {i+1}/{len(sections)}: \"{section_name}\" ({bullet_count} bullet points)",
            "index": i,
            "section_name": section_name,
        })

    final_title = outline.get("title", topic_title)
    await emit_log(run_id, token, "OutlineWriter", "output", {
        "message": f"Outline ready: \"{final_title}\" — {len(sections)} sections generated.",
    })

    await emit_log(run_id, token, "OutlineWriter", "complete", {
        "message": "Outline generation complete. See artifacts for full details.",
    })

    return {"outline": outline}


# ── Build Graph ───────────────────────────────────────────────


def build_outline_graph():
    """Build and compile the OutlineWriter graph."""
    graph = StateGraph(OutlineState)

    graph.add_node("outline_writer", outline_writer_node)

    graph.set_entry_point("outline_writer")
    graph.add_edge("outline_writer", END)

    return graph.compile()


# Compile once at module level
outline_graph = build_outline_graph()


# ── Entry Point ───────────────────────────────────────────────


async def run_outline(
    run_id: str,
    token: str,
    accepted_topic: dict,
    idea: str = "",
    feedback: str | None = None,
) -> None:
    """Execute the OutlineWriter pipeline as a background task.

    Persists the artifact and updates the run status upon completion.
    On failure, sets run status to 'failed' and logs the error.
    """
    model = GROQ_MODEL

    try:
        await update_run(run_id, token, step="outline", status="running")

        initial_state: OutlineState = {
            "run_id": run_id,
            "token": token,
            "accepted_topic": accepted_topic,
            "idea": idea,
            "feedback": feedback,
            "outline": {},
            "model": model,
        }

        result = await outline_graph.ainvoke(initial_state)

        artifact_content = {
            **result["outline"],
            "metadata": {
                "model": model,
                "feedback": feedback,
                "source_topic": accepted_topic.get("selected", {}).get("title", ""),
            },
        }

        await create_artifact(run_id, token, "outline", artifact_content)
        await update_run(run_id, token, step="outline", status="completed")

    except Exception as e:
        await emit_log(run_id, token, "System", "error", {
            "message": f"Outline pipeline failed: {str(e)}",
        })
        await update_run(run_id, token, status="failed")
