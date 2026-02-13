"""LangGraph workflow for Phase 2 Step 4: MethodologyWriterAgent.

Single-node graph that generates the comprehensive Research Plan Pack —
the main deliverable of Phase 2.

Input: All previous artifacts (topic, outline, approach, sources, evidence plan, constraints).
Output: phase2_research_plan_pack artifact.
"""

from __future__ import annotations

import json
import re
from datetime import datetime
from typing import TypedDict

from langgraph.graph import StateGraph, END
from langchain_core.messages import HumanMessage, SystemMessage

from groq_client import get_chat_groq, GROQ_MODEL
from log_helpers import emit_log, create_artifact, update_run


# ── Graph State ────────────────────────────────────────────────


class MethodologyState(TypedDict):
    run_id: str
    token: str
    model: str
    accepted_topic: dict
    outline: dict
    constraints: dict
    selected_approach: dict
    sources_pack: dict
    evidence_plan: dict
    feedback: str | None
    research_plan_pack: dict


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


# Template key mapping based on approach
APPROACH_TEMPLATE_MAP = {
    "Survey / Questionnaire": "survey_questions",
    "Survey/Questionnaire": "survey_questions",
    "Controlled Experiment": "experiment_checklist",
    "Interview / Qualitative Study": "interview_guide",
    "Interview/Qualitative Study": "interview_guide",
    "Public Dataset Analysis": None,  # empty templates
    "Systematic Literature Review": "review_protocol",
    "Comparative Evaluation": "evaluation_rubric",
}


def _get_template_key(approach: str) -> str | None:
    """Return the template key for the given approach, or None for empty templates."""
    # Try exact match first
    if approach in APPROACH_TEMPLATE_MAP:
        return APPROACH_TEMPLATE_MAP[approach]
    # Fuzzy match by checking if approach contains key terms
    approach_lower = approach.lower()
    if "survey" in approach_lower or "questionnaire" in approach_lower:
        return "survey_questions"
    if "experiment" in approach_lower:
        return "experiment_checklist"
    if "interview" in approach_lower or "qualitative" in approach_lower:
        return "interview_guide"
    if "dataset" in approach_lower:
        return None
    if "literature review" in approach_lower or "systematic" in approach_lower:
        return "review_protocol"
    if "comparative" in approach_lower or "evaluation" in approach_lower:
        return "evaluation_rubric"
    return None


# ── Node: Methodology Writer ──────────────────────────────────


