# ResearchGPT – Phase 1

A multi-agent research assistant with chat-first wizard UX.

## Tech Stack

**Frontend:**
- React + Vite + TypeScript
- TailwindCSS + shadcn/ui
- react-router-dom

**Backend:**
- Python FastAPI
- SSE for streaming logs
- Groq API (coming soon)

**Auth/DB:**
- Supabase (coming soon)

## Project Structure

```
/frontend - React app (port 5173)
/backend  - FastAPI server (port 8000)
/docs     - Comprehensive documentation
```

## Documentation

For detailed documentation, see the [`/docs`](./docs) directory:

- **[CLAUDE.md](./CLAUDE.md)** - Master implementation rules (always wins in conflicts)
- **[Frontend](./docs/FRONTEND.md)** - React architecture, components, styling, development
- **[Backend](./docs/BACKEND.md)** - FastAPI patterns, API implementation, server development
- **[API Reference](./docs/API.md)** - Complete endpoint documentation with examples
- **[Architecture](./docs/ARCHITECTURE.md)** - System design, data flow, tech decisions
- **[Database](./docs/DATABASE.md)** - Supabase schema, RLS policies, migrations
- **[Deployment](./docs/DEPLOYMENT.md)** - Production deployment guides and best practices
- **[Development](./docs/DEVELOPMENT.md)** - Contributing guidelines, workflow, common tasks
- **[Authentication](./docs/AUTH.md)** - Auth flows, security, multi-user isolation

## Getting Started

### Prerequisites
- Node.js 18+ and npm
- Python 3.10+
- pip

### Frontend Setup

1. Navigate to frontend:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create `.env` file:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your configuration (use defaults for local dev).

4. Start dev server:
   ```bash
   npm run dev
   ```
   Access at http://localhost:5173

### Backend Setup

1. Navigate to backend:
   ```bash
   cd backend
   ```

2. Create virtual environment:
   ```bash
   python -m venv venv
   ```

3. Activate virtual environment:
   - Windows: `venv\Scripts\activate`
   - Unix/Mac: `source venv/bin/activate`

4. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

5. Create `.env` file:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your keys (not needed for Sprint-0).

6. Start server:
   ```bash
   python main.py
   ```
   or
   ```bash
   uvicorn main:app --reload
   ```
   Access at http://localhost:8000

### Verify Installation

1. Check backend health:
   ```bash
   curl http://localhost:8000/health
   ```
   Should return: `{"status":"ok"}`

2. Test SSE stream:
   ```bash
   curl http://localhost:8000/stream/test
   ```
   Should stream events every second.

3. Check frontend:
   - Open http://localhost:5173
   - You should see "ResearchGPT – Phase 1" with 3-step wizard
   - Collapsible Agent Logs panel

## Development

- Frontend dev server: http://localhost:5173 (with HMR)
- Backend dev server: http://localhost:8000 (with auto-reload)
- API docs: http://localhost:8000/docs (FastAPI Swagger UI)

## Environment Variables

Never commit `.env` files. Use `.env.example` templates in both directories.

## License

Private project – All rights reserved.
