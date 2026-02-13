import { useEffect, useState, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/context/AuthContext'
import type { Project, Run } from '@/types/api'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL

const STEP_LABELS: Record<string, string> = {
  idea: 'Idea',
  topic_critic: 'Topics',
  outline: 'Outline',
  phase2_constraints: 'Constraints',
  phase2_approach: 'Approach',
  phase2_sources: 'Sources',
  phase2_plan: 'Plan',
}

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    running: 'bg-amber-100 text-amber-800',
    awaiting_feedback: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-700',
  }
  return styles[status] ?? 'bg-gray-100 text-gray-700'
}

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const { session } = useAuth()
  const navigate = useNavigate()
  const [project, setProject] = useState<Project | null>(null)
  const [runs, setRuns] = useState<Run[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [deletingRunId, setDeletingRunId] = useState<string | null>(null)

  const authHeaders = useCallback(
    () => ({ Authorization: `Bearer ${session?.access_token}` }),
    [session?.access_token],
  )

  // ── Fetch project ───────────────────────────────────────────
  useEffect(() => {
    if (!session || !id) return
    ;(async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/projects/${id}`, {
          headers: authHeaders(),
        })
        if (!res.ok) {
          const d = await res.json()
          throw new Error(d.detail || 'Failed to fetch project')
        }
        setProject(await res.json())
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    })()
  }, [session, id, authHeaders])

  // ── Fetch runs ──────────────────────────────────────────────
  const fetchRuns = useCallback(async () => {
    if (!session || !id) return
    try {
      const res = await fetch(`${BACKEND_URL}/projects/${id}/runs`, {
        headers: authHeaders(),
      })
      if (res.ok) setRuns(await res.json())
    } catch (_e) { /* ignore */ }
  }, [session, id, authHeaders])

  useEffect(() => { fetchRuns() }, [fetchRuns])

  // ── Actions ─────────────────────────────────────────────────
  const createRun = async () => {
    if (!session || !id) return
    setCreating(true)
    setActionError(null)
    try {
      const res = await fetch(`${BACKEND_URL}/projects/${id}/runs`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || data.message || `Server error ${res.status}`)
      }
      const run: Run = await res.json()
      navigate(`/projects/${id}/runs/${run.id}`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create run'
      setActionError(msg)
      console.error('createRun error:', msg)
    } finally {
      setCreating(false)
    }
  }

  const deleteRun = async (runId: string, runNumber: number) => {
    if (!confirm(`Delete Run #${runNumber}? This will permanently remove all its artifacts and logs.`)) return
    setDeletingRunId(runId)
    setActionError(null)
    try {
      const res = await fetch(`${BACKEND_URL}/runs/${runId}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || `Server error ${res.status}`)
      }
      await fetchRuns()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete run'
      setActionError(msg)
    } finally {
      setDeletingRunId(null)
    }
  }

  // ── Loading / Error ─────────────────────────────────────────
  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <p className="text-muted-foreground">Loading project...</p>
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="container mx-auto p-6 space-y-4">
        <div className="bg-destructive/10 text-destructive p-3 rounded text-sm">
          {error || 'Project not found'}
        </div>
        <Link to="/projects">
          <Button variant="outline">Back to Projects</Button>
        </Link>
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────
  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-4xl font-bold mb-1">{project.name}</h1>
          {project.description && (
            <p className="text-muted-foreground">{project.description}</p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            Created {new Date(project.created_at).toLocaleDateString()}
          </p>
        </div>
        <Link to="/projects">
          <Button variant="outline" size="sm">Back to Projects</Button>
        </Link>
      </div>

      {/* Action error banner */}
      {actionError && (
        <div className="bg-destructive/10 text-destructive p-3 rounded text-sm flex justify-between items-center">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="text-destructive font-bold ml-4">X</button>
        </div>
      )}

      {/* Create Run */}
      <div className="flex items-center gap-4">
        <Button onClick={createRun} disabled={creating}>
          {creating ? 'Creating...' : 'Start New Run'}
        </Button>
      </div>

      {/* Runs List */}
      <Card>
        <CardHeader>
          <CardTitle>Runs</CardTitle>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <p className="text-muted-foreground text-sm">No runs yet. Click &quot;Start New Run&quot; to begin.</p>
          ) : (
            <div className="space-y-2">
              {runs.map((run) => (
                <div
                  key={run.id}
                  className="flex items-center justify-between p-3 rounded border border-border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm" title={run.id}>
                        Run #{run.run_number}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        run.phase === 'phase2'
                          ? 'bg-indigo-100 text-indigo-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}>
                        {run.phase === 'phase2' ? 'Phase 2' : 'Phase 1'}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-xs">
                        {STEP_LABELS[run.step] ?? run.step}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-xs ${statusBadge(run.status)}`}>
                        {run.status}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {new Date(run.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/projects/${id}/runs/${run.id}`)}
                    >
                      Open
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteRun(run.id, run.run_number)}
                      disabled={deletingRunId === run.id}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      {deletingRunId === run.id ? '...' : 'Delete'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