async def methodology_writer_node(state: MethodologyState) -> dict:
    run_id = state["run_id"]
    token = state["token"]
    accepted_topic = state["accepted_topic"]
    outline = state["outline"]
    constraints = state["constraints"]
    selected_approach = state["selected_approach"]
    sources_pack = state.get("sources_pack", {})
    evidence_plan = state.get("evidence_plan", {})
    feedback = state.get("feedback")

    approach = selected_approach.get("selected_approach", "")
    sel_title = selected_approach.get("selected_title", "")

    await emit_log(run_id, token, "MethodologyWriter", "start", {
        "message": f"Generating Research Plan Pack for approach: {approach}",
    })

    # ── Extract context from all artifacts ──

    # Topic
    selected = accepted_topic.get("selected", accepted_topic)
    topic_title = selected.get("title", "")
    topic_desc = selected.get("description", "")
    topic_keywords = selected.get("keywords", [])

    # Outline
    outline_title = outline.get("title", "")
    outline_sections = outline.get("sections", [])
    sections_detail = []
    for s in outline_sections[:8]:
        name = s.get("name", "")
        bullets = s.get("bullets", [])
        if bullets:
            sections_detail.append(f"- {name}: {'; '.join(bullets[:3])}")
        else:
            sections_detail.append(f"- {name}")
    sections_text = "\n".join(sections_detail) if sections_detail else "N/A"

    # Constraints
    time_budget = constraints.get("time_budget", "weeks")
    data_availability = constraints.get("data_availability", "public_only")
    user_level = constraints.get("metadata", {}).get("user_level", "university")
    resources = constraints.get("resources", {})
    lab_access = resources.get("lab_access", False)
    participants_access = resources.get("participants_access", False)
    software_tools = resources.get("software_tools", [])
    constraint_notes = constraints.get("notes", "")

    # Sources pack summary
    papers = sources_pack.get("papers", [])
    datasets = sources_pack.get("datasets", [])
    tools = sources_pack.get("tools", [])
    kbs = sources_pack.get("knowledge_bases", [])
    top_papers = [p.get("title", "") for p in papers[:5]]
    top_papers_text = "\n".join(f"  - {t}" for t in top_papers) if top_papers else "  None"

    # Evidence plan summary
    evidence_type = evidence_plan.get("evidence_type", "secondary")
    collection_strategy = evidence_plan.get("collection_strategy", [])
    strategy_text = "; ".join(collection_strategy[:4]) if collection_strategy else "N/A"

    n_sources = len(papers) + len(datasets) + len(tools) + len(kbs)

    await emit_log(run_id, token, "MethodologyWriter", "thinking", {
        "message": f"Analyzing topic, constraints, and {n_sources} sources...",
    })

    # ── Determine template instructions ──

    template_key = _get_template_key(approach)

    if template_key == "survey_questions":
        template_instruction = """Generate a "survey_questions" template: an array of 8-12 draft survey questions relevant to this research. Include a mix of Likert scale, multiple choice, and open-ended questions."""
    elif template_key == "experiment_checklist":
        template_instruction = """Generate an "experiment_checklist" template: an array of 10-15 checklist items for setting up and running the experiment (variables, controls, materials, procedure steps, data recording)."""
    elif template_key == "interview_guide":
        template_instruction = """Generate an "interview_guide" template: an array of 8-12 interview topics with probing questions for each topic."""
    elif template_key == "review_protocol":
        template_instruction = """Generate a "review_protocol" template: an object with "databases" (array of database names to search) and "screening_rules" (array of inclusion/exclusion screening steps)."""
    elif template_key == "evaluation_rubric":
        template_instruction = """Generate an "evaluation_rubric" template: an array of objects, each with "criterion" (what to evaluate) and "scoring" (how to score it, e.g. "1-5 scale with descriptors")."""
    else:
        template_instruction = """The templates object should be an empty object {} since this approach (Public Dataset Analysis) does not require a specialized template."""

    # ── Feedback section ──

    feedback_section = ""
    if feedback:
        feedback_section = (
            f"\n\nIMPORTANT — The user reviewed a previous plan and provided this feedback:\n"
            f'"{feedback}"\n'
            "You MUST incorporate this feedback in your new plan.\n"
        )

    # ── Build prompts ──

    system_prompt = f"""You are an expert research methodology advisor creating a comprehensive Research Plan Pack.

Your task: Generate a detailed, actionable research plan that a {user_level}-level researcher can follow step by step.

The plan must be:
- Specific to the topic "{sel_title}" using the "{approach}" approach
- Realistic given the constraints (time: {time_budget}, data: {data_availability})
- Grounded in the sources and evidence plan already gathered
- Actionable with concrete deliverables at each step

Output ONLY valid JSON matching the exact schema below. No markdown, no extra text."""

    tools_str = ", ".join(software_tools) if software_tools else "None specified"

    user_prompt = f"""Create a comprehensive Research Plan Pack for this project.

## Research Context
- Selected Title: "{sel_title}"
- Original Topic: "{topic_title}"
- Description: {topic_desc}
- Keywords: {", ".join(topic_keywords) if topic_keywords else "N/A"}
- Selected Approach: {approach}

## Outline
{sections_text}

## Constraints
- User Level: {user_level}
- Time Budget: {time_budget}
- Data Availability: {data_availability}
- Lab Access: {"Yes" if lab_access else "No"}
- Participants Access: {"Yes" if participants_access else "No"}
- Software Tools: {tools_str}
- Notes: {constraint_notes or "None"}

## Available Sources
- Papers: {len(papers)} (top: {', '.join(top_papers[:3]) if top_papers else 'N/A'})
- Datasets: {len(datasets)}
- Tools: {len(tools)}
- Learning Resources: {len(kbs)}

## Evidence Plan
- Evidence Type: {evidence_type}
- Strategy: {strategy_text}
{feedback_section}
## Required Output JSON Schema

{{
  "final_title": "The finalized research title",
  "final_problem_statement": "A clear, specific 2-3 sentence problem statement",
  "final_research_questions": ["RQ1...", "RQ2...", "RQ3..."],
  "selected_approach": "{approach}",
  "methodology_steps": [
    {{
      "step": 1,
      "name": "Step name",
      "details": ["Specific action 1", "Specific action 2", "..."],
      "deliverables": ["What this step produces"]
    }}
  ],
  "templates": {{ {template_instruction} }},
  "risks_constraints_ethics": [
    {{
      "risk": "Description of the risk",
      "impact": "low|medium|high",
      "mitigation": "How to address this risk"
    }}
  ],
  "next_actions": ["Immediate action 1", "Action 2", "..."]
}}

Rules:
- Generate 5-8 methodology steps, each with 2-4 details and 1-3 deliverables
- Steps should follow a logical sequence appropriate for the {approach} approach
- Include 4-7 risks covering feasibility, data quality, ethics, and time
- Include 5-8 concrete next actions in priority order
- All content must be specific to THIS research project, not generic
- {template_instruction}"""

    # ── LLM call ──

    llm = get_chat_groq(temperature=0.6)
    response = await llm.ainvoke([
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_prompt),
    ])

    result = _parse_json(response.content)

    # ── Log methodology steps ──

    methodology_steps = result.get("methodology_steps", [])
    for step in methodology_steps:
        step_num = step.get("step", "?")
        step_name = step.get("name", "Unnamed")
        await emit_log(run_id, token, "MethodologyWriter", "section", {
            "message": f"Methodology step {step_num}: {step_name}",
        })

    # ── Log templates ──

    templates = result.get("templates", {})
    if templates:
        template_types = list(templates.keys())
        for tt in template_types:
            await emit_log(run_id, token, "MethodologyWriter", "templates", {
                "message": f"Generated {tt} template",
            })
    else:
        await emit_log(run_id, token, "MethodologyWriter", "templates", {
            "message": "No specialized templates needed for this approach",
        })

    # ── Log risks ──

    risks = result.get("risks_constraints_ethics", [])
    await emit_log(run_id, token, "MethodologyWriter", "risks", {
        "message": f"Identified {len(risks)} risks/constraints",
    })

    # ── Log completion summary ──

    next_actions = result.get("next_actions", [])
    await emit_log(run_id, token, "MethodologyWriter", "output", {
        "message": (
            f"Research Plan Pack complete: {len(methodology_steps)} methodology steps, "
            f"{len(risks)} risks, {len(next_actions)} next actions"
        ),
    })

    await emit_log(run_id, token, "MethodologyWriter", "complete", {
        "message": "Phase 2 complete. Research Plan Pack ready for review.",
    })

    return {"research_plan_pack": result}


