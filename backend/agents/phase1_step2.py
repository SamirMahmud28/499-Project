"""LangGraph workflow for Phase 1 Step 2: TopicProposer + Critic.

Graph: topic_proposer -> critic -> END
Each node calls Groq and emits agent_logs for live SSE streaming.
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


class TopicCriticState(TypedDict):
    run_id: str
    token: str
    idea: str
    feedback: str | None
    num_candidates: int
    candidates: list[dict]
    critic_result: dict
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


# ── Node: Topic Proposer ──────────────────────────────────────


async def topic_proposer_node(state: TopicCriticState) -> dict:
    run_id = state["run_id"]
    token = state["token"]
    idea = state["idea"]
    feedback = state.get("feedback")
    num_candidates = state.get("num_candidates", 5)

    await emit_log(run_id, token, "TopicProposer", "start", {
        "message": f"Generating {num_candidates} diverse research topic candidates from idea: \"{idea}\"",
    })

    feedback_section = ""
    if feedback:
        feedback_section = (
            f"\n\nIMPORTANT — The user reviewed previous candidates and provided this feedback:\n"
            f"\"{feedback}\"\n"
            "You MUST incorporate this feedback. Adjust the topics accordingly.\n"
        )

    system_prompt = (
        "You are an expert academic research topic proposal agent. "
        "Your goal is to transform a broad research idea into specific, novel, and academically rigorous research topics.\n\n"
        "Guidelines for generating high-quality topics:\n"
        "- Each topic must be SPECIFIC enough to be a thesis or research paper title — avoid vague/generic titles\n"
        "- Topics should explore DIFFERENT angles, methods, or sub-domains of the idea\n"
        "- Include a clear research angle (e.g., comparative study, causal analysis, systematic review, case study, experimental design)\n"
        "- Titles should hint at methodology or scope (e.g., 'A Comparative Analysis of...', 'Evaluating the Impact of... on...')\n"
        "- Descriptions must specify: what is being studied, what method/approach is used, and what gap it addresses\n"
        "- Keywords should be terms that would appear in an academic paper index\n\n"
        "Each candidate MUST have:\n"
        "- title: A specific, publication-ready research title (10-20 words)\n"
        "- description: 2-3 sentences explaining the scope, methodology angle, and what makes this topic valuable\n"
        "- keywords: 4-6 relevant academic keywords\n"
        "- research_angle: one of ['comparative_study', 'causal_analysis', 'systematic_review', 'experimental', 'case_study', 'mixed_methods', 'theoretical_framework']\n\n"
        'Respond ONLY with valid JSON: {"candidates": [{"title": "...", "description": "...", "keywords": ["..."], "research_angle": "..."}]}\n'
        "No markdown, no extra text, no explanation outside the JSON."
    )

    user_prompt = (
        f"Research idea: \"{idea}\"\n\n"
        f"Generate exactly {num_candidates} distinct research topic candidates. "
        "Each must take a meaningfully different angle or sub-domain. "
        "Avoid generic or overlapping topics."
        f"{feedback_section}"
    )

    await emit_log(run_id, token, "TopicProposer", "thinking", {
        "message": f"Calling Groq LLM to brainstorm {num_candidates} specific research angles...",
    })

    llm = get_chat_groq(temperature=0.8)
    response = await llm.ainvoke([
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_prompt),
    ])

    parsed = _parse_json(response.content)
    candidates = parsed["candidates"]

    # Log each candidate individually so the user can see them in real-time
    for i, c in enumerate(candidates):
        title = c.get("title", "Untitled")
        angle = c.get("research_angle", "N/A")
        desc = c.get("description", "")
        keywords = ", ".join(c.get("keywords", []))
        await emit_log(run_id, token, "TopicProposer", "candidate", {
            "message": f"Topic {i+1}/{len(candidates)}: \"{title}\" [{angle}] — {desc[:120]}{'...' if len(desc) > 120 else ''}",
            "index": i,
            "title": title,
            "keywords": keywords,
        })

    await emit_log(run_id, token, "TopicProposer", "complete", {
        "message": f"Generated {len(candidates)} topic candidates. Passing to Critic for evaluation.",
    })

    return {"candidates": candidates}


# ── Node: Critic ──────────────────────────────────────────────


async def critic_node(state: TopicCriticState) -> dict:
    run_id = state["run_id"]
    token = state["token"]
    candidates = state["candidates"]

    await emit_log(run_id, token, "TopicCritic", "start", {
        "message": f"Starting critical evaluation of {len(candidates)} topic candidates...",
    })

    candidates_text = json.dumps(candidates, indent=2)

    system_prompt = (
        "You are a senior academic research advisor acting as a critical evaluator. "
        "Your job is to rigorously evaluate research topic candidates and recommend the BEST one.\n\n"
        "Evaluate each candidate on these criteria (score each 1-10):\n"
        "1. **Novelty** — Does this address a genuine gap in existing literature? Is it original?\n"
        "2. **Feasibility** — Can this be researched within a reasonable scope (6-12 months)? Are data/methods accessible?\n"
        "3. **Specificity** — Is the research question clear and well-scoped? (Penalize vague/broad topics heavily)\n"
        "4. **Impact** — Would this contribute meaningfully to the field? Is it relevant to current discourse?\n"
        "5. **Methodology fit** — Does the described approach match the research question?\n\n"
        "For each candidate provide:\n"
        "- rank: integer (1 = best)\n"
        "- candidate_index: 0-based index in the input array\n"
        "- title: the candidate's title\n"
        "- scores: {novelty: float, feasibility: float, specificity: float, impact: float, methodology_fit: float}\n"
        "- overall_score: weighted average (specificity has 2x weight)\n"
        "- strengths: array of 2-3 specific strengths\n"
        "- weaknesses: array of 1-2 specific weaknesses\n"
        "- one_line_verdict: a single sentence assessment\n\n"
        "Also provide:\n"
        "- recommended_index: 0-based index of the best candidate\n"
        "- recommendation: 2-3 sentences explaining WHY this topic is the best choice\n"
        "- suggested_narrowing: how to further narrow/focus the recommended topic for maximum impact\n"
        "- research_questions: 3-5 concrete, testable research questions for the recommended topic\n"
        "- methodology_suggestion: 1-2 sentences on the best research methodology for the recommended topic\n\n"
        'Respond ONLY with valid JSON: {"rankings": [...], "recommended_index": N, "recommendation": "...", '
        '"suggested_narrowing": "...", "research_questions": [...], "methodology_suggestion": "..."}\n'
        "No markdown, no extra text, no explanation outside the JSON."
    )

    user_prompt = (
        f"Critically evaluate these {len(candidates)} research topic candidates. "
        "Be rigorous — penalize vague, overly broad, or generic topics. "
        "Reward specificity, clear methodology, and genuine novelty.\n\n"
        f"Candidates:\n{candidates_text}"
    )

    await emit_log(run_id, token, "TopicCritic", "thinking", {
        "message": "Analyzing each candidate for novelty, feasibility, specificity, impact, and methodology fit...",
    })

    llm = get_chat_groq(temperature=0.3)
    response = await llm.ainvoke([
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_prompt),
    ])

    critic_result = _parse_json(response.content)

    # Log each candidate's evaluation so the user can see the reasoning
    rankings = critic_result.get("rankings", [])
    for r in sorted(rankings, key=lambda x: x.get("rank", 99)):
        rank = r.get("rank", "?")
        title = r.get("title", "Untitled")
        score = r.get("overall_score", "N/A")
        scores = r.get("scores", {})
        verdict = r.get("one_line_verdict", "")
        strengths = "; ".join(r.get("strengths", []))
        weaknesses = "; ".join(r.get("weaknesses", []))

        score_detail = ", ".join(f"{k}={v}" for k, v in scores.items()) if scores else ""

        await emit_log(run_id, token, "TopicCritic", "evaluation", {
            "message": (
                f"#{rank} (score: {score}/10) \"{title}\"\n"
                f"   Scores: {score_detail}\n"
                f"   Strengths: {strengths}\n"
                f"   Weaknesses: {weaknesses}\n"
                f"   Verdict: {verdict}"
            ),
            "rank": rank,
            "title": title,
            "overall_score": score,
        })

    rec_idx = critic_result.get("recommended_index", 0)
    rec_title = candidates[rec_idx]["title"] if rec_idx < len(candidates) else "N/A"
    recommendation = critic_result.get("recommendation", "")
    narrowing = critic_result.get("suggested_narrowing", "")
    rqs = critic_result.get("research_questions", [])

    await emit_log(run_id, token, "TopicCritic", "recommendation", {
        "message": (
            f"RECOMMENDED: \"{rec_title}\"\n"
            f"   Why: {recommendation}\n"
            f"   Suggested narrowing: {narrowing}\n"
            f"   Research questions: {'; '.join(rqs)}"
        ),
        "recommended_index": rec_idx,
        "recommended_title": rec_title,
    })

    await emit_log(run_id, token, "TopicCritic", "complete", {
        "message": "Topic critique complete. See artifacts for full details.",
    })

    return {"critic_result": critic_result}


# ── Build Graph ───────────────────────────────────────────────


def build_topic_critic_graph():
    """Build and compile the TopicProposer -> Critic graph."""
    graph = StateGraph(TopicCriticState)

    graph.add_node("topic_proposer", topic_proposer_node)
    graph.add_node("critic", critic_node)

    graph.set_entry_point("topic_proposer")
    graph.add_edge("topic_proposer", "critic")
    graph.add_edge("critic", END)

    return graph.compile()


# Compile once at module level, reuse for every invocation
topic_critic_graph = build_topic_critic_graph()


# ── Entry Point ───────────────────────────────────────────────


async def run_topic_critic(
    run_id: str,
    token: str,
    idea: str,
    feedback: str | None = None,
    num_candidates: int = 5,
) -> None:
    """Execute the full TopicProposer + Critic pipeline as a background task.

    Persists the artifact and updates the run status upon completion.
    On failure, sets run status to 'failed' and logs the error.
    """
    model = GROQ_MODEL

    try:
        await update_run(run_id, token, step="topic_critic", status="running")

        initial_state: TopicCriticState = {
            "run_id": run_id,
            "token": token,
            "idea": idea,
            "feedback": feedback,
            "num_candidates": num_candidates,
            "candidates": [],
            "critic_result": {},
            "model": model,
        }

        result = await topic_critic_graph.ainvoke(initial_state)

        artifact_content = {
            "candidates": result["candidates"],
            "critic_result": result["critic_result"],
            "metadata": {
                "num_candidates": num_candidates,
                "model": model,
                "feedback": feedback,
            },
        }

        await create_artifact(run_id, token, "topic_critic", artifact_content)
        await update_run(run_id, token, step="topic_critic", status="awaiting_feedback")

    except Exception as e:
        await emit_log(run_id, token, "System", "error", {
            "message": f"Topic-critic pipeline failed: {str(e)}",
        })
        await update_run(run_id, token, status="failed")
