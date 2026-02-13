"""LangGraph workflow for Phase 2 Step 2: ApproachRecommenderAgent.

Single-node graph that analyzes topic, outline, and constraints to recommend
the best research approach (+ 2 alternatives), refine the problem statement,
and suggest titles.
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


class ApproachState(TypedDict):
    run_id: str
    token: str
    model: str
    accepted_topic: dict
    outline: dict
    constraints: dict
    feedback: str | None
    approach_recommendation: dict


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


# ── Node: Approach Recommender ─────────────────────────────────


async def approach_recommender_node(state: ApproachState) -> dict:
    run_id = state["run_id"]
    token = state["token"]
    accepted_topic = state["accepted_topic"]
    outline = state["outline"]
    constraints = state["constraints"]
    feedback = state.get("feedback")

    await emit_log(run_id, token, "ApproachRecommender", "start", {
        "message": "Analyzing topic, outline, and constraints to recommend the best research approach...",
    })

    # Extract constraint values for the prompt
    time_budget = constraints.get("time_budget", "weeks")
    data_availability = constraints.get("data_availability", "public_only")
    user_level = constraints.get("metadata", {}).get("user_level", "university")
    resources = constraints.get("resources", {})
    lab_access = resources.get("lab_access", False)
    participants_access = resources.get("participants_access", False)
    software_tools = resources.get("software_tools", [])
    notes = constraints.get("notes", "")

    # Extract topic info
    selected = accepted_topic.get("selected", accepted_topic)
    topic_title = selected.get("title", "")
    topic_desc = selected.get("description", "")
    topic_keywords = selected.get("keywords", [])

    # Extract outline summary
    outline_title = outline.get("title", "")
    outline_sections = outline.get("sections", [])
    sections_summary = "; ".join(
        s.get("name", "") for s in outline_sections[:6]
    ) if outline_sections else "No sections"

    feedback_section = ""
    if feedback:
        feedback_section = (
            f"\n\nIMPORTANT — The user reviewed previous recommendations and provided this feedback:\n"
            f'"{feedback}"\n'
            "You MUST incorporate this feedback in your new recommendation.\n"
        )

    system_prompt = """You are an expert research methodology advisor. Your task is to analyze a research topic and the researcher's constraints to recommend the BEST research approach.

## The 6 Research Approaches

PRIMARY (require new data collection):
1. **Survey / Questionnaire** — Collect new responses via structured questionnaires; analyze patterns and correlations
2. **Controlled Experiment** — Manipulate independent variables; measure outcomes in controlled conditions
3. **Interview / Qualitative Study** — Conduct interviews or focus groups; perform thematic/qualitative analysis

SECONDARY (use existing data/literature):
4. **Public Dataset Analysis** — Use existing datasets/records; perform statistical analysis or modeling
5. **Systematic Literature Review** — Structured search, screening, and synthesis of existing research
6. **Comparative Evaluation** — Compare tools/methods/options using defined rubric and criteria

## Constraint-Based Filtering Rules (MANDATORY)

You MUST apply these hard rules BEFORE ranking approaches:

- If data_availability == "none": EXCLUDE all Primary approaches (Survey, Experiment, Interview). Only recommend Secondary.
- If data_availability == "public_only": EXCLUDE Survey and Experiment. Allow Interview only if participants_access == true.
- If time_budget == "hours": EXCLUDE Survey, Experiment, Interview. Recommend Comparative Eval or Dataset Analysis.
- If time_budget == "days": EXCLUDE Experiment (requires weeks+). All others viable.
- If participants_access == false: EXCLUDE Survey and Interview.
- If lab_access == false: EXCLUDE Experiment.
- If user_level == "school": PREFER Lit Review, Comparative Eval, Dataset Analysis. Only recommend primary if constraints explicitly allow.

After filtering, rank remaining approaches by fit. If fewer than 3 remain, explain why in the tradeoffs.

## Output Format

Respond ONLY with valid JSON matching this exact structure:
{
  "refined_problem_statement": "A clear, specific problem statement (2-3 sentences)",
  "refined_research_questions": ["RQ1...", "RQ2...", "RQ3..."],
  "suggested_titles": ["Title option 1", "Title option 2", "Title option 3"],
  "recommended": {
    "approach": "Name of the approach (exactly as listed above)",
    "why_fit": ["Reason 1", "Reason 2", "Reason 3"],
    "effort_level": "low|medium|high",
    "what_user_must_provide": ["Requirement 1", "Requirement 2"]
  },
  "alternatives": [
    {
      "approach": "Alternative approach 1 name",
      "why": ["Why this could work"],
      "tradeoffs": ["Tradeoff/limitation"]
    },
    {
      "approach": "Alternative approach 2 name",
      "why": ["Why this could work"],
      "tradeoffs": ["Tradeoff/limitation"]
    }
  ]
}

