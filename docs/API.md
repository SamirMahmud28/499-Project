# API Documentation

> **Note:** This documentation supplements [CLAUDE.md](../CLAUDE.md), which serves as the master implementation rules. In case of conflicts, CLAUDE.md takes precedence.

## Purpose
This document provides a complete API reference for the ResearchGPT backend, including endpoint specifications, request/response schemas, authentication, and usage examples.

---

## Base URL

**Development:** `http://localhost:8000`
**Production:** (TBD)

---

## Current Endpoints

### Root

#### `GET /`
Returns basic API information.

**Response:**
```json
{
  "message": "ResearchGPT API - Phase 1"
}
```

**Example:**
```bash
curl http://localhost:8000/
```

---

### Health Check

#### `GET /health`
Health check endpoint for monitoring and load balancers.

**Response:**
```json
{
  "status": "ok"
}
```

**Example:**
```bash
curl http://localhost:8000/health
```

---

### SSE Test Stream

#### `GET /stream/test`
Test Server-Sent Events endpoint that streams 10 events at 1-second intervals.

**Response:** Server-Sent Events stream

**Event Format:**
```
data: {"timestamp": "2024-01-01T12:00:00Z", "message": "Test event 1", "counter": 1}\n\n
data: {"timestamp": "2024-01-01T12:00:01Z", "message": "Test event 2", "counter": 2}\n\n
...
```

**Example (curl):**
```bash
curl -N http://localhost:8000/stream/test
```

**Example (JavaScript):**
```javascript
const eventSource = new EventSource('http://localhost:8000/stream/test')

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data)
  console.log(data.message, data.counter)
}

eventSource.onerror = () => {
  console.error('SSE connection error')
  eventSource.close()
}
```

---

### Token Validation

#### `GET /me`
Validate Supabase JWT token and return authenticated user info.

**Headers:**
```
Authorization: Bearer <access-token>
```

**Response (200 OK):**
```json
{
  "id": "uuid-string",
  "email": "user@example.com"
}
```

**Errors:**
- `401 Unauthorized` - Missing, invalid, or expired token