# ── Build Graph ───────────────────────────────────────────────


def build_methodology_graph():
    graph = StateGraph(MethodologyState)
    graph.add_node("methodology_writer", methodology_writer_node)
    graph.set_entry_point("methodology_writer")
    graph.add_edge("methodology_writer", END)
    return graph.compile()


methodology_graph = build_methodology_graph()


# ── Entry Point ───────────────────────────────────────────────


async def run_methodology_writer(
    run_id: str,
    token: str,
    accepted_topic: dict,
    outline: dict,
    constraints: dict,
    selected_approach: dict,
    sources_pack: dict,
    evidence_plan: dict,
    feedback: str | None = None,
) -> None:
    """Execute the MethodologyWriter pipeline as a background task."""
    model = GROQ_MODEL

    try:
        await update_run(run_id, token, step="phase2_plan", status="running")

        initial_state: MethodologyState = {
            "run_id": run_id,
            "token": token,
            "model": model,
            "accepted_topic": accepted_topic,
            "outline": outline,
            "constraints": constraints,
            "selected_approach": selected_approach,
            "sources_pack": sources_pack,
            "evidence_plan": evidence_plan,
            "feedback": feedback,
            "research_plan_pack": {},
        }

        result = await methodology_graph.ainvoke(initial_state)

        # Add metadata
        plan_pack = result["research_plan_pack"]
        plan_pack["metadata"] = {
            "model": model,
            "created_at": datetime.utcnow().isoformat() + "Z",
            "source_pack_version": sources_pack.get("metadata", {}).get("version", 1),
        }

        await create_artifact(run_id, token, "phase2_research_plan_pack", plan_pack)
        # Phase 2 COMPLETE — status is "completed", not "awaiting_feedback"
        await update_run(run_id, token, step="phase2_plan", status="completed")

    except Exception as e:
        await emit_log(run_id, token, "System", "error", {
            "message": f"Research Plan Pack generation failed: {str(e)}",
        })
        await update_run(run_id, token, status="failed")