No markdown, no extra text, no explanation outside the JSON."""

    tools_str = ", ".join(software_tools) if software_tools else "None specified"

    user_prompt = f"""Analyze this research topic and recommend the best approach given the constraints.

## Accepted Topic
- Title: "{topic_title}"
- Description: {topic_desc}
- Keywords: {", ".join(topic_keywords) if topic_keywords else "N/A"}

## Outline Summary
- Title: "{outline_title}"
- Sections: {sections_summary}

## Researcher Constraints
- User Level: {user_level}
- Time Budget: {time_budget}
- Data Availability: {data_availability}
- Lab Access: {"Yes" if lab_access else "No"}
- Participants Access: {"Yes" if participants_access else "No"}
- Software Tools: {tools_str}
- Additional Notes: {notes or "None"}
{feedback_section}
Apply the constraint-based filtering rules strictly, then recommend the best approach with 2 alternatives."""

    await emit_log(run_id, token, "ApproachRecommender", "thinking", {
        "message": f"Evaluating approaches for \"{topic_title}\" with constraints: time={time_budget}, data={data_availability}, level={user_level}...",
    })

    llm = get_chat_groq(temperature=0.5)
    response = await llm.ainvoke([
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_prompt),
    ])

    result = _parse_json(response.content)

    # Log the refined problem statement
    await emit_log(run_id, token, "ApproachRecommender", "output", {
        "message": f"Refined problem statement: {result.get('refined_problem_statement', 'N/A')}",
    })

    # Log suggested titles
    titles = result.get("suggested_titles", [])
    for i, t in enumerate(titles):
        await emit_log(run_id, token, "ApproachRecommender", "output", {
            "message": f"Suggested title {i+1}: \"{t}\"",
        })

    # Log the recommendation
    rec = result.get("recommended", {})
    why_fit = "; ".join(rec.get("why_fit", []))
    await emit_log(run_id, token, "ApproachRecommender", "recommendation", {
        "message": (
            f"RECOMMENDED: {rec.get('approach', 'N/A')} (effort: {rec.get('effort_level', 'N/A')})\n"
            f"   Why it fits: {why_fit}\n"
            f"   You must provide: {'; '.join(rec.get('what_user_must_provide', []))}"
        ),
    })

    # Log alternatives
    for alt in result.get("alternatives", []):
        tradeoffs = "; ".join(alt.get("tradeoffs", []))
        await emit_log(run_id, token, "ApproachRecommender", "output", {
            "message": f"Alternative: {alt.get('approach', 'N/A')} — Tradeoffs: {tradeoffs}",
        })

    await emit_log(run_id, token, "ApproachRecommender", "complete", {
        "message": "Approach recommendation complete. Review the recommended approach and alternatives below.",
    })

    return {"approach_recommendation": result}


# ── Build Graph ───────────────────────────────────────────────


def build_approach_graph():
    graph = StateGraph(ApproachState)
    graph.add_node("approach_recommender", approach_recommender_node)
    graph.set_entry_point("approach_recommender")
    graph.add_edge("approach_recommender", END)
    return graph.compile()


approach_graph = build_approach_graph()


# ── Entry Point ───────────────────────────────────────────────


async def run_approach_recommender(
    run_id: str,
    token: str,
    accepted_topic: dict,
    outline: dict,
    constraints: dict,
    feedback: str | None = None,
) -> None:
    """Execute the ApproachRecommender pipeline as a background task."""
    model = GROQ_MODEL

    try:
        await update_run(run_id, token, step="phase2_approach", status="running")

        initial_state: ApproachState = {
            "run_id": run_id,
            "token": token,
            "model": model,
            "accepted_topic": accepted_topic,
            "outline": outline,
            "constraints": constraints,
            "feedback": feedback,
            "approach_recommendation": {},
        }

        result = await approach_graph.ainvoke(initial_state)

        # Add metadata to the recommendation
        from datetime import datetime
        recommendation = result["approach_recommendation"]
        recommendation["metadata"] = {
            "model": model,
            "created_at": datetime.utcnow().isoformat() + "Z",
        }

        await create_artifact(run_id, token, "phase2_approach_recommendation", recommendation)
        await update_run(run_id, token, step="phase2_approach", status="awaiting_feedback")

    except Exception as e:
        await emit_log(run_id, token, "System", "error", {
            "message": f"Approach recommendation failed: {str(e)}",
        })
        await update_run(run_id, token, status="failed")