**Example:**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:8000/me
```

---

## Planned Endpoints

These endpoints will be implemented in future phases.

### Authentication

#### `POST /auth/signup`
Create a new user account with email verification.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response (201 Created):**
```json
{
  "user_id": "uuid-string",
  "email": "user@example.com",
  "verification_sent": true
}
```

**Errors:**
- `400 Bad Request` - Invalid email or weak password
- `409 Conflict` - Email already registered

---

#### `POST /auth/login`
Authenticate user and receive access token.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response (200 OK):**
```json
{
  "access_token": "jwt-token-string",
  "token_type": "bearer",
  "user": {
    "id": "uuid-string",
    "email": "user@example.com"
  }
}
```

**Errors:**
- `401 Unauthorized` - Invalid credentials
- `403 Forbidden` - Email not verified

---

#### `POST /auth/verify-email`
Verify user email with token from email.

**Request Body:**
```json
{
  "token": "verification-token-string"
}
```

**Response (200 OK):**
```json
{
  "verified": true,
  "message": "Email verified successfully"
}
```

**Errors:**
- `400 Bad Request` - Invalid or expired token

---

### Wizard Workflow

#### `POST /wizard/idea`
Submit research idea and start a new run.

**Headers:**
```
Authorization: Bearer <access-token>
```

**Request Body:**
```json
{
  "idea": "The impact of artificial intelligence on climate change research"
}
```

**Response (201 Created):**
```json
{
  "run_id": "uuid-string",
  "status": "processing",
  "idea": "The impact of artificial intelligence on climate change research"
}
```

---

#### `GET /wizard/topic/{run_id}`
Get generated topic and critic feedback for a run.

**Headers:**
```
Authorization: Bearer <access-token>
```

**Response (200 OK):**
```json
{
  "run_id": "uuid-string",
  "topic": "AI-Powered Climate Modeling and Prediction Systems",
  "critic_feedback": "Strong topic. Consider narrowing scope to specific AI techniques or regional applications.",
  "status": "topic_ready"
}
```

**Errors:**
- `404 Not Found` - Run not found or not owned by user
- `202 Accepted` - Still processing (retry later)

---

#### `POST /wizard/regenerate-topic/{run_id}`
Regenerate topic and critic for a run.

**Headers:**
```
Authorization: Bearer <access-token>
```

**Response (200 OK):**
```json
{
  "run_id": "uuid-string",
  "status": "processing"
}
```

---

#### `POST /wizard/accept-topic/{run_id}`
Accept topic and proceed to outline generation.

**Headers:**
```
Authorization: Bearer <access-token>
```

**Response (200 OK):**
```json
{
  "run_id": "uuid-string",
  "status": "generating_outline"
}
```

---

#### `GET /wizard/outline/{run_id}`
Get generated research outline.

**Headers:**
```
Authorization: Bearer <access-token>
```

**Response (200 OK):**
```json
{
  "run_id": "uuid-string",
  "outline": {
    "introduction": "...",
    "sections": [
      {
        "title": "AI in Climate Data Analysis",
        "subsections": ["Machine Learning Models", "Data Sources"]
      },
      {
        "title": "Predictive Climate Modeling",
        "subsections": ["Neural Networks", "Ensemble Methods"]
      }
    ],
    "conclusion": "..."
  },
  "status": "outline_ready"
}
```

**Errors:**
- `404 Not Found` - Run not found
- `202 Accepted` - Still processing

---

### Projects

#### `GET /projects`
List all projects for authenticated user.

**Headers:**
```
Authorization: Bearer <access-token>
```

**Query Parameters:**
- `limit` (optional, default: 20) - Number of results
- `offset` (optional, default: 0) - Pagination offset

**Response (200 OK):**
```json
{
  "projects": [
    {
      "id": "uuid-string",
      "title": "AI and Climate Research",
      "created_at": "2024-01-01T12:00:00Z",
      "updated_at": "2024-01-01T12:30:00Z",
      "runs_count": 3
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
```

---

#### `POST /projects`
Create a new project.

**Headers:**
```
Authorization: Bearer <access-token>
```

**Request Body:**
```json
{
  "title": "AI and Climate Research"
}
```

**Response (201 Created):**
```json
{
  "id": "uuid-string",
  "title": "AI and Climate Research",
  "created_at": "2024-01-01T12:00:00Z",
  "user_id": "uuid-string"
}
```

---

#### `GET /projects/{project_id}`
Get project details with all runs.

**Headers:**
```
Authorization: Bearer <access-token>
```

**Response (200 OK):**
```json
{
  "id": "uuid-string",
  "title": "AI and Climate Research",
  "created_at": "2024-01-01T12:00:00Z",
  "runs": [
    {
      "id": "run-uuid",
      "idea": "The impact of AI...",
      "status": "outline_ready",
      "created_at": "2024-01-01T12:05:00Z"
    }
  ]
}
```

**Errors:**
- `404 Not Found` - Project not found or unauthorized

---

#### `DELETE /projects/{project_id}`
Delete a project and all associated runs.

**Headers:**
```
Authorization: Bearer <access-token>
```

**Response (204 No Content)**

**Errors:**
- `404 Not Found` - Project not found or unauthorized

---

### Agent Logs Streaming

#### `GET /stream/logs/{run_id}`
Stream real-time agent logs for a wizard run.

**Headers:**
```
Authorization: Bearer <access-token>
```

**Response:** Server-Sent Events stream

**Event Format:**
```
data: {"timestamp": "2024-01-01T12:00:00Z", "level": "info", "message": "Starting topic generation...", "agent": "topic_generator"}\n\n
data: {"timestamp": "2024-01-01T12:00:05Z", "level": "info", "message": "Querying Groq API...", "agent": "topic_generator"}\n\n
data: {"timestamp": "2024-01-01T12:00:10Z", "level": "success", "message": "Topic generated", "agent": "topic_generator"}\n\n
```

**Event Fields:**
- `timestamp` (string, ISO 8601) - When the log was created
- `level` (string) - Log level: `info`, `warning`, `error`, `success`
- `message` (string) - Log message
- `agent` (string) - Name of the agent that generated the log

**Example (JavaScript):**
```javascript
const eventSource = new EventSource(
  `http://localhost:8000/stream/logs/${runId}`,
  {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  }
)

eventSource.onmessage = (event) => {
  const log = JSON.parse(event.data)
  console.log(`[${log.level}] ${log.agent}: ${log.message}`)
}
```

---

## SSE Event Format

All Server-Sent Events follow this format:

```
data: <JSON-encoded-object>\n\n
```

**Important:**
- Each event starts with `data: `
- Followed by JSON object
- Ends with `\n\n` (two newlines)
- Connection stays open until client closes or server completes

**Connection Headers:**
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
X-Accel-Buffering: no
```

---

## Authentication

**Method:** Bearer Token (JWT)

**Flow:**
1. User signs up via `/auth/signup`
2. User verifies email
3. User logs in via `/auth/login` → receives `access_token`
4. Include token in subsequent requests:
   ```
   Authorization: Bearer <access-token>
   ```

**Token Validation:**
- Tokens are validated with Supabase
- Expired tokens return `401 Unauthorized`
- Invalid tokens return `401 Unauthorized`

---

## Error Responses

All errors follow this format:

```json
{
  "detail": "Error message describing what went wrong"
}
```

**Status Codes:**
- `400 Bad Request` - Invalid request data
- `401 Unauthorized` - Missing or invalid authentication
- `403 Forbidden` - Authenticated but insufficient permissions
- `404 Not Found` - Resource doesn't exist
- `409 Conflict` - Resource already exists
- `422 Unprocessable Entity` - Validation error
- `500 Internal Server Error` - Server error

**Validation Error (422):**
```json
{
  "detail": [
    {
      "loc": ["body", "email"],
      "msg": "invalid email format",
      "type": "value_error.email"
    }
  ]
}
```

---

## CORS Policy

**Allowed Origins:**
- `http://localhost:5173` (development)
- Production frontend URL (when deployed)

**Allowed Methods:** All (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`)

**Allowed Headers:** All

**Credentials:** Allowed

---

## Rate Limiting

*Not yet implemented*

Future considerations:
- Rate limit by IP address
- Rate limit by authenticated user
- Different limits for different endpoint types

---

## Pagination

List endpoints support pagination via query parameters:

**Parameters:**
- `limit` - Number of results (default: 20, max: 100)
- `offset` - Skip N results (default: 0)

**Response includes:**
- `total` - Total number of results
- `limit` - Applied limit
- `offset` - Applied offset

**Example:**
```bash
curl "http://localhost:8000/projects?limit=10&offset=20"
```

---

## Testing

### Using curl

**Health check:**
```bash
curl http://localhost:8000/health
```

**SSE stream:**
```bash
curl -N http://localhost:8000/stream/test
```

**With authentication:**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8000/projects
```

**POST request:**
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"title": "New Project"}' \
  http://localhost:8000/projects
```

### Using Swagger UI

Navigate to `http://localhost:8000/docs` for interactive API documentation with request/response examples and the ability to test endpoints directly.

---

## References

- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Server-Sent Events Specification](https://html.spec.whatwg.org/multipage/server-sent-events.html)
- [HTTP Status Codes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status)
- [JWT Introduction](https://jwt.io/introduction)
