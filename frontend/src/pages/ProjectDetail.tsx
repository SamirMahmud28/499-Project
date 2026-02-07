import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/context/AuthContext'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL

interface Project {
  id: string
  name: string
  description: string | null
  created_at: string
  updated_at: string
}

interface Run {
  id: string
  project_id: string
  phase: string
  step: string
  status: string
  created_at: string
  updated_at: string
}

interface Artifact {
  id: string
  run_id: string
  step_name: string
  version: number
  content: Record<string, unknown>
  created_at: string
}

interface AgentLog {
  id: string
  run_id: string
  agent_name: string
  event_type: string
  payload: Record<string, unknown>
  created_at: string
}

const STEPS = ['idea', 'topic_critic', 'outline']

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
  const [project, setProject] = useState<Project | null>(null)
  const [runs, setRuns] = useState<Run[]>([])
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [logs, setLogs] = useState<AgentLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [ideaTitle, setIdeaTitle] = useState('')
  const [ideaSummary, setIdeaSummary] = useState('')
  const [submittingIdea, setSubmittingIdea] = useState(false)
  const [runningTopicCritic, setRunningTopicCritic] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [selectedCandidateIdx, setSelectedCandidateIdx] = useState<number | null>(null)
  const [acceptingTopic, setAcceptingTopic] = useState(false)
  const [runningOutline, setRunningOutline] = useState(false)
  const [outlineFeedback, setOutlineFeedback] = useState('')
  const logsEndRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const authHeaders = useCallback(
    () => ({ Authorization: `Bearer ${session?.access_token}` }),
    [session?.access_token],
  )

  const selectedRun = runs.find((r) => r.id === selectedRunId) ?? null

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

  // ── Fetch helpers ──────────────────────────────────────────
  const fetchRuns = useCallback(async () => {
    if (!session || !id) return
    try {
      const res = await fetch(`${BACKEND_URL}/projects/${id}/runs`, {
        headers: authHeaders(),
      })
      if (res.ok) setRuns(await res.json())
    } catch (_e) { /* ignore */ }
  }, [session, id, authHeaders])

  const fetchArtifacts = useCallback(async () => {
    if (!session || !selectedRunId) return
    try {
      const res = await fetch(`${BACKEND_URL}/runs/${selectedRunId}/artifacts`, {
        headers: authHeaders(),
      })
      if (res.ok) setArtifacts(await res.json())
    } catch (_e) { /* ignore */ }
  }, [session, selectedRunId, authHeaders])

  /** Unified refresh: fetches run list + artifacts for the selected run. */
  const refreshRunData = useCallback(async () => {
    await Promise.all([fetchRuns(), fetchArtifacts()])
  }, [fetchRuns, fetchArtifacts])

  // Initial data load
  useEffect(() => { fetchRuns() }, [fetchRuns])
  useEffect(() => { fetchArtifacts() }, [fetchArtifacts])

  // ── Fetch persisted logs when run selected ──────────────────
  useEffect(() => {
    if (!session || !selectedRunId) return
    ;(async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/runs/${selectedRunId}/logs`, {
          headers: authHeaders(),
        })
        if (res.ok) setLogs(await res.json())
      } catch (_e) { /* ignore */ }
    })()
  }, [session, selectedRunId, authHeaders])

  // ── SSE connection ──────────────────────────────────────────
  useEffect(() => {
    if (!session || !selectedRunId) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    ;(async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/runs/${selectedRunId}/stream`, {
          headers: authHeaders(),
          signal: controller.signal,
        })
        if (!res.ok || !res.body) return

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data: AgentLog = JSON.parse(line.slice(6))
                setLogs((prev) => {
                  if (prev.some((l) => l.id === data.id)) return prev
                  return [...prev, data]
                })
              } catch (_e) { /* ignore bad JSON */ }
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        console.error('SSE error:', err)
      }
    })()

    return () => controller.abort()
  }, [session, selectedRunId, authHeaders])

  // ── Auto-refresh while run is in progress ──────────────────
  useEffect(() => {
    if (!session || !selectedRunId || !selectedRun) return
    if (selectedRun.status !== 'running') return

    const interval = setInterval(() => refreshRunData(), 3000)
    return () => clearInterval(interval)
  }, [session, selectedRunId, selectedRun?.status, refreshRunData])

  // ── Auto-scroll logs ───────────────────────────────────────
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  // ── Derived state for guardrails ──────────────────────────
  const hasIdea = artifacts.some((a) => a.step_name === 'idea')
  const hasTopicCritic = artifacts.some((a) => a.step_name === 'topic_critic')
  const hasAcceptedTopic = artifacts.some((a) => a.step_name === 'accepted_topic')
  const hasOutline = artifacts.some((a) => a.step_name === 'outline')
  const isRunning = selectedRun?.status === 'running'
  const isCompleted = selectedRun?.step === 'outline' && selectedRun?.status === 'completed'

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
      await fetchRuns()
      setSelectedRunId(run.id)
      setLogs([])
      setArtifacts([])
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create run'
      setActionError(msg)
      console.error('createRun error:', msg)
    } finally {
      setCreating(false)
    }
  }

  const submitIdea = async () => {
    if (!session || !selectedRunId || !ideaTitle.trim()) return
    setSubmittingIdea(true)
    setActionError(null)
    try {
      const res = await fetch(`${BACKEND_URL}/runs/${selectedRunId}/artifacts`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step_name: 'idea',
          content: { title: ideaTitle.trim(), summary: ideaSummary.trim() },
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || `Server error ${res.status}`)
      }
      await refreshRunData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to submit idea'
      setActionError(msg)
    } finally {
      setSubmittingIdea(false)
    }
  }

  const triggerTopicCritic = async () => {
    if (!session || !selectedRunId) return
    setRunningTopicCritic(true)
    setActionError(null)
    try {
      const body: Record<string, unknown> = {}
      if (feedback.trim()) body.feedback = feedback.trim()
      const res = await fetch(`${BACKEND_URL}/runs/${selectedRunId}/phase1/topic_critic`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || `Server error ${res.status}`)
      }
      setFeedback('')
      await refreshRunData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to start topic critic'
      setActionError(msg)
    } finally {
      setRunningTopicCritic(false)
    }
  }

  const acceptTopic = async () => {
    if (!session || !selectedRunId || selectedCandidateIdx === null) return
    setAcceptingTopic(true)
    setActionError(null)
    try {
      const res = await fetch(`${BACKEND_URL}/runs/${selectedRunId}/phase1/accept_topic`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidate_index: selectedCandidateIdx }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || `Server error ${res.status}`)
      }
      await refreshRunData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to accept topic'
      setActionError(msg)
    } finally {
      setAcceptingTopic(false)
    }
  }

  const triggerOutline = async () => {
    if (!session || !selectedRunId) return
    setRunningOutline(true)
    setActionError(null)
    try {
      const body: Record<string, unknown> = {}
      if (outlineFeedback.trim()) body.feedback = outlineFeedback.trim()
      const res = await fetch(`${BACKEND_URL}/runs/${selectedRunId}/phase1/outline`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || `Server error ${res.status}`)
      }
      setOutlineFeedback('')
      await refreshRunData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to start outline generation'
      setActionError(msg)
    } finally {
      setRunningOutline(false)
    }
  }

  const selectRun = (run: Run) => {
    setSelectedRunId(run.id)
    setLogs([])
    setArtifacts([])
    setActionError(null)
    setSelectedCandidateIdx(null)
  }

  // ── Loading / Error states ─────────────────────────────────
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
          {creating ? 'Creating...' : 'Start Phase 1 Run'}
        </Button>
      </div>

      {/* Runs List */}
      <Card>
        <CardHeader>
          <CardTitle>Runs</CardTitle>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <p className="text-muted-foreground text-sm">No runs yet. Click &quot;Start Phase 1 Run&quot; to begin.</p>
          ) : (
            <div className="space-y-2">
              {runs.map((run) => (
                <button
                  key={run.id}
                  onClick={() => selectRun(run)}
                  className={`w-full text-left p-3 rounded border transition-colors ${
                    selectedRunId === run.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <div className="text-sm font-mono">{run.id.slice(0, 8)}...</div>
                    <div className="flex gap-2 text-xs">
                      <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                        {run.step}
                      </span>
                      <span className={`px-2 py-0.5 rounded ${statusBadge(run.status)}`}>
                        {run.status}
                      </span>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {new Date(run.created_at).toLocaleString()}
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Selected Run Detail */}
      {selectedRun && (
        <>
          {/* Completed banner */}
          {isCompleted && (
            <div className="bg-green-50 border border-green-300 rounded-lg p-4 flex items-center gap-3">
              <span className="text-green-700 text-lg">&#10003;</span>
              <div>
                <p className="text-green-800 font-semibold">Phase 1 Complete</p>
                <p className="text-green-700 text-sm">
                  Your research outline is ready. You can still regenerate topics or the outline with feedback.
                </p>
              </div>
            </div>
          )}

          {/* Stepper */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Run Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                {STEPS.map((step, idx) => {
                  const currentIdx = STEPS.indexOf(selectedRun.step)
                  let bg = 'bg-gray-100 text-gray-500'
                  if (idx < currentIdx) bg = 'bg-green-100 text-green-800'
                  if (idx === currentIdx) bg = 'bg-blue-100 text-blue-800'
                  if (idx === currentIdx && selectedRun.status === 'completed' && step === 'outline')
                    bg = 'bg-green-100 text-green-800'
                  return (
                    <div key={step} className="flex items-center gap-2">
                      {idx > 0 && (
                        <div className={`w-8 h-0.5 ${idx <= currentIdx ? 'bg-green-400' : 'bg-gray-200'}`} />
                      )}
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${bg}`}>
                        {step}
                      </span>
                    </div>
                  )
                })}
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                Status: <span className={`font-medium px-2 py-0.5 rounded text-xs ${statusBadge(selectedRun.status)}`}>
                  {selectedRun.status}
                </span>
              </p>
            </CardContent>
          </Card>

          {/* Step 1: Submit Idea */}
          <Card className={hasIdea ? 'border-green-200' : ''}>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="text-lg">Step 1: Submit Your Research Idea</CardTitle>
                {hasIdea && (
                  <span className="px-2 py-0.5 rounded bg-green-100 text-green-800 text-xs font-medium">
                    Done
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {hasIdea && (
                <div className="bg-green-50 border border-green-200 rounded p-3 text-sm">
                  <p className="font-medium text-green-800">Idea saved.</p>
                  <p className="text-green-700 text-xs mt-1">
                    You can update it below, but this will not affect already-generated topics or outlines.
                  </p>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-1">Idea Title *</label>
                <input
                  type="text"
                  className="w-full border rounded px-3 py-2 text-sm bg-background"
                  placeholder="e.g. Impact of AI on Healthcare Diagnostics"
                  value={ideaTitle}
                  onChange={(e) => setIdeaTitle(e.target.value)}
                  disabled={isRunning}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Summary (optional)</label>
                <textarea
                  className="w-full border rounded px-3 py-2 text-sm bg-background min-h-[60px]"
                  placeholder="Brief description of your research idea..."
                  value={ideaSummary}
                  onChange={(e) => setIdeaSummary(e.target.value)}
                  disabled={isRunning}
                />
              </div>
              <Button
                onClick={submitIdea}
                disabled={submittingIdea || !ideaTitle.trim() || isRunning}
                size="sm"
              >
                {submittingIdea ? 'Submitting...' : hasIdea ? 'Update Idea' : 'Submit Idea'}
              </Button>
            </CardContent>
          </Card>

          {/* Step 2: Topic Proposer + Critic + Accept */}
          <Card className={hasAcceptedTopic ? 'border-green-200' : ''}>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="text-lg">Step 2: Topic Proposer + Critic</CardTitle>
                {hasAcceptedTopic && (
                  <span className="px-2 py-0.5 rounded bg-green-100 text-green-800 text-xs font-medium">
                    Accepted
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {!hasIdea ? (
                <p className="text-sm text-amber-600">Submit an idea first (Step 1) before running the topic critic.</p>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Run the LangGraph pipeline to generate and evaluate topic candidates, then accept one.
                  </p>

                  {/* Run / Regenerate controls */}
                  <div className="space-y-2">
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Feedback (optional{hasTopicCritic ? ' — this will regenerate topics, creating a new version' : ''})
                      </label>
                      <textarea
                        className="w-full border rounded px-3 py-2 text-sm bg-background min-h-[40px]"
                        placeholder="e.g. Focus more on clinical trials..."
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                        disabled={isRunning}
                      />
                    </div>
                    <Button
                      onClick={triggerTopicCritic}
                      disabled={runningTopicCritic || isRunning || !hasIdea}
                      size="sm"
                    >
                      {runningTopicCritic || isRunning
                        ? 'Running...'
                        : hasTopicCritic
                          ? 'Regenerate Topics'
                          : 'Run Topic Critic'}
                    </Button>
                  </div>

                  {/* Candidate list + accept */}
                  {(() => {
                    const tcArtifact = artifacts.find((a) => a.step_name === 'topic_critic')
                    if (!tcArtifact) return null
                    const content = tcArtifact.content as {
                      candidates?: Array<{ title?: string; description?: string; keywords?: string[]; research_angle?: string }>
                      critic_result?: { recommended_index?: number; rankings?: Array<{ candidate_index?: number; overall_score?: number; rank?: number }> }
                    }
                    const candidates = content.candidates ?? []
                    const recIdx = content.critic_result?.recommended_index ?? null
                    const rankings = content.critic_result?.rankings ?? []

                    return (
                      <div className="space-y-3 border-t pt-3">
                        <p className="text-sm font-medium">
                          {hasAcceptedTopic ? 'Topic candidates (topic already accepted):' : 'Select a topic to accept:'}
                        </p>
                        <div className="space-y-2">
                          {candidates.map((c, idx) => {
                            const ranking = rankings.find((r) => r.candidate_index === idx)
                            const score = ranking?.overall_score
                            const rank = ranking?.rank
                            return (
                              <label
                                key={idx}
                                className={`block border rounded p-3 transition-colors ${
                                  hasAcceptedTopic
                                    ? 'border-border opacity-70'
                                    : selectedCandidateIdx === idx
                                      ? 'border-primary bg-primary/5 cursor-pointer'
                                      : 'border-border hover:bg-muted/50 cursor-pointer'
                                }`}
                              >
                                <div className="flex items-start gap-2">
                                  {!hasAcceptedTopic && (
                                    <input
                                      type="radio"
                                      name="candidate"
                                      checked={selectedCandidateIdx === idx}
                                      onChange={() => setSelectedCandidateIdx(idx)}
                                      className="mt-1"
                                    />
                                  )}
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-medium text-sm">{c.title ?? 'Untitled'}</span>
                                      {recIdx === idx && (
                                        <span className="px-1.5 py-0.5 rounded bg-green-100 text-green-800 text-xs">Recommended</span>
                                      )}
                                      {rank != null && (
                                        <span className="text-xs text-muted-foreground">#{rank}</span>
                                      )}
                                      {score != null && (
                                        <span className="text-xs text-muted-foreground">Score: {score}/10</span>
                                      )}
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1">{c.description}</p>
                                    {c.keywords && c.keywords.length > 0 && (
                                      <div className="flex gap-1 mt-1 flex-wrap">
                                        {c.keywords.map((kw, ki) => (
                                          <span key={ki} className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-xs">{kw}</span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </label>
                            )
                          })}
                        </div>
                        {!hasAcceptedTopic && (
                          <Button
                            onClick={acceptTopic}
                            disabled={acceptingTopic || selectedCandidateIdx === null || isRunning}
                            size="sm"
                          >
                            {acceptingTopic ? 'Accepting...' : 'Accept Selected Topic'}
                          </Button>
                        )}
                        {hasAcceptedTopic && (
                          <p className="text-xs text-green-600">Topic accepted. Proceed to Step 3.</p>
                        )}
                      </div>
                    )
                  })()}
                </>
              )}
            </CardContent>
          </Card>

          {/* Step 3: Generate Outline */}
          <Card className={hasOutline && isCompleted ? 'border-green-200' : ''}>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="text-lg">Step 3: Generate Outline</CardTitle>
                {hasOutline && isCompleted && (
                  <span className="px-2 py-0.5 rounded bg-green-100 text-green-800 text-xs font-medium">
                    Done
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {(() => {
                const acceptedArt = artifacts.find((a) => a.step_name === 'accepted_topic')
                const outlineArt = artifacts.find((a) => a.step_name === 'outline')

                if (!acceptedArt) {
                  return (
                    <p className="text-sm text-amber-600">Accept a topic in Step 2 first.</p>
                  )
                }

                const accepted = acceptedArt.content as { selected?: { title?: string; description?: string } }
                const outlineContent = outlineArt?.content as {
                  title?: string
                  abstract?: string
                  sections?: Array<{ name?: string; bullets?: string[] }>
                  keywords?: string[]
                } | undefined

                return (
                  <>
                    {/* Show accepted topic */}
                    <div className="bg-green-50 border border-green-200 rounded p-3">
                      <p className="text-sm font-medium text-green-800">Accepted Topic:</p>
                      <p className="text-sm">{accepted.selected?.title ?? 'Untitled'}</p>
                      {accepted.selected?.description && (
                        <p className="text-xs text-muted-foreground mt-1">{accepted.selected.description}</p>
                      )}
                    </div>

                    {/* Outline feedback + generate */}
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Feedback (optional{outlineArt ? ' — this will regenerate the outline, creating a new version' : ''})
                      </label>
                      <textarea
                        className="w-full border rounded px-3 py-2 text-sm bg-background min-h-[40px]"
                        placeholder="e.g. Add a section on ethical implications..."
                        value={outlineFeedback}
                        onChange={(e) => setOutlineFeedback(e.target.value)}
                        disabled={isRunning}
                      />
                    </div>
                    <Button
                      onClick={triggerOutline}
                      disabled={runningOutline || isRunning}
                      size="sm"
                    >
                      {runningOutline || isRunning
                        ? 'Generating...'
                        : outlineArt
                          ? 'Regenerate Outline'
                          : 'Generate Outline'}
                    </Button>

                    {/* Render outline */}
                    {outlineContent && (
                      <div className="border rounded p-4 space-y-4 mt-2">
                        <h3 className="text-lg font-bold">{outlineContent.title}</h3>
                        {outlineContent.abstract && (
                          <div>
                            <h4 className="text-sm font-semibold text-muted-foreground mb-1">Abstract</h4>
                            <p className="text-sm">{outlineContent.abstract}</p>
                          </div>
                        )}
                        {outlineContent.sections && outlineContent.sections.length > 0 && (
                          <div className="space-y-3">
                            {outlineContent.sections.map((sec, si) => (
                              <div key={si}>
                                <h4 className="text-sm font-semibold">{si + 1}. {sec.name}</h4>
                                {sec.bullets && sec.bullets.length > 0 && (
                                  <ul className="list-disc list-inside ml-2 mt-1 space-y-0.5">
                                    {sec.bullets.map((b, bi) => (
                                      <li key={bi} className="text-sm text-muted-foreground">{b}</li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        {outlineContent.keywords && outlineContent.keywords.length > 0 && (
                          <div className="flex gap-1 flex-wrap">
                            <span className="text-xs font-medium mr-1">Keywords:</span>
                            {outlineContent.keywords.map((kw, ki) => (
                              <span key={ki} className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 text-xs">{kw}</span>
                            ))}
                          </div>
                        )}
                        {outlineArt && (
                          <p className="text-xs text-muted-foreground">Version: v{outlineArt.version}</p>
                        )}
                      </div>
                    )}
                  </>
                )
              })()}
            </CardContent>
          </Card>

          {/* Artifacts (collapsed by default) */}
          <details className="group">
            <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              View Raw Artifacts ({artifacts.length})
            </summary>
            <Card className="mt-2">
              <CardContent className="pt-4">
                {artifacts.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No artifacts yet.</p>
                ) : (
                  <div className="space-y-3">
                    {artifacts.map((a) => (
                      <div key={a.id} className="border rounded p-3">
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-medium text-sm">{a.step_name}</span>
                          <span className="text-xs text-muted-foreground">v{a.version}</span>
                        </div>
                        <pre className="text-xs bg-muted p-2 rounded overflow-x-auto whitespace-pre-wrap">
                          {JSON.stringify(a.content, null, 2)}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </details>

          {/* Agent Logs */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Agent Logs (Live)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-72 overflow-y-auto border rounded p-3 bg-black text-green-400 font-mono text-xs space-y-1">
                {logs.length === 0 && (
                  <p className="text-gray-500">Waiting for log events...</p>
                )}
                {logs.map((log, idx) => {
                  const message =
                    typeof log.payload === 'object' && log.payload !== null
                      ? String((log.payload as Record<string, unknown>).message ?? JSON.stringify(log.payload))
                      : String(log.payload)
                  return (
                    <div key={log.id || idx}>
                      <span className="text-gray-500">
                        {log.created_at
                          ? new Date(log.created_at).toLocaleTimeString()
                          : '--:--:--'}
                      </span>{' '}
                      <span className="text-yellow-400">[{log.agent_name}]</span>{' '}
                      <span className="text-blue-400">{log.event_type}</span>{' '}
                      <span>{message}</span>
                    </div>
                  )
                })}
                <div ref={logsEndRef} />
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
