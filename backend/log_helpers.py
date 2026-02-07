"""Shared helpers for SSE broadcasting, agent log persistence, and Supabase operations.

Extracted from main.py to avoid circular imports between main.py and agent modules.
"""

import asyncio
import httpx
import os
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")

# In-memory SSE queues: run_id -> list of asyncio.Queue
_run_queues: dict[str, list[asyncio.Queue]] = {}


def _supabase_headers(token: str, *, prefer: str | None = None) -> dict:
    """Build headers for Supabase PostgREST calls with user token (RLS applies)."""
    h = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    if prefer:
        h["Prefer"] = prefer
    return h


async def emit_log(
    run_id: str,
    token: str,
    agent_name: str,
    event_type: str,
    payload: dict,
) -> dict:
    """Persist an agent log to Supabase AND broadcast to SSE listeners."""
    log_payload = {
        "run_id": run_id,
        "agent_name": agent_name,
        "event_type": event_type,
        "payload": payload,
    }

    headers = _supabase_headers(token, prefer="return=representation")
    log_entry = log_payload  # fallback if persistence fails

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{SUPABASE_URL}/rest/v1/agent_logs",
            json=log_payload,
            headers=headers,
        )
        if resp.status_code in (200, 201):
            rows = resp.json()
            if rows:
                log_entry = rows[0]

    for q in _run_queues.get(run_id, []):
        await q.put(log_entry)

    return log_entry


async def create_artifact(
    run_id: str,
    token: str,
    step_name: str,
    content: dict,
) -> dict | None:
    """Create a versioned artifact in Supabase. Returns the created row or None."""
    headers = _supabase_headers(token)

    # Get latest version for this (run_id, step_name)
    async with httpx.AsyncClient() as client:
        ver_resp = await client.get(
            f"{SUPABASE_URL}/rest/v1/artifacts",
            params={
                "select": "version",
                "run_id": f"eq.{run_id}",
                "step_name": f"eq.{step_name}",
                "order": "version.desc",
                "limit": "1",
            },
            headers=headers,
        )

    latest_version = 0
    if ver_resp.status_code == 200:
        rows = ver_resp.json()
        if rows:
            latest_version = rows[0]["version"]

    payload = {
        "run_id": run_id,
        "step_name": step_name,
        "version": latest_version + 1,
        "content": content,
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{SUPABASE_URL}/rest/v1/artifacts",
            json=payload,
            headers=_supabase_headers(token, prefer="return=representation"),
        )

    if resp.status_code in (200, 201):
        rows = resp.json()
        return rows[0] if rows else None
    return None


async def update_run(
    run_id: str,
    token: str,
    *,
    step: str | None = None,
    status: str | None = None,
) -> None:
    """Update a run's step and/or status in Supabase."""
    patch = {}
    if step is not None:
        patch["step"] = step
    if status is not None:
        patch["status"] = status
    if not patch:
        return

    async with httpx.AsyncClient() as client:
        await client.patch(
            f"{SUPABASE_URL}/rest/v1/runs",
            params={"id": f"eq.{run_id}"},
            json=patch,
            headers=_supabase_headers(token),
        )


async def get_latest_artifact(
    run_id: str,
    token: str,
    step_name: str,
) -> dict | None:
    """Fetch the latest version of an artifact for a given run and step."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{SUPABASE_URL}/rest/v1/artifacts",
            params={
                "select": "*",
                "run_id": f"eq.{run_id}",
                "step_name": f"eq.{step_name}",
                "order": "version.desc",
                "limit": "1",
            },
            headers=_supabase_headers(token),
        )
    if resp.status_code == 200:
        rows = resp.json()
        if rows:
            return rows[0]
    return None
