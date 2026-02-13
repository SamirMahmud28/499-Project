import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { Run, Artifact } from '@/types/api'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL

interface Phase2StepsProps {
  run: Run
  artifacts: Artifact[]
  authHeaders: () => Record<string, string>
  runId: string
  refreshRunData: () => Promise<void>
  setActionError: (msg: string | null) => void
  setRun: React.Dispatch<React.SetStateAction<Run | null>>
  logsPanelRef: React.RefObject<HTMLDivElement>
  p2ConstraintsRef: React.RefObject<HTMLDivElement>
  p2ApproachRef: React.RefObject<HTMLDivElement>
  p2SourcesRef: React.RefObject<HTMLDivElement>
  p2PlanRef: React.RefObject<HTMLDivElement>
}

export default function Phase2Steps({
  run, artifacts, authHeaders, runId, refreshRunData,
  setActionError, setRun, logsPanelRef,
  p2ConstraintsRef, p2ApproachRef, p2SourcesRef, p2PlanRef,
}: Phase2StepsProps) {
  // ── Phase 2 Step 1: Constraints ──────────────────────────────
  const [userLevel, setUserLevel] = useState('university')
  const [timeBudget, setTimeBudget] = useState('weeks')
  const [dataAvailability, setDataAvailability] = useState('public_only')
  const [labAccess, setLabAccess] = useState(false)
  const [participantsAccess, setParticipantsAccess] = useState(false)
  const [softwareTools, setSoftwareTools] = useState('')
  const [constraintNotes, setConstraintNotes] = useState('')
  const [submittingConstraints, setSubmittingConstraints] = useState(false)

  // ── Phase 2 Step 2: Approach ─────────────────────────────────
  const [runningApproach, setRunningApproach] = useState(false)
  const [approachFeedback, setApproachFeedback] = useState('')
  const [selectedApproach, setSelectedApproach] = useState<string | null>(null)
  const [selectedTitle, setSelectedTitle] = useState('')
  const [approachNotes, setApproachNotes] = useState('')
  const [acceptingApproach, setAcceptingApproach] = useState(false)

  // ── Phase 2 Step 3: Sources & Evidence ───────────────────────
  const [runningSources, setRunningSources] = useState(false)
  const [sourcesFeedback, setSourcesFeedback] = useState('')

  // ── Phase 2 Step 4: Research Plan ────────────────────────────
  const [runningPlan, setRunningPlan] = useState(false)
  const [planFeedback, setPlanFeedback] = useState('')

  // ── Derived state ────────────────────────────────────────────
  const isRunning = run.status === 'running'
  const hasConstraints = artifacts.some((a) => a.step_name === 'phase2_constraints')
  const hasApproachRec = artifacts.some((a) => a.step_name === 'phase2_approach_recommendation')
  const hasSelectedApproach = artifacts.some((a) => a.step_name === 'phase2_selected_approach')
  const hasSourcesPack = artifacts.some((a) => a.step_name === 'phase2_sources_pack')
  const hasEvidencePlan = artifacts.some((a) => a.step_name === 'phase2_evidence_plan')
  const hasResearchPlan = artifacts.some((a) => a.step_name === 'phase2_research_plan_pack')

  // ── Actions ──────────────────────────────────────────────────
  const submitConstraints = async () => {
    setSubmittingConstraints(true)
    setActionError(null)
    try {
      const res = await fetch(`${BACKEND_URL}/runs/${runId}/phase2/constraints`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_level: userLevel,
          time_budget: timeBudget,
          data_availability: dataAvailability,
          resources: {
            lab_access: labAccess,
            participants_access: participantsAccess,
            software_tools: softwareTools.trim()
              ? softwareTools.split(',').map((s) => s.trim()).filter(Boolean)
              : [],
          },
          notes: constraintNotes.trim(),
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || `Server error ${res.status}`)
      }
      await refreshRunData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to submit constraints'
      setActionError(msg)
    } finally {
      setSubmittingConstraints(false)
    }
  }

  const triggerApproach = async () => {
    setRunningApproach(true)
    setActionError(null)
    try {
      const body: Record<string, unknown> = {}
      if (approachFeedback.trim()) body.feedback = approachFeedback.trim()
      const res = await fetch(`${BACKEND_URL}/runs/${runId}/phase2/approach`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || `Server error ${res.status}`)
      }
      setApproachFeedback('')
      setRun(prev => prev ? { ...prev, status: 'running', step: 'phase2_approach' } : prev)
      logsPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to start approach recommendation'
      setActionError(msg)
    } finally {
      setRunningApproach(false)
    }
  }

  const acceptApproach = async () => {
    if (!selectedApproach || !selectedTitle.trim()) return
    setAcceptingApproach(true)
    setActionError(null)
    try {
      const res = await fetch(`${BACKEND_URL}/runs/${runId}/phase2/select_approach`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selected_approach: selectedApproach,
          selected_title: selectedTitle.trim(),
          notes: approachNotes.trim(),
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || `Server error ${res.status}`)
      }
      await refreshRunData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to accept approach'
      setActionError(msg)
    } finally {
      setAcceptingApproach(false)
    }
  }

  const triggerSources = async () => {
    setRunningSources(true)
    setActionError(null)
    try {
      const body: Record<string, unknown> = {}
      if (sourcesFeedback.trim()) body.feedback = sourcesFeedback.trim()
      const res = await fetch(`${BACKEND_URL}/runs/${runId}/phase2/sources`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || `Server error ${res.status}`)
      }
      setSourcesFeedback('')
      setRun(prev => prev ? { ...prev, status: 'running', step: 'phase2_sources' } : prev)
      logsPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to start source search'
      setActionError(msg)
    } finally {
      setRunningSources(false)
    }
  }

  const triggerPlan = async () => {
    setRunningPlan(true)
    setActionError(null)
    try {
      const body: Record<string, unknown> = {}
      if (planFeedback.trim()) body.feedback = planFeedback.trim()
      const res = await fetch(`${BACKEND_URL}/runs/${runId}/phase2/plan`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || `Server error ${res.status}`)
      }
      setPlanFeedback('')
      setRun(prev => prev ? { ...prev, status: 'running', step: 'phase2_plan' } : prev)
      logsPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to start plan generation'
      setActionError(msg)
    } finally {
      setRunningPlan(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────
  return (
    <>
      {/* Phase 2 Step 1: Constraints */}
      <Card ref={p2ConstraintsRef} className={hasConstraints ? 'border-green-200' : ''}>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-lg">Phase 2 — Step 1: Research Constraints</CardTitle>
            {hasConstraints && (
              <span className="px-2 py-0.5 rounded bg-green-100 text-green-800 text-xs font-medium">
                Done
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {hasConstraints ? (
            (() => {
              const cArt = artifacts.find((a) => a.step_name === 'phase2_constraints')
              const c = cArt?.content as {
                time_budget?: string
                data_availability?: string
                metadata?: { user_level?: string }
                resources?: { lab_access?: boolean; participants_access?: boolean; software_tools?: string[] }
                notes?: string
              } | undefined
              return c ? (
                <div className="bg-green-50 border border-green-200 rounded p-3 text-sm space-y-1">
                  <p><span className="font-medium">User Level:</span> {c.metadata?.user_level}</p>
                  <p><span className="font-medium">Time Budget:</span> {c.time_budget}</p>
                  <p><span className="font-medium">Data Availability:</span> {c.data_availability}</p>
                  <p><span className="font-medium">Lab Access:</span> {c.resources?.lab_access ? 'Yes' : 'No'}</p>
                  <p><span className="font-medium">Participants Access:</span> {c.resources?.participants_access ? 'Yes' : 'No'}</p>
                  {c.resources?.software_tools && c.resources.software_tools.length > 0 && (
                    <p><span className="font-medium">Software Tools:</span> {c.resources.software_tools.join(', ')}</p>
                  )}
                  {c.notes && <p><span className="font-medium">Notes:</span> {c.notes}</p>}
                </div>
              ) : null
            })()
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Define the constraints for your research. These will guide the approach recommendation.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">User Level *</label>
                  <select
                    className="w-full border rounded px-3 py-2 text-sm bg-background"
                    value={userLevel}
                    onChange={(e) => setUserLevel(e.target.value)}
                  >
                    <option value="school">School</option>
                    <option value="university">University</option>
                    <option value="professional">Professional</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Time Budget *</label>
                  <select
                    className="w-full border rounded px-3 py-2 text-sm bg-background"
                    value={timeBudget}
                    onChange={(e) => setTimeBudget(e.target.value)}
                  >
                    <option value="hours">Hours</option>
                    <option value="days">Days</option>
                    <option value="weeks">Weeks</option>
                    <option value="months">Months</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Data Availability *</label>
                  <select
                    className="w-full border rounded px-3 py-2 text-sm bg-background"
                    value={dataAvailability}
                    onChange={(e) => setDataAvailability(e.target.value)}
                  >
                    <option value="none">None</option>
                    <option value="public_only">Public Only</option>
                    <option value="can_collect">Can Collect</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={labAccess}
                    onChange={(e) => setLabAccess(e.target.checked)}
                  />
                  Lab Access
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={participantsAccess}
                    onChange={(e) => setParticipantsAccess(e.target.checked)}
                  />
                  Participants Access
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Software Tools (comma-separated)</label>
                <input
                  type="text"
                  className="w-full border rounded px-3 py-2 text-sm bg-background"
                  placeholder="e.g. Python, SPSS, R, Excel"
                  value={softwareTools}
                  onChange={(e) => setSoftwareTools(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Notes (optional)</label>
                <textarea
                  className="w-full border rounded px-3 py-2 text-sm bg-background min-h-[60px]"
                  placeholder="Any additional constraints or preferences..."
                  value={constraintNotes}
                  onChange={(e) => setConstraintNotes(e.target.value)}
                />
              </div>
              <Button
                onClick={submitConstraints}
                disabled={submittingConstraints}
                size="sm"
              >
                {submittingConstraints ? 'Submitting...' : 'Submit Constraints'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Phase 2 Step 2: Approach Recommendation */}
      <Card ref={p2ApproachRef} className={hasSelectedApproach ? 'border-green-200' : ''}>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-lg">Phase 2 — Step 2: Approach Recommendation</CardTitle>
            {hasSelectedApproach && (
              <span className="px-2 py-0.5 rounded bg-green-100 text-green-800 text-xs font-medium">
                Accepted
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!hasConstraints ? (
            <p className="text-sm text-amber-600">Submit your constraints in Step 1 first.</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                The AI will analyze your topic, outline, and constraints to recommend the best research approach.
              </p>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Feedback (optional{hasApproachRec ? ' — will regenerate with new guidance' : ''})
                </label>
                <textarea
                  className="w-full border rounded px-3 py-2 text-sm bg-background min-h-[40px]"
                  placeholder="e.g. I prefer quantitative methods..."
                  value={approachFeedback}
                  onChange={(e) => setApproachFeedback(e.target.value)}
                  disabled={isRunning}
                />
              </div>
              <Button
                onClick={triggerApproach}
                disabled={runningApproach || isRunning}
                size="sm"
              >
                {runningApproach || isRunning
                  ? 'Running...'
                  : hasApproachRec
                    ? 'Regenerate Recommendation'
                    : 'Get Recommendations'}
              </Button>

              {/* Display recommendation */}
              {(() => {
                const recArt = artifacts.find((a) => a.step_name === 'phase2_approach_recommendation')
                if (!recArt) return null
                const rec = recArt.content as {
                  refined_problem_statement?: string
                  refined_research_questions?: string[]
                  suggested_titles?: string[]
                  recommended?: {
                    approach?: string
                    why_fit?: string[]
                    effort_level?: string
                    what_user_must_provide?: string[]
                  }
                  alternatives?: Array<{
                    approach?: string
                    why?: string[]
                    tradeoffs?: string[]
                  }>
                }

                return (
                  <div className="space-y-4 border-t pt-4">
                    {/* Problem statement */}
                    {rec.refined_problem_statement && (
                      <div>
                        <h4 className="text-sm font-semibold mb-1">Refined Problem Statement</h4>
                        <p className="text-sm text-muted-foreground">{rec.refined_problem_statement}</p>
                      </div>
                    )}

                    {/* Research questions */}
                    {rec.refined_research_questions && rec.refined_research_questions.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold mb-1">Research Questions</h4>
                        <ol className="list-decimal list-inside space-y-1">
                          {rec.refined_research_questions.map((q, i) => (
                            <li key={i} className="text-sm text-muted-foreground">{q}</li>
                          ))}
                        </ol>
                      </div>
                    )}

                    {/* Suggested titles */}
                    {rec.suggested_titles && rec.suggested_titles.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold mb-1">Suggested Titles</h4>
                        <div className="space-y-1">
                          {rec.suggested_titles.map((t, i) => (
                            <div key={i} className="text-sm border rounded px-3 py-2 bg-muted/30">
                              {i + 1}. {t}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Recommended approach */}
                    {rec.recommended && (
                      <div className="border-2 border-blue-200 rounded-lg p-4 bg-blue-50/30">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="text-sm font-bold text-blue-900">Recommended: {rec.recommended.approach}</h4>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            rec.recommended.effort_level === 'low' ? 'bg-green-100 text-green-800' :
                            rec.recommended.effort_level === 'medium' ? 'bg-amber-100 text-amber-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {rec.recommended.effort_level} effort
                          </span>
                        </div>
                        {rec.recommended.why_fit && rec.recommended.why_fit.length > 0 && (
                          <div className="mb-2">
                            <p className="text-xs font-medium text-blue-800 mb-1">Why it fits:</p>
                            <ul className="list-disc list-inside space-y-0.5">
                              {rec.recommended.why_fit.map((w, i) => (
                                <li key={i} className="text-sm text-blue-700">{w}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {rec.recommended.what_user_must_provide && rec.recommended.what_user_must_provide.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-blue-800 mb-1">What you need to provide:</p>
                            <ul className="list-disc list-inside space-y-0.5">
                              {rec.recommended.what_user_must_provide.map((w, i) => (
                                <li key={i} className="text-sm text-blue-700">{w}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Alternatives */}
                    {rec.alternatives && rec.alternatives.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold mb-2">Alternatives</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {rec.alternatives.map((alt, i) => (
                            <div key={i} className="border rounded p-3">
                              <p className="text-sm font-medium">{alt.approach}</p>
                              {alt.why && alt.why.length > 0 && (
                                <ul className="list-disc list-inside mt-1 space-y-0.5">
                                  {alt.why.map((w, j) => (
                                    <li key={j} className="text-xs text-muted-foreground">{w}</li>
                                  ))}
                                </ul>
                              )}
                              {alt.tradeoffs && alt.tradeoffs.length > 0 && (
                                <div className="mt-1">
                                  <span className="text-xs font-medium text-amber-700">Tradeoffs: </span>
                                  <span className="text-xs text-amber-600">{alt.tradeoffs.join('; ')}</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <p className="text-xs text-muted-foreground">Version: v{recArt.version}</p>

                    {/* Selection UI */}
                    {!hasSelectedApproach ? (
                      <div className="border-t pt-4 space-y-4">
                        <h4 className="text-sm font-bold">Select Your Approach & Title</h4>

                        {/* Title selection */}
                        <div>
                          <label className="block text-sm font-medium mb-2">Choose a title</label>
                          <div className="space-y-1">
                            {(rec.suggested_titles ?? []).map((t, i) => (
                              <label key={i} className={`block border rounded px-3 py-2 text-sm cursor-pointer transition-colors ${
                                selectedTitle === t ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                              }`}>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="radio"
                                    name="title"
                                    checked={selectedTitle === t}
                                    onChange={() => setSelectedTitle(t)}
                                  />
                                  {t}
                                </div>
                              </label>
                            ))}
                          </div>
                          <div className="mt-2">
                            <label className="block text-xs font-medium mb-1 text-muted-foreground">Or enter a custom title</label>
                            <input
                              type="text"
                              className="w-full border rounded px-3 py-2 text-sm bg-background"
                              placeholder="Your own title..."
                              value={!(rec.suggested_titles ?? []).includes(selectedTitle) ? selectedTitle : ''}
                              onChange={(e) => setSelectedTitle(e.target.value)}
                            />
                          </div>
                        </div>

                        {/* Approach selection */}
                        <div>
                          <label className="block text-sm font-medium mb-2">Choose an approach</label>
                          <div className="space-y-2">
                            {/* Recommended */}
                            {rec.recommended && (
                              <label className={`block border-2 rounded-lg p-3 cursor-pointer transition-colors ${
                                selectedApproach === rec.recommended.approach
                                  ? 'border-primary bg-primary/5'
                                  : 'border-blue-200 hover:bg-blue-50/50'
                              }`}>
                                <div className="flex items-start gap-2">
                                  <input
                                    type="radio"
                                    name="approach"
                                    checked={selectedApproach === rec.recommended.approach}
                                    onChange={() => setSelectedApproach(rec.recommended!.approach!)}
                                    className="mt-1"
                                  />
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-medium">{rec.recommended.approach}</span>
                                      <span className="px-1.5 py-0.5 rounded bg-green-100 text-green-800 text-xs">Recommended</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1">
                                      {(rec.recommended.why_fit ?? []).join('; ')}
                                    </p>
                                  </div>
                                </div>
                              </label>
                            )}
                            {/* Alternatives */}
                            {(rec.alternatives ?? []).map((alt, i) => (
                              <label key={i} className={`block border rounded-lg p-3 cursor-pointer transition-colors ${
                                selectedApproach === alt.approach
                                  ? 'border-primary bg-primary/5'
                                  : 'border-border hover:bg-muted/50'
                              }`}>
                                <div className="flex items-start gap-2">
                                  <input
                                    type="radio"
                                    name="approach"
                                    checked={selectedApproach === alt.approach}
                                    onChange={() => setSelectedApproach(alt.approach!)}
                                    className="mt-1"
                                  />
                                  <div>
                                    <span className="text-sm font-medium">{alt.approach}</span>
                                    {alt.why && alt.why.length > 0 && (
                                      <p className="text-xs text-muted-foreground mt-1">{alt.why.join('; ')}</p>
                                    )}
                                    {alt.tradeoffs && alt.tradeoffs.length > 0 && (
                                      <p className="text-xs text-amber-600 mt-1">Tradeoffs: {alt.tradeoffs.join('; ')}</p>
                                    )}
                                  </div>
                                </div>
                              </label>
                            ))}
                          </div>
                        </div>

                        {/* Notes */}
                        <div>
                          <label className="block text-sm font-medium mb-1">Notes (optional)</label>
                          <textarea
                            className="w-full border rounded px-3 py-2 text-sm bg-background min-h-[40px]"
                            placeholder="Any notes about your selection..."
                            value={approachNotes}
                            onChange={(e) => setApproachNotes(e.target.value)}
                          />
                        </div>

                        <Button
                          onClick={acceptApproach}
                          disabled={acceptingApproach || !selectedApproach || !selectedTitle.trim() || isRunning}
                          size="sm"
                        >
                          {acceptingApproach ? 'Accepting...' : 'Accept Approach'}
                        </Button>
                      </div>
                    ) : (
                      <div className="border-t pt-4">
                        {(() => {
                          const selArt = artifacts.find((a) => a.step_name === 'phase2_selected_approach')
                          if (!selArt) return null
                          const sel = selArt.content as {
                            selected_approach?: string
                            selected_title?: string
                            user_overrides?: { notes?: string }
                          }
                          return (
                            <div className="bg-green-50 border border-green-200 rounded p-3 text-sm space-y-1">
                              <p className="font-medium text-green-800">Approach accepted</p>
                              <p><span className="font-medium">Approach:</span> {sel.selected_approach}</p>
                              <p><span className="font-medium">Title:</span> {sel.selected_title}</p>
                              {sel.user_overrides?.notes && (
                                <p><span className="font-medium">Notes:</span> {sel.user_overrides.notes}</p>
                              )}
                            </div>
                          )
                        })()}
                      </div>
                    )}
                  </div>
                )
              })()}
            </>
          )}
        </CardContent>
      </Card>

      {/* Phase 2 Step 3: Sources & Evidence */}
      <Card ref={p2SourcesRef} className={hasSourcesPack ? 'border-green-200' : ''}>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-lg">Phase 2 — Step 3: Evidence & Sources</CardTitle>
            {hasSourcesPack && hasEvidencePlan && (
              <span className="px-2 py-0.5 rounded bg-green-100 text-green-800 text-xs font-medium">
                Done
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!hasSelectedApproach ? (
            <p className="text-sm text-amber-600">Select your approach in Step 2 first.</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                The AI will search academic databases and the web for papers, datasets, tools, and knowledge bases relevant to your research, then generate an evidence collection plan.
              </p>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Feedback (optional{hasSourcesPack ? ' — will regenerate with new guidance' : ''})
                </label>
                <textarea
                  className="w-full border rounded px-3 py-2 text-sm bg-background min-h-[40px]"
                  placeholder="e.g. Focus on recent papers from 2020+, include Python ML libraries..."
                  value={sourcesFeedback}
                  onChange={(e) => setSourcesFeedback(e.target.value)}
                />
              </div>
              <Button
                onClick={triggerSources}
                disabled={runningSources || isRunning}
                size="sm"
              >
                {runningSources || (isRunning && run?.step === 'phase2_sources')
                  ? 'Searching...'
                  : hasSourcesPack
                    ? 'Regenerate Sources'
                    : 'Search for Resources'}
              </Button>

              {/* Sources Pack display */}
              {hasSourcesPack && (() => {
                const srcArt = artifacts.find((a) => a.step_name === 'phase2_sources_pack')
                if (!srcArt) return null
                const src = srcArt.content as {
                  metadata?: { search_keywords?: string[] }
                  papers?: Array<{ title?: string; authors?: string[]; year?: number; venue?: string; doi?: string; url?: string; pdf_url?: string; why_relevant?: string; credibility_notes?: string; source?: string }>
                  datasets?: Array<{ name?: string; domain?: string; license?: string; url?: string; why_relevant?: string; notes?: string }>
                  tools?: Array<{ name?: string; type?: string; url?: string; why_useful?: string; notes?: string }>
                  knowledge_bases?: Array<{ name?: string; url?: string; why_useful?: string; source?: string }>
                }

                return (
                  <div className="space-y-4 pt-2">
                    {/* Search keywords */}
                    {src.metadata?.search_keywords && (
                      <div className="flex flex-wrap gap-1">
                        {src.metadata.search_keywords.map((kw, i) => (
                          <span key={i} className="px-2 py-0.5 rounded bg-muted text-xs">{kw}</span>
                        ))}
                      </div>
                    )}

                    {/* Papers */}
                    {(src.papers ?? []).length > 0 && (
                      <div>
                        <h4 className="text-sm font-bold mb-2">Papers ({src.papers!.length})</h4>
                        <div className="space-y-2">
                          {src.papers!.map((p, i) => (
                            <div key={i} className="border rounded p-3 text-sm space-y-1">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    {p.url ? (
                                      <a href={p.url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">{p.title}</a>
                                    ) : (
                                      <span className="font-medium">{p.title}</span>
                                    )}
                                    {p.source && (
                                      <span className="px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 text-xs shrink-0">{p.source}</span>
                                    )}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {(p.authors ?? []).slice(0, 3).join(', ')}{(p.authors ?? []).length > 3 ? ' et al.' : ''}
                                    {p.year ? ` (${p.year})` : ''}
                                    {p.venue ? ` — ${p.venue}` : ''}
                                  </div>
                                </div>
                                <div className="flex gap-1 shrink-0">
                                  {p.doi && <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 text-xs">DOI</span>}
                                  {p.credibility_notes && <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 text-xs">{p.credibility_notes}</span>}
                                  {p.pdf_url && (
                                    <a href={p.pdf_url} target="_blank" rel="noopener noreferrer" className="px-1.5 py-0.5 rounded bg-green-100 text-green-800 text-xs hover:bg-green-200">PDF</a>
                                  )}
                                </div>
                              </div>
                              {p.why_relevant && <p className="text-xs text-muted-foreground italic">{p.why_relevant}</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Datasets */}
                    {(src.datasets ?? []).length > 0 && (
                      <div>
                        <h4 className="text-sm font-bold mb-2">Datasets ({src.datasets!.length})</h4>
                        <div className="space-y-2">
                          {src.datasets!.map((d, i) => (
                            <div key={i} className="border rounded p-3 text-sm">
                              <div className="flex items-center gap-2">
                                {d.url ? (
                                  <a href={d.url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">{d.name}</a>
                                ) : (
                                  <span className="font-medium">{d.name}</span>
                                )}
                                {d.domain && <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 text-xs">{d.domain}</span>}
                                {d.license && d.license !== 'null' && d.license !== 'unknown' && <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 text-xs">{d.license}</span>}
                              </div>
                              {d.why_relevant && <p className="text-xs text-muted-foreground italic mt-1">{d.why_relevant}</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Tools — compact grid */}
                    {(src.tools ?? []).length > 0 && (
                      <div>
                        <h4 className="text-sm font-bold mb-2">Suggested Tools ({src.tools!.length})</h4>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                          {src.tools!.map((t, i) => (
                            <div key={i} className="border rounded-lg px-3 py-2 text-xs hover:bg-muted/40 transition-colors group">
                              <div className="flex items-center gap-1.5 mb-1">
                                {t.type && (
                                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{
                                    backgroundColor: t.type === 'library' ? '#f97316' : t.type === 'platform' ? '#8b5cf6' : t.type === 'api' ? '#06b6d4' : t.type === 'framework' ? '#ec4899' : '#6b7280',
                                  }} />
                                )}
                                {t.url ? (
                                  <a href={t.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline truncate">{t.name}</a>
                                ) : (
                                  <span className="font-semibold truncate">{t.name}</span>
                                )}
                              </div>
                              {t.why_useful && <p className="text-muted-foreground leading-tight line-clamp-2">{t.why_useful}</p>}
                              {t.type && <span className="text-[10px] text-muted-foreground/60 mt-1 block">{t.type}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Learning Resources & Knowledge Hub */}
                    {(src.knowledge_bases ?? []).length > 0 && (
                      <div>
                        <h4 className="text-sm font-bold mb-2">Learning Resources & Knowledge Hub ({src.knowledge_bases!.length})</h4>
                        <div className="space-y-2">
                          {src.knowledge_bases!.map((kb, i) => {
                            const isYouTube = (kb.url ?? '').includes('youtube.com') || (kb.url ?? '').includes('youtu.be')
                            return (
                              <div key={i} className="border rounded p-3 text-sm">
                                <div className="flex items-center gap-2">
                                  {isYouTube && (
                                    <svg className="w-4 h-4 text-red-600 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                                      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                                    </svg>
                                  )}
                                  {kb.url ? (
                                    <a href={kb.url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">{kb.name}</a>
                                  ) : (
                                    <span className="font-medium">{kb.name}</span>
                                  )}
                                  {kb.source && (
                                    <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-xs shrink-0">{kb.source}</span>
                                  )}
                                </div>
                                {kb.why_useful && <p className="text-xs text-muted-foreground italic mt-1">{kb.why_useful}</p>}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    <p className="text-xs text-muted-foreground">Version: v{srcArt.version}</p>
                  </div>
                )
              })()}

              {/* Evidence Plan display */}
              {hasEvidencePlan && (() => {
                const epArt = artifacts.find((a) => a.step_name === 'phase2_evidence_plan')
                if (!epArt) return null
                const ep = epArt.content as {
                  evidence_type?: string
                  collection_strategy?: string[]
                  inclusion_exclusion?: { include?: string[]; exclude?: string[] }
                  analysis_overview?: string
                  expected_outputs?: string[]
                }

                return (
                  <details className="border rounded p-3" open>
                    <summary className="cursor-pointer text-sm font-bold">Evidence Collection Plan</summary>
                    <div className="space-y-3 mt-3 text-sm">
                      {ep.evidence_type && (
                        <div>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            ep.evidence_type === 'primary' ? 'bg-blue-100 text-blue-800' : 'bg-indigo-100 text-indigo-800'
                          }`}>
                            {ep.evidence_type} evidence
                          </span>
                        </div>
                      )}

                      {(ep.collection_strategy ?? []).length > 0 && (
                        <div>
                          <p className="font-medium text-xs mb-1">Collection Strategy</p>
                          <ol className="list-decimal list-inside space-y-1 text-xs text-muted-foreground">
                            {ep.collection_strategy!.map((step, i) => (
                              <li key={i}>{step}</li>
                            ))}
                          </ol>
                        </div>
                      )}

                      {ep.inclusion_exclusion && (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <p className="font-medium text-xs mb-1 text-green-700">Include</p>
                            <ul className="list-disc list-inside text-xs text-muted-foreground">
                              {(ep.inclusion_exclusion.include ?? []).map((c, i) => (
                                <li key={i}>{c}</li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <p className="font-medium text-xs mb-1 text-red-700">Exclude</p>
                            <ul className="list-disc list-inside text-xs text-muted-foreground">
                              {(ep.inclusion_exclusion.exclude ?? []).map((c, i) => (
                                <li key={i}>{c}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}

                      {ep.analysis_overview && (
                        <div>
                          <p className="font-medium text-xs mb-1">Analysis Overview</p>
                          <p className="text-xs text-muted-foreground">{ep.analysis_overview}</p>
                        </div>
                      )}

                      {(ep.expected_outputs ?? []).length > 0 && (
                        <div>
                          <p className="font-medium text-xs mb-1">Expected Outputs</p>
                          <ul className="list-disc list-inside text-xs text-muted-foreground">
                            {ep.expected_outputs!.map((o, i) => (
                              <li key={i}>{o}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </details>
                )
              })()}
            </>
          )}
        </CardContent>
      </Card>

      {/* Phase 2 Step 4: Research Plan Pack */}
      <Card ref={p2PlanRef} className={hasResearchPlan ? 'border-green-200' : ''}>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-lg">Phase 2 — Step 4: Research Plan Pack</CardTitle>
            {hasResearchPlan && (
              <span className="px-2 py-0.5 rounded bg-green-100 text-green-800 text-xs font-medium">
                Done
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!hasSourcesPack ? (
            <p className="text-sm text-amber-600">Complete Step 3 (Sources & Evidence) first.</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                The AI will generate a comprehensive Research Plan Pack with methodology steps, templates, risks, and next actions.
              </p>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Feedback (optional{hasResearchPlan ? ' — will regenerate the plan' : ''})
                </label>
                <textarea
                  className="w-full border rounded px-3 py-2 text-sm bg-background min-h-[40px]"
                  placeholder="e.g. Add more detail on data collection, include ethics review..."
                  value={planFeedback}
                  onChange={(e) => setPlanFeedback(e.target.value)}
                  disabled={isRunning}
                />
              </div>
              <Button
                onClick={triggerPlan}
                disabled={runningPlan || isRunning}
                size="sm"
              >
                {runningPlan || (isRunning && run?.step === 'phase2_plan')
                  ? 'Generating...'
                  : hasResearchPlan
                    ? 'Regenerate Plan'
                    : 'Generate Research Plan'}
              </Button>

              {/* Research Plan Pack display */}
              {hasResearchPlan && (() => {
                const planArt = artifacts.find((a) => a.step_name === 'phase2_research_plan_pack')
                if (!planArt) return null
                const plan = planArt.content as {
                  final_title?: string
                  final_problem_statement?: string
                  final_research_questions?: string[]
                  selected_approach?: string
                  methodology_steps?: Array<{ step?: number; name?: string; details?: string[]; deliverables?: string[] }>
                  templates?: Record<string, unknown>
                  risks_constraints_ethics?: Array<{ risk?: string; impact?: string; mitigation?: string }>
                  next_actions?: string[]
                }

                return (
                  <div className="space-y-5 border rounded-lg p-5 mt-2 bg-muted/10">
                    {/* Header */}
                    <div>
                      <h3 className="text-lg font-bold">{plan.final_title}</h3>
                      {plan.selected_approach && (
                        <span className="inline-block mt-1 px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-xs font-medium">
                          {plan.selected_approach}
                        </span>
                      )}
                    </div>

                    {/* Problem Statement */}
                    {plan.final_problem_statement && (
                      <div>
                        <h4 className="text-sm font-semibold mb-1">Problem Statement</h4>
                        <p className="text-sm text-muted-foreground">{plan.final_problem_statement}</p>
                      </div>
                    )}

                    {/* Research Questions */}
                    {(plan.final_research_questions ?? []).length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold mb-1">Research Questions</h4>
                        <ol className="list-decimal list-inside space-y-1">
                          {plan.final_research_questions!.map((q, i) => (
                            <li key={i} className="text-sm text-muted-foreground">{q}</li>
                          ))}
                        </ol>
                      </div>
                    )}

                    {/* Methodology Steps */}
                    {(plan.methodology_steps ?? []).length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold mb-2">Methodology Steps</h4>
                        <div className="space-y-3">
                          {plan.methodology_steps!.map((ms, i) => (
                            <div key={i} className="border rounded p-3 bg-background">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">
                                  {ms.step ?? i + 1}
                                </span>
                                <span className="font-medium text-sm">{ms.name}</span>
                              </div>
                              {(ms.details ?? []).length > 0 && (
                                <ul className="list-disc list-inside ml-8 mt-1 space-y-0.5">
                                  {ms.details!.map((d, di) => (
                                    <li key={di} className="text-xs text-muted-foreground">{d}</li>
                                  ))}
                                </ul>
                              )}
                              {(ms.deliverables ?? []).length > 0 && (
                                <div className="ml-8 mt-1.5 flex flex-wrap gap-1">
                                  {ms.deliverables!.map((del, di) => (
                                    <span key={di} className="px-1.5 py-0.5 rounded bg-green-100 text-green-800 text-[10px]">
                                      {del}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Templates */}
                    {plan.templates && Object.keys(plan.templates).length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold mb-2">Templates</h4>
                        {Object.entries(plan.templates).map(([key, value]) => {
                          if (!value || (Array.isArray(value) && value.length === 0)) return null
                          const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
                          return (
                            <details key={key} className="border rounded p-3 mb-2" open>
                              <summary className="cursor-pointer text-sm font-medium">{label}</summary>
                              <div className="mt-2">
                                {Array.isArray(value) ? (
                                  <ol className="list-decimal list-inside space-y-1">
                                    {(value as Array<string | Record<string, string>>).map((item, i) => (
                                      <li key={i} className="text-xs text-muted-foreground">
                                        {typeof item === 'string' ? item : (
                                          <>
                                            <span className="font-medium">{(item as Record<string, string>).criterion ?? (item as Record<string, string>).topic ?? Object.values(item)[0]}</span>
                                            {(item as Record<string, string>).scoring && (
                                              <span className="text-muted-foreground/60"> — {(item as Record<string, string>).scoring}</span>
                                            )}
                                          </>
                                        )}
                                      </li>
                                    ))}
                                  </ol>
                                ) : typeof value === 'object' ? (
                                  <div className="space-y-2 text-xs text-muted-foreground">
                                    {Object.entries(value as Record<string, unknown>).map(([subKey, subVal]) => (
                                      <div key={subKey}>
                                        <span className="font-medium text-foreground">{subKey.replace(/_/g, ' ')}:</span>
                                        {Array.isArray(subVal) ? (
                                          <ul className="list-disc list-inside ml-2 mt-0.5">
                                            {(subVal as string[]).map((sv, si) => <li key={si}>{sv}</li>)}
                                          </ul>
                                        ) : (
                                          <span className="ml-1">{String(subVal)}</span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            </details>
                          )
                        })}
                      </div>
                    )}

                    {/* Risks & Ethics */}
                    {(plan.risks_constraints_ethics ?? []).length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold mb-2">Risks, Constraints & Ethics</h4>
                        <div className="space-y-2">
                          {plan.risks_constraints_ethics!.map((r, i) => (
                            <div key={i} className="border rounded p-3 text-sm flex items-start gap-3">
                              <span className={`px-1.5 py-0.5 rounded text-xs font-medium shrink-0 mt-0.5 ${
                                r.impact === 'high' ? 'bg-red-100 text-red-800' :
                                r.impact === 'medium' ? 'bg-amber-100 text-amber-800' :
                                'bg-green-100 text-green-800'
                              }`}>
                                {r.impact}
                              </span>
                              <div>
                                <p className="font-medium text-xs">{r.risk}</p>
                                {r.mitigation && (
                                  <p className="text-xs text-muted-foreground mt-0.5">Mitigation: {r.mitigation}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Next Actions */}
                    {(plan.next_actions ?? []).length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold mb-2">Next Actions</h4>
                        <ol className="space-y-1.5">
                          {plan.next_actions!.map((action, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm">
                              <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                                {i + 1}
                              </span>
                              <span className="text-muted-foreground">{action}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}

                    <p className="text-xs text-muted-foreground">Version: v{planArt.version}</p>
                  </div>
                )
              })()}
            </>
          )}
        </CardContent>
      </Card>

      {/* Phase 2 Complete banner */}
      {run.step === 'phase2_plan' && run.status === 'completed' && (() => {
        const planArt = artifacts.find((a) => a.step_name === 'phase2_research_plan_pack')
        const plan = planArt?.content as {
          methodology_steps?: unknown[]
          risks_constraints_ethics?: unknown[]
          next_actions?: unknown[]
        } | undefined
        const srcArt = artifacts.find((a) => a.step_name === 'phase2_sources_pack')
        const src = srcArt?.content as {
          papers?: unknown[]
          datasets?: unknown[]
          tools?: unknown[]
          knowledge_bases?: unknown[]
        } | undefined
        const methodSteps = plan?.methodology_steps?.length ?? 0
        const totalResources = (src?.papers?.length ?? 0) + (src?.datasets?.length ?? 0) + (src?.tools?.length ?? 0) + (src?.knowledge_bases?.length ?? 0)
        const riskCount = plan?.risks_constraints_ethics?.length ?? 0

        return (
          <div className="bg-green-50 border border-green-300 rounded-lg p-4 flex items-center gap-3">
            <span className="text-green-700 text-lg">&#10003;</span>
            <div>
              <p className="text-green-800 font-semibold">Phase 2 Complete — Research Plan Pack Ready</p>
              <p className="text-green-700 text-sm">
                {methodSteps} methodology steps &middot; {totalResources} resources found &middot; {riskCount} risks identified
              </p>
            </div>
          </div>
        )
      })()}
    </>
  )
}
