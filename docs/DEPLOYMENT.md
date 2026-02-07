# Deployment Documentation

> **Note:** This documentation supplements [CLAUDE.md](../CLAUDE.md), which serves as the master implementation rules. In case of conflicts, CLAUDE.md takes precedence.

## Purpose
This document covers production deployment procedures, environment setup, hosting recommendations, and operations for ResearchGPT.

---

## Environment Variables

### Frontend Environment Variables

**Required for Production:**

```env
VITE_BACKEND_URL=https://api.yourdomain.com
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Notes:**
- All Vite env vars must be prefixed with `VITE_`
- Anon key is **safe to expose** (it's public by design)
- Never include service role key in frontend

---

### Backend Environment Variables

**Required for Production:**

```env
# Groq API
GROQ_API_KEY=gsk_...

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Optional: Production settings
PORT=8000
ENVIRONMENT=production
LOG_LEVEL=info
```

**Security:**
- **NEVER commit .env files**
- Use platform secrets management
- Service role key is **highly sensitive** (full database access)

---

## Frontend Deployment

### Recommended Platforms

**1. Vercel (Recommended)**
- ✅ Automatic deployments from Git
- ✅ Built-in CI/CD
- ✅ Edge network (fast globally)
- ✅ Free tier available
- ✅ Excellent Vite support

**2. Netlify**
- ✅ Similar features to Vercel
- ✅ Good free tier
- ✅ Easy configuration

**3. Cloudflare Pages**
- ✅ Very fast edge network
- ✅ Generous free tier

---

### Deploying to Vercel

#### Step 1: Install Vercel CLI

```bash
npm install -g vercel
```

#### Step 2: Configure Project

Create `vercel.json` in frontend directory:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "installCommand": "npm install"
}
```

#### Step 3: Set Environment Variables

In Vercel Dashboard:
- Go to Project Settings → Environment Variables
- Add `VITE_BACKEND_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- Set for Production, Preview, and Development environments

#### Step 4: Deploy

**From CLI:**
```bash
cd frontend
vercel --prod
```

**From Git:**
- Connect GitHub/GitLab repo to Vercel
- Automatic deployments on push to main branch
- Preview deployments for PRs

#### Step 5: Configure Domain

- Add custom domain in Vercel dashboard
- Update DNS records as instructed

---

### Build Configuration

**Build Command:**
```bash
npm run build
```

**Output Directory:**
```
dist/
```

**Build Checks:**
- No TypeScript errors
- No ESLint errors (if configured)
- Environment variables validated at build time

**Build Output:**
```
dist/
├── index.html
├── assets/
│   ├── index-[hash].js
│   ├── index-[hash].css
│   └── ...
└── ...
```

---

## Backend Deployment

### Recommended Platforms

**1. Railway (Recommended)**
- ✅ Simple Python deployment
- ✅ Automatic HTTPS
- ✅ Built-in logs and metrics
- ✅ Good free tier ($5 credit/month)
- ✅ Easy environment variables

**2. Google Cloud Run**
- ✅ Serverless (auto-scaling)
- ✅ Pay-per-use
- ✅ Free tier (2 million requests/month)
- ❌ Requires Dockerfile

**3. Fly.io**
- ✅ Global edge deployment
- ✅ Free tier available
- ❌ Requires Dockerfile

**4. Heroku**
- ✅ Easy setup
- ❌ No free tier anymore
- ❌ Slower cold starts

---

### Deploying to Railway

#### Step 1: Install Railway CLI

```bash
npm install -g @railway/cli
railway login
```

#### Step 2: Create Project

```bash
cd backend
railway init
```

#### Step 3: Configure Start Command

Railway auto-detects Python, but specify start command:

Create `Procfile`:
```
web: uvicorn main:app --host 0.0.0.0 --port $PORT
```

Or use `railway.json`:
```json
{
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "uvicorn main:app --host 0.0.0.0 --port $PORT",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 100
  }
}
```

#### Step 4: Set Environment Variables

```bash
railway variables set GROQ_API_KEY=gsk_...
railway variables set SUPABASE_URL=https://xxx.supabase.co
railway variables set SUPABASE_ANON_KEY=...
railway variables set SUPABASE_SERVICE_ROLE_KEY=...
```

Or in Railway dashboard → Variables

#### Step 5: Deploy

```bash
railway up
```

#### Step 6: Get URL

```bash
railway domain
```

Returns: `https://your-app.railway.app`

Update frontend `VITE_BACKEND_URL` to this URL.

---

### Deploying to Google Cloud Run

#### Step 1: Create Dockerfile

```dockerfile
# backend/Dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Run
CMD uvicorn main:app --host 0.0.0.0 --port $PORT
```

#### Step 2: Build and Push

```bash
gcloud builds submit --tag gcr.io/PROJECT_ID/researchgpt-backend

gcloud run deploy researchgpt-backend \
  --image gcr.io/PROJECT_ID/researchgpt-backend \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated
```

#### Step 3: Set Environment Variables

```bash
gcloud run services update researchgpt-backend \
  --set-env-vars GROQ_API_KEY=gsk_...,SUPABASE_URL=...
```

---

### Backend Production Checklist

- [ ] Set all environment variables
- [ ] Update CORS to allow production frontend URL
- [ ] Disable debug mode
- [ ] Configure logging to external service
- [ ] Set up health check monitoring
- [ ] Configure auto-scaling (if applicable)
- [ ] Test `/health` endpoint
- [ ] Test SSE streaming under load

---

## Database Migration

### Running Migrations in Production

**Option 1: Supabase Dashboard**
- Navigate to SQL Editor
- Run migration SQL files manually
- Verify with test queries

