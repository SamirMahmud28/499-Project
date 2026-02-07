# Development Documentation

> **Note:** This documentation supplements [CLAUDE.md](../CLAUDE.md), which serves as the master implementation rules. In case of conflicts, CLAUDE.md takes precedence.

## Purpose
This document provides guidelines for contributing to ResearchGPT, including setup instructions, code conventions, development workflow, and common tasks.

---

## Getting Started

### Prerequisites

**Required:**
- **Node.js:** 18.x or higher ([download](https://nodejs.org/))
- **Python:** 3.10 or higher ([download](https://python.org/))
- **Git:** For version control

**Optional:**
- **VS Code:** Recommended IDE
- **Supabase Account:** For auth and database
- **Groq API Key:** For LLM integration

---

### Initial Setup

#### 1. Clone Repository

```bash
git clone https://github.com/yourusername/researchgpt.git
cd researchgpt
```

#### 2. Frontend Setup

```bash
cd frontend
npm install
cp .env.example .env
# Edit .env with your values
npm run dev
```

Frontend runs on: http://localhost:5173

#### 3. Backend Setup

**Windows:**
```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your values
python main.py
```

**Unix/Mac:**
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your values
python main.py
```

Backend runs on: http://localhost:8000

---

## Development Workflow

### Branch Naming Conventions

```
feature/description    # New features
fix/description        # Bug fixes
refactor/description   # Code refactoring
docs/description       # Documentation updates
test/description       # Test additions
chore/description      # Maintenance tasks
```

**Examples:**
- `feature/wizard-topic-generation`
- `fix/sse-connection-timeout`
- `docs/update-api-reference`

---

### Commit Message Standards

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation
- `style` - Code style (formatting, missing semicolons, etc.)
- `refactor` - Code restructuring
- `test` - Adding tests
- `chore` - Maintenance

**Examples:**
```bash
git commit -m "feat(wizard): add topic regeneration button"
git commit -m "fix(backend): resolve SSE connection timeout"
git commit -m "docs: update API.md with new endpoints"
```

---

### Pull Request Process

1. **Create feature branch** from `main`
2. **Make changes** with atomic commits
3. **Test thoroughly** (frontend + backend)
4. **Update documentation** if needed
5. **Push branch** to GitHub
6. **Open Pull Request** with description:
   - What changed?
   - Why was it needed?
   - How to test?
   - Screenshots (if UI changes)
7. **Address review feedback**
8. **Squash and merge** when approved

---

## Code Style

### TypeScript/React Conventions

**File Naming:**
- Components: `PascalCase.tsx` (e.g., `WizardStepper.tsx`)
- Utilities: `camelCase.ts` (e.g., `apiClient.ts`)
- Pages: `PascalCase.tsx` (e.g., `Home.tsx`)

**Component Structure:**
```typescript
import { useState } from 'react'
import { Button } from '@/components/ui/button'

interface MyComponentProps {
  title: string
  onSubmit: (value: string) => void
}

export function MyComponent({ title, onSubmit }: MyComponentProps) {
  const [value, setValue] = useState('')

  const handleSubmit = () => {
    onSubmit(value)
  }

  return (
    <div>
      <h2>{title}</h2>
      <Button onClick={handleSubmit}>Submit</Button>
    </div>
  )
}
```

**Hooks:**
- Use functional components with hooks
- Custom hooks: `use` prefix (e.g., `useWizardState`)

**Imports:**
```typescript
// External packages
import React from 'react'
import { useNavigate } from 'react-router-dom'

// Internal components
import { Button } from '@/components/ui/button'
import { WizardStepper } from '@/components/WizardStepper'

// Utils
import { cn } from '@/lib/utils'

// Types
import type { WizardStep } from '@/types'
```

---

### Python (PEP 8) Conventions

**File Naming:**
- Modules: `snake_case.py` (e.g., `wizard_service.py`)
- Classes: `PascalCase` (e.g., `WizardService`)
- Functions: `snake_case` (e.g., `generate_topic`)

**Code Structure:**
```python
from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException

router = APIRouter()

class TopicRequest(BaseModel):
    idea: str
    user_id: str

class TopicResponse(BaseModel):
    topic: str
    critic_feedback: str

@router.post("/wizard/topic", response_model=TopicResponse)
async def generate_topic(request: TopicRequest):
    """Generate research topic from user idea."""
    try:
        topic = await topic_service.generate(request.idea)
        feedback = await critic_service.critique(topic)
        return TopicResponse(topic=topic, critic_feedback=feedback)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

**Type Hints:**
Always use type hints for function signatures:
```python
async def get_project(project_id: str, user_id: str) -> Optional[Project]:
    ...
```

**Docstrings:**
```python
def complex_function(arg1: str, arg2: int) -> bool:
    """
    Brief description of what the function does.

    Args:
        arg1: Description of arg1
        arg2: Description of arg2

    Returns:
        Description of return value

    Raises:
        ValueError: When input is invalid
    """
    ...
```

---

### Import Ordering

**Python:**
```python
# Standard library
import os
import json
from datetime import datetime

# Third-party packages
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

# Local application
from app.services import wizard_service
from app.models import Project, Run
```

**TypeScript:**
```typescript
// External
import React from 'react'
import { useQuery } from '@tanstack/react-query'

// Internal (@/ imports)
import { Button } from '@/components/ui/button'
import { apiClient } from '@/lib/api'

// Relative imports (avoid when possible)
import { helper } from './utils'
```

---

## File Organization

### Frontend Structure

**Adding a New Component:**
- UI components → `src/components/ui/`
- Feature components → `src/components/`
- Pages → `src/pages/`

**Example:**
```bash
# New feature component
touch src/components/ProjectList.tsx

# New page
touch src/pages/Projects.tsx
```

---

### Backend Structure

**Current (Flat):**
```
backend/
├── main.py
└── requirements.txt
```

**Future (Modular):**
```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── auth.py
│   │   ├── wizard.py
│   │   └── projects.py
│   ├── services/
│   │   ├── __init__.py
│   │   ├── wizard_service.py
│   │   └── groq_service.py
│   ├── models/
│   │   ├── __init__.py
│   │   └── schemas.py
│   └── db/
│       ├── __init__.py
│       └── client.py
└── tests/
```

**Adding a New Endpoint:**
1. Create router in `routers/`
2. Define Pydantic models in `models/schemas.py`
3. Implement business logic in `services/`
4. Register router in `main.py`

---

## Testing Strategy

### Frontend Testing (Future)

**Tools:**
- **Vitest** - Unit testing
- **React Testing Library** - Component testing
- **Playwright** - E2E testing

**Example:**
```typescript
// WizardStepper.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { WizardStepper } from './WizardStepper'

test('navigates to next step', () => {
  render(<WizardStepper />)
  const nextButton = screen.getByText('Next')
  fireEvent.click(nextButton)
  expect(screen.getByText('Topic & Critic')).toBeInTheDocument()
})
```

---

### Backend Testing (Future)

**Tools:**
- **pytest** - Unit and integration testing
- **pytest-asyncio** - Async test support

**Example:**
```python
# tests/test_api.py
import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

@pytest.mark.asyncio
async def test_wizard_idea_submission():
    response = client.post("/wizard/idea", json={"idea": "Test idea"})
    assert response.status_code == 201
    assert "run_id" in response.json()
```

**Run tests:**
```bash
pytest tests/ -v
```

---

## Debugging Tips

### Frontend Debugging

**React DevTools:**
- Install browser extension
- Inspect component tree
- View props and state

**Console Logging:**
```typescript
console.log('Current step:', currentStep)
console.table({ idea, topic, outline })
```

**Network Tab:**
- Monitor API requests
- Check SSE connections
- Inspect response data

**VS Code Debugger:**
Add breakpoints in VS Code, use F5 to start debugging.

---

### Backend Debugging

**Print Debugging:**
```python
import logging
logger = logging.getLogger(__name__)

logger.info(f"Processing run_id: {run_id}")
logger.error(f"Error generating topic: {e}")
```

**Uvicorn Logs:**
Shows all HTTP requests automatically:
```
INFO:     127.0.0.1:59123 - "GET /health HTTP/1.1" 200 OK
```

**Python Debugger:**
```python
import pdb; pdb.set_trace()  # Add breakpoint
```

Or use VS Code debugger with launch configuration.

---

## Common Tasks

### Adding a New shadcn/ui Component

```bash
cd frontend
npx shadcn-ui@latest add [component-name]
```

**Example:**
```bash
npx shadcn-ui@latest add input
npx shadcn-ui@latest add textarea
npx shadcn-ui@latest add dialog
```

Component added to `src/components/ui/[component].tsx`

---

### Adding a New API Endpoint

1. **Define Pydantic models:**
```python
# In main.py or models/schemas.py
class CreateProjectRequest(BaseModel):
    title: str
    description: Optional[str] = None

class ProjectResponse(BaseModel):
    id: str
    title: str
    created_at: str
```

2. **Create endpoint:**
```python
@app.post("/projects", response_model=ProjectResponse)
async def create_project(request: CreateProjectRequest):
    # Implementation
    return ProjectResponse(...)
```

3. **Update API.md** with documentation

4. **Test with Swagger UI:** http://localhost:8000/docs

---

### Adding a New Page/Route

1. **Create page component:**
```typescript
// src/pages/Projects.tsx
export function Projects() {
  return <div>Projects Page</div>
}
```

2. **Add route in App.tsx:**
```typescript
import { Projects } from './pages/Projects'

<Route path="/projects" element={<Projects />} />
```

3. **Add navigation link:**
```typescript
<Link to="/projects">Projects</Link>
```

---

### Connecting to SSE Stream

```typescript
useEffect(() => {
  const eventSource = new EventSource(
    `http://localhost:8000/stream/logs/${runId}`
  )

  eventSource.onmessage = (event) => {
    const log = JSON.parse(event.data)
    setLogs((prev) => [...prev, log])
  }

  eventSource.onerror = () => {
    console.error('SSE error')
    eventSource.close()
  }

  return () => {
    eventSource.close()
  }
}, [runId])
```

---

## Troubleshooting

### Frontend Issues

**Port already in use:**
```bash
# Kill process on port 5173 (Windows)
netstat -ano | findstr :5173
taskkill /PID [PID] /F

# Unix/Mac
lsof -i :5173
kill -9 [PID]
```

**Module not found:**
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
```

---

### Backend Issues

**Port already in use:**
```bash
# Windows
netstat -ano | findstr :8000
taskkill /PID [PID] /F

# Unix/Mac
lsof -i :8000
kill -9 [PID]
```

**Module import errors:**
```bash
# Ensure virtual environment is activated
# Reinstall dependencies
pip install -r requirements.txt
```

**Supabase connection errors:**
- Check `SUPABASE_URL` and keys in `.env`
- Verify internet connection
- Check Supabase project status

---

## Resources

### Documentation
- [React Docs](https://react.dev/)
- [Vite Docs](https://vitejs.dev/)
- [FastAPI Docs](https://fastapi.tiangolo.com/)
- [Supabase Docs](https://supabase.com/docs)
- [TailwindCSS Docs](https://tailwindcss.com/docs)
- [shadcn/ui Docs](https://ui.shadcn.com/)

### Community
- GitHub Issues: Report bugs and feature requests
- Discord/Slack: (Add community links if available)

---

## Code Review Checklist

Before submitting PR:

**Functionality:**
- [ ] Feature works as expected
- [ ] No console errors
- [ ] No TypeScript/Python errors

**Code Quality:**
- [ ] Follows naming conventions
- [ ] Proper error handling
- [ ] No commented-out code
- [ ] No unnecessary console.logs

**Documentation:**
- [ ] README updated if needed
- [ ] API.md updated for new endpoints
- [ ] Comments for complex logic

**Testing:**
- [ ] Tested in development
- [ ] Tested edge cases
- [ ] Manual testing checklist completed

---

## Getting Help

**Questions?**
- Check existing documentation first
- Search GitHub issues
- Ask in team chat/Discord
- Open a discussion on GitHub

**Found a bug?**
- Check if already reported
- Create detailed issue with:
  - Steps to reproduce
  - Expected behavior
  - Actual behavior
  - Screenshots/logs
  - Environment (OS, versions)
