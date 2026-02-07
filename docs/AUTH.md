# Authentication Documentation

> **Note:** This documentation supplements [CLAUDE.md](../CLAUDE.md), which serves as the master implementation rules. In case of conflicts, CLAUDE.md takes precedence.

## Purpose
This document covers authentication and security implementation details for ResearchGPT, including Supabase Auth setup, user flows, JWT handling, and multi-user isolation.

---

## Authentication Provider

**Supabase Auth**

- Managed authentication service
- Email + password auth
- Email verification
- JWT token generation
- Session management
- Password reset flows
- Built-in RLS integration

---

## Supabase Auth Setup

### 1. Enable Email Provider

**In Supabase Dashboard:**
1. Navigate to **Authentication → Providers**
2. Enable **Email** provider
3. Configure settings:
   - ✅ Enable email confirmations
   - ✅ Secure email change
   - Set confirmation URL: `https://yourdomain.com/auth/verify`

### 2. Configure Email Templates

**Confirmation Email:**
```html
<h2>Confirm your email</h2>
<p>Click the link below to confirm your email address:</p>
<p><a href="{{ .ConfirmationURL }}">Confirm Email</a></p>
```

**Password Reset Email:**
```html
<h2>Reset your password</h2>
<p>Click the link below to reset your password:</p>
<p><a href="{{ .ConfirmationURL }}">Reset Password</a></p>
```

**Magic Link Email (optional):**
```html
<h2>Your magic link</h2>
<p>Click the link below to sign in:</p>
<p><a href="{{ .ConfirmationURL }}">Sign In</a></p>
```

### 3. Configure Auth Settings

**Session Settings:**
- JWT expiry: 3600 seconds (1 hour) - default
- Refresh token expiry: 2592000 seconds (30 days) - default

**Password Requirements:**
- Minimum length: 6 characters (configurable)

**Email Domain Restrictions (optional):**
- Restrict signups to specific domains
- Useful for internal tools

---

## Authentication Flows

### Signup Flow

```
┌──────┐                                         ┌─────────┐
│ User │                                         │Supabase │
└──┬───┘                                         └────┬────┘
   │                                                  │
   │ 1. Enter email + password                       │
   │────────────────────────────────────────────────>│
   │                                                  │
   │ 2. Create user (email_confirmed_at = NULL)      │
   │<────────────────────────────────────────────────│
   │                                                  │
   │ 3. Send verification email                      │
   │<────────────────────────────────────────────────│
   │                                                  │
   │ 4. Click verification link                      │
   │────────────────────────────────────────────────>│
   │                                                  │
   │ 5. Set email_confirmed_at, return token         │
   │<────────────────────────────────────────────────│
   │                                                  │
   │ 6. Redirect to app with session                 │
   │                                                  │
```

**Frontend Implementation:**
```typescript
// 1. Signup
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'securePassword123'
})

if (error) {
  console.error('Signup error:', error.message)
} else {
  console.log('Check your email for verification link')
}
```

**Backend Endpoint:**
```python
@app.post("/auth/signup")
async def signup(email: str, password: str):
    response = supabase.auth.sign_up({
        "email": email,
        "password": password
    })
    return {
        "user_id": response.user.id,
        "email": response.user.email,
        "verification_sent": True
    }
```

---

### Login Flow

```
┌──────┐                                         ┌─────────┐
│ User │                                         │Supabase │
└──┬───┘                                         └────┬────┘
   │                                                  │
   │ 1. Enter email + password                       │
   │────────────────────────────────────────────────>│
   │                                                  │
   │ 2. Verify credentials + email confirmed         │
   │<────────────────────────────────────────────────│
   │                                                  │
   │ 3. Return JWT access_token + refresh_token      │
   │<────────────────────────────────────────────────│
   │                                                  │
   │ 4. Store tokens, redirect to home               │
   │                                                  │
```

**Frontend Implementation:**
```typescript
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'securePassword123'
})

if (error) {
  console.error('Login error:', error.message)
} else {
  // Tokens automatically stored by Supabase client
  console.log('Logged in:', data.user.email)
  navigate('/') // Redirect to home
}
```

**Backend Endpoint:**
```python
@app.post("/auth/login")
async def login(email: str, password: str):
    response = supabase.auth.sign_in_with_password({
        "email": email,
        "password": password
    })
    return {
        "access_token": response.session.access_token,
        "refresh_token": response.session.refresh_token,
        "user": {
            "id": response.user.id,
            "email": response.user.email
        }
    }
```

