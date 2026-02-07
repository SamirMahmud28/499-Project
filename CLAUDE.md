# ResearchGPT Capstone – Implementation Rules (Phase 1)

## Project goal (Phase 1)
Build a web app for Phase 1 of a multi-agent research assistant:
- Chat-first Wizard UX (3 steps): Idea → Topic & Critic → Outline
- Checkpoints: Regenerate / Accept at steps
- Live streaming agent logs (SSE)
- Multi-user with email/password + email verification
- Private-only projects (no sharing)

## Stack (must follow)
Frontend:
- React + Vite + TypeScript
- TailwindCSS
- shadcn/ui component library
- react-router-dom for routing

Backend:
- Python FastAPI
- SSE for streaming logs
- LangGraph pipeline later (do not add until requested)

Auth/DB:
- Supabase (Auth + Postgres + RLS)
- Email verification required
LLM:
- Groq API (backend-only)

## Repo structure (must keep)
- /frontend
- /backend
- Root README.md
- .env files are NEVER committed
- Provide .env.example in both frontend/ and backend/

## Non-negotiables
- Never put Groq API key in frontend
- Never commit any keys (Supabase anon/service keys, Groq keys)
- Do not add features beyond the prompt scope
- Keep diffs small and easy to review
- Prefer clear, simple implementations over “clever”

## Development defaults
- Frontend dev server: http://localhost:5173
- Backend dev server: http://localhost:8000
- CORS must allow localhost:5173

## Output format for each task
At the end of every task, include:
1) files created/modified
2) commands to run/test
3) short checklist to verify functionality
