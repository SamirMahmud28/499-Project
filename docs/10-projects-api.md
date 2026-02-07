# Projects API

> **Note:** This documentation supplements [CLAUDE.md](../CLAUDE.md). In case of conflicts, CLAUDE.md takes precedence.

## Overview

All project endpoints proxy to Supabase PostgREST using the **user's JWT token**, so Row Level Security is enforced at the database level. Users can only see and modify their own projects.

---

## Endpoints

### `GET /projects`

List all projects for the authenticated user.

**Headers:**
```
Authorization: Bearer <access-token>
```

**Response (200 OK):**
```json
[
  {
    "id": "uuid",
    "user_id": "uuid",
    "name": "My Research",
    "description": "Optional description",
    "created_at": "2026-02-06T12:00:00Z",
    "updated_at": "2026-02-06T12:00:00Z"
  }
]
```

Returns `[]` if no projects exist yet.

**Errors:**
- `401` — Missing or invalid token

---

### `POST /projects`

Create a new project.

**Headers:**
```
Authorization: Bearer <access-token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "My Research",
  "description": "Optional description"
}
```

- `name` (string, required) — must be non-empty
- `description` (string, optional)

**Response (200 OK):**
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "name": "My Research",
  "description": "Optional description",
  "created_at": "2026-02-06T12:00:00Z",
  "updated_at": "2026-02-06T12:00:00Z"
}
```

**Errors:**
- `400` — `name` is missing or empty
- `401` — Missing or invalid token

---

### `GET /projects/{project_id}`

Get a single project by ID.

**Headers:**
```
Authorization: Bearer <access-token>
```

**Response (200 OK):**
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "name": "My Research",
  "description": "Optional description",
  "created_at": "2026-02-06T12:00:00Z",
  "updated_at": "2026-02-06T12:00:00Z"
}
```

**Errors:**
- `401` — Missing or invalid token
- `404` — Project not found (or not owned by user — RLS hides it)

---

## How RLS Applies

The backend does **not** filter by `user_id` in code. Instead:

1. Backend forwards the user's JWT to Supabase PostgREST
2. PostgREST passes the JWT to PostgreSQL
3. PostgreSQL evaluates RLS policies (`user_id = auth.uid()`)
4. Only matching rows are returned

This means even if a user guesses another user's project ID, the `GET /projects/{id}` endpoint returns 404 because RLS filters it out.

---

## Frontend Integration

Both the Projects dashboard (`/projects`) and Project detail (`/projects/:id`) pages call these endpoints with the session's `access_token`:

```typescript
const res = await fetch(`${BACKEND_URL}/projects`, {
  headers: { Authorization: `Bearer ${session?.access_token}` },
})
```