---

### Logout Flow

```
┌──────┐                                         ┌─────────┐
│ User │                                         │Supabase │
└──┬───┘                                         └────┬────┘
   │                                                  │
   │ 1. Click logout                                 │
   │────────────────────────────────────────────────>│
   │                                                  │
   │ 2. Invalidate session                           │
   │<────────────────────────────────────────────────│
   │                                                  │
   │ 3. Clear local tokens                           │
   │                                                  │
   │ 4. Redirect to login                            │
   │                                                  │
```

**Frontend Implementation:**
```typescript
const { error } = await supabase.auth.signOut()

if (error) {
  console.error('Logout error:', error.message)
} else {
  navigate('/auth/login')
}
```

---

### Email Verification Flow

**Verification Link Format:**
```
https://yourdomain.com/auth/verify?token=abc123...&type=signup
```

**Frontend Handler:**
```typescript
// In VerifyEmail.tsx page
import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

export function VerifyEmail() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  useEffect(() => {
    const token = searchParams.get('token')
    const type = searchParams.get('type')

    if (token && type === 'signup') {
      // Supabase automatically verifies when user clicks link
      // Just check session and redirect
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          navigate('/')
        } else {
          // Verification failed or expired
          navigate('/auth/login?error=verification_failed')
        }
      })
    }
  }, [searchParams, navigate])

  return <div>Verifying your email...</div>
}
```

---

## Frontend Auth Integration

### Supabase Client Setup

**Location:** [src/lib/supabaseClient.ts](frontend/src/lib/supabaseClient.ts)
```typescript
// src/lib/supabaseClient.ts
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      detectSessionInUrl: true,
      persistSession: true,
    },
  }
)
```

### Auth State Management

**Location:** [src/context/AuthContext.tsx](frontend/src/context/AuthContext.tsx)
```typescript
// src/context/AuthContext.tsx
import { createContext, useContext, useEffect, useState } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session)
        setUser(session?.user ?? null)
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider value={{ user, session, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
```

**Use in App:**
```typescript
// App.tsx
import { AuthProvider } from './contexts/AuthContext'

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>...</Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
```

### Protected Routes

```typescript
// src/components/ProtectedRoute.tsx
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return <div>Loading...</div>
  }

  if (!user) {
    return <Navigate to="/auth/login" replace />
  }

  return <>{children}</>
}
```

**Usage:**
```typescript
<Route path="/" element={
  <ProtectedRoute>
    <Home />
  </ProtectedRoute>
} />
```

### Making Authenticated Requests

Supabase client automatically includes JWT in requests:

```typescript
// Authenticated query (RLS applied)
const { data, error } = await supabase
  .from('projects')
  .select('*')
  .order('created_at', { ascending: false })

// User can only see their own projects due to RLS
```

---

## Backend Auth Integration

### JWT Token Validation

**Current implementation:** [backend/main.py](backend/main.py) — `GET /me` endpoint

Validates tokens by calling the Supabase Auth REST API with `httpx`:

```python
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
import httpx

@app.get("/me")
async def get_me(request: Request):
    """Validate Supabase token and return user info."""
    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        return JSONResponse(status_code=401, content={"detail": "Missing or invalid token"})

    token = auth_header.removeprefix("Bearer ")

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={
                "Authorization": f"Bearer {token}",
                "apikey": SUPABASE_ANON_KEY,
            },
        )

    if resp.status_code != 200:
        return JSONResponse(status_code=401, content={"detail": "Invalid token"})

    data = resp.json()
    return {"id": data["id"], "email": data.get("email")}
```

### Supabase Keys Usage

**Anon Key (Public):**
- Safe to expose in frontend
- Limited permissions (respects RLS)
- Used for: Auth, public queries

**Service Role Key (Private):**
- **NEVER expose in frontend**
- Full database access (bypasses RLS)
- Used for: Admin operations, server-side logic

**Example:**
```python
# Backend uses service role key for full access
supabase_admin = create_client(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY  # Bypasses RLS
)

# Insert log (backend-only operation)
supabase_admin.table("agent_logs").insert({
    "run_id": run_id,
    "user_id": user_id,
    "message": "Processing..."
}).execute()
```

---

## Session Management

### Token Storage

