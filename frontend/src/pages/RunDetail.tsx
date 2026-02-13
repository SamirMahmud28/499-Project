import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/context/AuthContext'
import type { Run, Artifact, AgentLog } from '@/types/api'
import AgentLogsPanel from '@/components/AgentLogsPanel'
import Phase2Steps from '@/components/Phase2Steps'
import { ChevronDown, ArrowRight } from 'lucide-react'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL
const PHASE1_STEPS = ['idea', 'topic_critic', 'outline']
const PHASE2_STEPS = ['phase2_constraints', 'phase2_approach', 'phase2_sources', 'phase2_plan']
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

export default function RunDetail() {
  const { projectId, runId } = useParams<{ projectId: string; runId: string }>()
  const { session } = useAuth()
  const navigate = useNavigate()

  const [run, setRun] = useState<Run | null>(null)
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [logs, setLogs] = useState<AgentLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // Phase 1 state
  const [ideaTitle, setIdeaTitle] = useState('')
  const [ideaSummary, setIdeaSummary] = useState('')
  const [submittingIdea, setSubmittingIdea] = useState(false)
  const [runningTopicCritic, setRunningTopicCritic] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [selectedCandidateIdx, setSelectedCandidateIdx] = useState<number | null>(null)
  const [acceptingTopic, setAcceptingTopic] = useState(false)
  const [runningOutline, setRunningOutline] = useState(false)
  const [outlineFeedback, setOutlineFeedback] = useState('')
  const [continuingToPhase2, setContinuingToPhase2] = useState(false)
  const [phase1Expanded, setPhase1Expanded] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  const step2Ref = useRef<HTMLDivElement>(null)
  const step3Ref = useRef<HTMLDivElement>(null)
  const p2ConstraintsRef = useRef<HTMLDivElement>(null)
  const p2ApproachRef = useRef<HTMLDivElement>(null)
  const p2SourcesRef = useRef<HTMLDivElement>(null)
  const p2PlanRef = useRef<HTMLDivElement>(null)
  const logsPanelRef = useRef<HTMLDivElement>(null)
  const prevStatusRef = useRef<string | undefined>(undefined)

  const authHeaders = useCallback(
    () => ({ Authorization: `Bearer ${session?.access_token}` }),
    [session?.access_token],
  )

  // ── Fetch helpers ──────────────────────────────────────────
  const initialLoadDone = useRef(false)

  const fetchRun = useCallback(async () => {
    if (!session || !runId) return
    try {
      const res = await fetch(`${BACKEND_URL}/runs/${runId}`, {
        headers: authHeaders(),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.detail || 'Failed to fetch run')
      }
      setRun(await res.json())
      setError(null)
    } catch (err: unknown) {
      if (!initialLoadDone.current) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    } finally {
      setLoading(false)
      initialLoadDone.current = true
    }
  }, [session, runId, authHeaders])

  const fetchArtifacts = useCallback(async () => {
    if (!session || !runId) return
    try {
      const res = await fetch(`${BACKEND_URL}/runs/${runId}/artifacts`, {
        headers: authHeaders(),
      })
      if (res.ok) setArtifacts(await res.json())
    } catch (_e) { /* ignore */ }
  }, [session, runId, authHeaders])

  const refreshRunData = useCallback(async () => {
    await Promise.all([fetchRun(), fetchArtifacts()])
  }, [fetchRun, fetchArtifacts])

  // Initial load
  useEffect(() => { fetchRun() }, [fetchRun])
  useEffect(() => { fetchArtifacts() }, [fetchArtifacts])

  // ── Fetch persisted logs ──────────────────────────────────
  useEffect(() => {
    if (!session || !runId) return
    ;(async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/runs/${runId}/logs`, {
          headers: authHeaders(),
        })
        if (res.ok) setLogs(await res.json())
      } catch (_e) { /* ignore */ }
    })()
  }, [session, runId, authHeaders])

  // ── SSE connection ──────────────────────────────────────────
  useEffect(() => {
    if (!session || !runId) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    ;(async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/runs/${runId}/stream`, {
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
  }, [session, runId, authHeaders])

  // ── Auto-refresh while running ──────────────────────────────
  useEffect(() => {
    if (!session || !runId || !run) return
    if (run.status !== 'running') return

    const interval = setInterval(() => refreshRunData(), 3000)
    return () => clearInterval(interval)
  }, [session, runId, run?.status, refreshRunData])

  // ── Scroll to step section when pipeline completes ─────────
  useEffect(() => {
    if (
      prevStatusRef.current === 'running' &&
      run?.status && run.status !== 'running'
    ) {
      const stepRefMap: Record<string, React.RefObject<HTMLDivElement | null>> = {
        topic_critic: step2Ref,
        outline: step3Ref,
        phase2_constraints: p2ConstraintsRef,
        phase2_approach: p2ApproachRef,
        phase2_sources: p2SourcesRef,
        phase2_plan: p2PlanRef,
      }
      const target = stepRefMap[run.step] ?? step3Ref
      setTimeout(() => {
        target.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 300)
    }
    prevStatusRef.current = run?.status
  }, [run?.status, run?.step])

  // ── Derived state ──────────────────────────────────────────
  const hasIdea = artifacts.some((a) => a.step_name === 'idea')
  const hasTopicCritic = artifacts.some((a) => a.step_name === 'topic_critic')
  const hasAcceptedTopic = artifacts.some((a) => a.step_name === 'accepted_topic')
  const hasOutline = artifacts.some((a) => a.step_name === 'outline')
  const isRunning = run?.status === 'running'
  const phase1Completed = run?.step === 'outline' && run?.status === 'completed' && run?.phase === 'phase1'
  const isPhase2 = run?.phase === 'phase2'

  // ── Phase 1 Actions ────────────────────────────────────────
  const submitIdea = async () => {
    if (!session || !runId || !ideaTitle.trim()) return
    setSubmittingIdea(true)
    setActionError(null)
    try {
      const res = await fetch(`${BACKEND_URL}/runs/${runId}/artifacts`, {
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
    if (!session || !runId) return
    setRunningTopicCritic(true)
    setActionError(null)
    try {
      const body: Record<string, unknown> = {}
      if (feedback.trim()) body.feedback = feedback.trim()
      const res = await fetch(`${BACKEND_URL}/runs/${runId}/phase1/topic_critic`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || `Server error ${res.status}`)
      }
      setFeedback('')
      setRun(prev => prev ? { ...prev, status: 'running', step: 'topic_critic' } : prev)
      logsPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to start topic critic'
      setActionError(msg)
    } finally {
      setRunningTopicCritic(false)
    }
  }

  const acceptTopic = async () => {
    if (!session || !runId || selectedCandidateIdx === null) return
    setAcceptingTopic(true)
    setActionError(null)
    try {
      const res = await fetch(`${BACKEND_URL}/runs/${runId}/phase1/accept_topic`, {
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
    if (!session || !runId) return
    setRunningOutline(true)
    setActionError(null)
    try {
      const body: Record<string, unknown> = {}
      if (outlineFeedback.trim()) body.feedback = outlineFeedback.trim()
      const res = await fetch(`${BACKEND_URL}/runs/${runId}/phase1/outline`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || `Server error ${res.status}`)
      }
      setOutlineFeedback('')
      setRun(prev => prev ? { ...prev, status: 'running', step: 'outline' } : prev)
      logsPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to start outline generation'
      setActionError(msg)
    } finally {
      setRunningOutline(false)
    }
  }

  const deleteRun = async () => {
    if (!run) return
    if (!confirm(`Delete Run #${run.run_number}? This will permanently remove all its artifacts and logs.`)) return
    try {
      const res = await fetch(`${BACKEND_URL}/runs/${runId}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || `Server error ${res.status}`)
      }
      navigate(`/projects/${projectId}`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete run'
      setActionError(msg)
    }
  }

  const continueToPhase2 = async () => {
    if (!session || !runId) return
    setContinuingToPhase2(true)
    setActionError(null)
    try {
      const res = await fetch(`${BACKEND_URL}/runs/${runId}/phase2/continue`, {
        method: 'POST',
        headers: authHeaders(),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || `Server error ${res.status}`)
      }
      await refreshRunData()
      setTimeout(() => {
        p2ConstraintsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 300)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to continue to Phase 2'
      setActionError(msg)
    } finally {
      setContinuingToPhase2(false)
    }
  }

  // ── Loading / Error ─────────────────────────────────────────
  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <p className="text-muted-foreground">Loading run...</p>
      </div>
    )
  }

  if (error || !run) {
    return (
      <div className="container mx-auto p-6 space-y-4">
        <div className="bg-destructive/10 text-destructive p-3 rounded text-sm">
          {error || 'Run not found'}
        </div>
        <Link to={`/projects/${projectId}`}>
          <Button variant="outline">Back to Project</Button>
        </Link>
      </div>
    )
  }

  // ── Phase 1 step cards ──────────────────────────────────────
  const phase1StepCards = (
    <>
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
      <Card ref={step2Ref} className={hasAcceptedTopic ? 'border-green-200' : ''}>
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
      <Card ref={step3Ref} className={hasOutline && phase1Completed ? 'border-green-200' : ''}>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-lg">Step 3: Generate Outline</CardTitle>
            {hasOutline && phase1Completed && (
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
              return <p className="text-sm text-amber-600">Accept a topic in Step 2 first.</p>
            }
            const accepted = acceptedArt.content as { selected?: { title?: string; description?: string } }
            const outlineContent = outlineArt?.content as {
              title?: string; abstract?: string
              sections?: Array<{ name?: string; bullets?: string[] }>
              keywords?: string[]
            } | undefined
            return (
              <>
                <div className="bg-green-50 border border-green-200 rounded p-3">
                  <p className="text-sm font-medium text-green-800">Accepted Topic:</p>
                  <p className="text-sm">{accepted.selected?.title ?? 'Untitled'}</p>
                  {accepted.selected?.description && (
                    <p className="text-xs text-muted-foreground mt-1">{accepted.selected.description}</p>
                  )}
                </div>
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
                <Button onClick={triggerOutline} disabled={runningOutline || isRunning} size="sm">
                  {runningOutline || isRunning ? 'Generating...' : outlineArt ? 'Regenerate Outline' : 'Generate Outline'}
                </Button>
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
                    {outlineArt && <p className="text-xs text-muted-foreground">Version: v{outlineArt.version}</p>}
                  </div>
                )}
              </>
            )
          })()}
        </CardContent>
      </Card>
    </>
  )

  // ── Render ──────────────────────────────────────────────────
  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <Link to={`/projects/${projectId}`}>
            <Button variant="outline" size="sm">Back to Project</Button>
          </Link>
          <div className="mt-2">
            <h1 className="text-3xl font-bold" title={run.id}>
              Run #{run.run_number}
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              {new Date(run.created_at).toLocaleString()}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={deleteRun}
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
        >
          Delete Run
        </Button>
      </div>

      {/* Action error banner */}
      {actionError && (
        <div className="bg-destructive/10 text-destructive p-3 rounded text-sm flex justify-between items-center">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="text-destructive font-bold ml-4">X</button>
        </div>
      )}

      {/* Phase 1 Completed banner (only when done but not yet in Phase 2) */}
      {phase1Completed && !isPhase2 && (
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
        <CardContent className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Phase 1 — Research Topic</p>
            <div className="flex items-center gap-1">
              {PHASE1_STEPS.map((step, idx) => {
                const currentIdx = PHASE1_STEPS.indexOf(run.step)
                let bg = 'bg-gray-100 text-gray-500'
                let connectorColor = 'bg-gray-200'
                if (isPhase2 || (idx < currentIdx) || (idx === currentIdx && run.status === 'completed')) {
                  bg = 'bg-green-100 text-green-800'
                  connectorColor = 'bg-green-400'
                } else if (idx === currentIdx) {
                  bg = 'bg-blue-100 text-blue-800'
                  connectorColor = idx > 0 ? 'bg-green-400' : 'bg-gray-200'
                }
                return (
                  <div key={step} className="flex items-center gap-1">
                    {idx > 0 && <div className={`w-6 h-0.5 ${connectorColor}`} />}
                    <span className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${bg}`}>
                      {STEP_LABELS[step] || step}
                    </span>
                  </div>
                )
              })}
              {isPhase2 && <span className="ml-1 text-green-600 text-sm">&#10003;</span>}
            </div>
          </div>
          {isPhase2 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Phase 2 — Research Plan</p>
              <div className="flex items-center gap-1">
                {PHASE2_STEPS.map((step, idx) => {
                  const currentIdx = PHASE2_STEPS.indexOf(run.step)
                  const stepDone = idx < currentIdx || (idx === currentIdx && run.status === 'completed')
                  let bg = 'bg-gray-100 text-gray-500'
                  let connectorColor = 'bg-gray-200'
                  if (stepDone) {
                    bg = 'bg-green-100 text-green-800'
                    connectorColor = 'bg-green-400'
                  } else if (idx === currentIdx) {
                    bg = 'bg-blue-100 text-blue-800'
                    connectorColor = idx > 0 ? 'bg-green-400' : 'bg-gray-200'
                  }
                  return (
                    <div key={step} className="flex items-center gap-1">
                      {idx > 0 && <div className={`w-6 h-0.5 ${connectorColor}`} />}
                      <span className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${bg}`}>
                        {STEP_LABELS[step] || step}
                      </span>
                    </div>
                  )
                })}
                {run.step === 'phase2_plan' && run.status === 'completed' && (
                  <span className="ml-1 text-green-600 text-sm">&#10003;</span>
                )}
              </div>
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            Status: <span className={`font-medium px-2 py-0.5 rounded text-xs ${statusBadge(run.status)}`}>
              {run.status}
            </span>
          </p>
        </CardContent>
      </Card>

      {/* Phase 1 Step Cards — collapsible when in Phase 2 */}
      {isPhase2 ? (
        <div className="border rounded-lg overflow-hidden">
          <button
            onClick={() => setPhase1Expanded(!phase1Expanded)}
            className="w-full flex items-center justify-between p-4 hover:bg-muted/40 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-green-600 text-sm">&#10003;</span>
              <span className="font-medium text-sm">Phase 1 — Research Topic</span>
              <span className="text-xs text-muted-foreground">(Idea, Topics & Outline)</span>
            </div>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${phase1Expanded ? 'rotate-180' : ''}`} />
          </button>
          {phase1Expanded && (
            <div className="space-y-4 p-4 pt-0 border-t">
              {phase1StepCards}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {phase1StepCards}
        </div>
      )}

      {/* Continue to Phase 2 */}
      {phase1Completed && !isPhase2 && (
        <Card className="border-blue-300 bg-gradient-to-r from-blue-50 to-indigo-50">
          <CardContent className="pt-6 pb-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-bold text-blue-900 text-lg">Ready for Phase 2</p>
                <p className="text-sm text-blue-700 mt-1">
                  Design your research methodology with AI-guided approach selection, source discovery, and a complete research plan.
                </p>
              </div>
              <Button onClick={continueToPhase2} disabled={continuingToPhase2} size="lg" className="shrink-0">
                {continuingToPhase2 ? 'Continuing...' : (
                  <span className="flex items-center gap-2">
                    Continue to Phase 2
                    <ArrowRight className="h-4 w-4" />
                  </span>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Phase 2 Steps */}
      {isPhase2 && (
        <Phase2Steps
          run={run}
          artifacts={artifacts}
          authHeaders={authHeaders}
          runId={runId!}
          refreshRunData={refreshRunData}
          setActionError={setActionError}
          setRun={setRun}
          logsPanelRef={logsPanelRef}
          p2ConstraintsRef={p2ConstraintsRef}
          p2ApproachRef={p2ApproachRef}
          p2SourcesRef={p2SourcesRef}
          p2PlanRef={p2PlanRef}
        />
      )}

      {/* Artifacts (collapsed) */}
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
      <div ref={logsPanelRef}>
        <AgentLogsPanel logs={logs} />
      </div>
    </div>
  )
}