**Option 2: Supabase CLI**
```bash
supabase db push --db-url postgres://...
```

**Important:**
- Always test migrations on staging first
- Use transactions for safety
- Back up before running migrations

---

## CORS Configuration

Update backend CORS for production:

**Development:**
```python
allow_origins=["http://localhost:5173"]
```

**Production:**
```python
allow_origins=[
    "https://yourdomain.com",
    "https://www.yourdomain.com",
    "http://localhost:5173"  # Keep for local testing
]
```

**Dynamic CORS (recommended):**
```python
import os

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

Then set `FRONTEND_URL` environment variable on backend platform.

---

## CI/CD Pipeline

### GitHub Actions

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - name: Install and Build
        working-directory: ./frontend
        run: |
          npm ci
          npm run build
      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v20
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          working-directory: ./frontend

  deploy-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Deploy to Railway
        uses: bervProject/railway-deploy@main
        with:
          railway_token: ${{ secrets.RAILWAY_TOKEN }}
          service: backend
```

### Secrets Setup

Add to GitHub Secrets:
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `RAILWAY_TOKEN`

---

## Monitoring

### Health Checks

**Endpoint:** `GET /health`

**Use for:**
- Load balancer health checks
- Uptime monitoring (UptimeRobot, Pingdom)
- Alerting

**Response:**
```json
{"status": "ok"}
```

**Enhanced Health Check:**
```python
@app.get("/health")
async def health_check():
    # Check database
    try:
        await db.execute("SELECT 1")
        db_status = "ok"
    except:
        db_status = "error"

    # Check external APIs
    groq_status = await check_groq_api()

    return {
        "status": "ok" if all([db_status == "ok", groq_status == "ok"]) else "degraded",
        "database": db_status,
        "groq_api": groq_status,
        "timestamp": datetime.utcnow().isoformat()
    }
```

---

### Error Tracking

**Sentry Integration:**

```bash
pip install sentry-sdk[fastapi]
```

```python
import sentry_sdk

sentry_sdk.init(
    dsn=os.getenv("SENTRY_DSN"),
    environment=os.getenv("ENVIRONMENT", "production"),
    traces_sample_rate=0.1,
)
```

**Frontend (React):**
```bash
npm install @sentry/react
```

```typescript
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.VITE_ENVIRONMENT,
});
```

---

### Logging

**Production Logging Best Practices:**

```python
import logging
import json

# Structured logging
logger = logging.getLogger(__name__)

def log_structured(level, message, **kwargs):
    log_data = {
        "message": message,
        "timestamp": datetime.utcnow().isoformat(),
        **kwargs
    }
    logger.log(level, json.dumps(log_data))

# Usage
log_structured(logging.INFO, "User logged in", user_id="123", ip="1.2.3.4")
```

**Log Aggregation:**
- Railway: Built-in logs
- Cloud Run: Google Cloud Logging
- Self-hosted: ELK stack, Loki

---

## Performance Optimization

### Frontend

**Code Splitting:**
```typescript
// Lazy load routes
const Login = lazy(() => import('./pages/Login'))

<Suspense fallback={<Loading />}>
  <Route path="/login" element={<Login />} />
</Suspense>
```

**Bundle Analysis:**
```bash
npm run build -- --analyze
```

**Asset Optimization:**
- Images: WebP format, lazy loading
- Fonts: Subset, preload

---

### Backend

**Async Everything:**
```python
# Good
async def get_data():
    async with httpx.AsyncClient() as client:
        return await client.get(...)

# Bad (blocks event loop)
def get_data():
    return requests.get(...)
```

**Connection Pooling:**
```python
# Reuse HTTP client
client = httpx.AsyncClient()

@app.on_event("shutdown")
async def shutdown():
    await client.aclose()
```

**Caching:**
```python
from functools import lru_cache

@lru_cache(maxsize=100)
def expensive_operation():
    ...
```

---

## Scaling Strategies

### Horizontal Scaling

**Load Balancer + Multiple Instances:**
```
        ┌─────────────┐
        │Load Balancer│
        └──────┬──────┘
               │
      ┌────────┴────────┐
      │                 │
┌─────▼────┐      ┌────▼─────┐
│Backend #1│      │Backend #2│
└──────────┘      └──────────┘
      │                 │
      └────────┬────────┘
               │
        ┌──────▼──────┐
        │  Database   │
        └─────────────┘
```

**Session Stickiness:**
For SSE connections, use sticky sessions (route user to same backend instance).

---

### Vertical Scaling

Increase resources (CPU, RAM) for single instance:
- Railway: Upgrade plan
- Cloud Run: Increase memory/CPU limits

---

## Security Checklist

- [ ] HTTPS enabled (automatic on most platforms)
- [ ] Environment variables stored securely
- [ ] CORS restricted to frontend domain
- [ ] Service role key never exposed to frontend
- [ ] Database RLS policies enabled
- [ ] SQL injection prevention (use parameterized queries)
- [ ] Rate limiting configured (future)
- [ ] Security headers set (HSTS, CSP, etc.)

---

## Rollback Procedure

### Frontend (Vercel)

1. Go to Deployments tab
2. Find previous working deployment
3. Click "Promote to Production"

### Backend (Railway)

1. View deployment history
2. Select previous working deployment
3. Click "Redeploy"

### Database

1. Restore from backup
2. Re-run migrations if needed

---

## References

- [Vercel Documentation](https://vercel.com/docs)
- [Railway Documentation](https://docs.railway.app/)
- [Google Cloud Run Documentation](https://cloud.google.com/run/docs)
- [FastAPI Deployment](https://fastapi.tiangolo.com/deployment/)
- [Supabase Production Checklist](https://supabase.com/docs/guides/platform/going-into-prod)