**Frontend (Supabase handles this):**
- Tokens stored in `localStorage` by default
- Option: httpOnly cookies (more secure)

**httpOnly Cookies Setup:**
```typescript
const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      storage: customCookieStorage,
      autoRefreshToken: true,
      persistSession: true
    }
  }
)
```

### Token Refresh

**Automatic:**
Supabase client automatically refreshes tokens before expiry.

**Manual:**
```typescript
const { data, error } = await supabase.auth.refreshSession()
```

### Session Expiration

**Access Token:** 1 hour (default)
**Refresh Token:** 30 days (default)

After 30 days of inactivity, user must log in again.

---

## Password Security

### Password Requirements

**Minimum Requirements:**
- Length: 6+ characters (Supabase default)
- Recommend: 8+ characters, mix of uppercase, lowercase, numbers, symbols

**Frontend Validation:**
```typescript
function validatePassword(password: string): string | null {
  if (password.length < 8) {
    return "Password must be at least 8 characters"
  }
  if (!/[A-Z]/.test(password)) {
    return "Password must contain uppercase letter"
  }
  if (!/[a-z]/.test(password)) {
    return "Password must contain lowercase letter"
  }
  if (!/[0-9]/.test(password)) {
    return "Password must contain number"
  }
  return null // Valid
}
```

### Password Reset Flow

```
┌──────┐                                         ┌─────────┐
│ User │                                         │Supabase │
└──┬───┘                                         └────┬────┘
   │                                                  │
   │ 1. Request password reset (enter email)         │
   │────────────────────────────────────────────────>│
   │                                                  │
   │ 2. Send reset email with token                  │
   │<────────────────────────────────────────────────│
   │                                                  │
   │ 3. Click reset link                             │
   │────────────────────────────────────────────────>│
   │                                                  │
   │ 4. Redirect to reset password page              │
   │<────────────────────────────────────────────────│
   │                                                  │
   │ 5. Enter new password                           │
   │────────────────────────────────────────────────>│
   │                                                  │
   │ 6. Update password, log in user                 │
   │<────────────────────────────────────────────────│
   │                                                  │
```

**Request Reset:**
```typescript
const { error } = await supabase.auth.resetPasswordForEmail(
  'user@example.com',
  {
    redirectTo: 'https://yourdomain.com/auth/reset-password'
  }
)
```

**Update Password:**
```typescript
// On reset password page
const { error } = await supabase.auth.updateUser({
  password: newPassword
})
```

---

## Multi-User Isolation

### RLS Enforcement

**Automatic User Filtering:**
```sql
-- When user queries projects table:
SELECT * FROM projects;

-- PostgreSQL automatically adds:
WHERE user_id = auth.uid()
```

**Backend Responsibility:**
- Always pass correct `user_id` extracted from JWT
- Never trust `user_id` from client request body
- RLS is last line of defense

### Privacy Guarantees

**Phase 1 - Private Only:**
- No project sharing
- No collaboration
- No public projects
- Users can only see their own data

**Future - Sharing (Phase 2+):**
- Shared projects table
- Permissions system
- RLS policies for shared access

---

## Security Best Practices

### Frontend

✅ **DO:**
- Store tokens in httpOnly cookies (if possible)
- Validate user input
- Use HTTPS in production
- Implement CSRF protection

❌ **DON'T:**
- Store service role key in frontend
- Trust client-side validation only
- Expose sensitive data in console.logs

### Backend

✅ **DO:**
- Validate JWT on every protected endpoint
- Use service role key for admin operations only
- Implement rate limiting (future)
- Log authentication events

❌ **DON'T:**
- Skip token validation
- Trust user_id from request body
- Expose stack traces in production

---

## Testing Auth Flows

### Manual Testing Checklist

- [ ] Signup with valid email/password
- [ ] Verify email link works
- [ ] Login with verified account
- [ ] Access protected routes while logged in
- [ ] Cannot access protected routes when logged out
- [ ] Logout clears session
- [ ] Request password reset
- [ ] Reset password link works
- [ ] Cannot login with old password
- [ ] Can login with new password
- [ ] Session persists on page refresh
- [ ] Token auto-refreshes before expiry

---

## References

- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth)
- [JWT Introduction](https://jwt.io/introduction)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- [Supabase Auth Helpers](https://supabase.com/docs/guides/auth/auth-helpers)
