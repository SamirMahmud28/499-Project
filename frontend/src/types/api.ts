export interface Project {
  id: string
  name: string
  description: string | null
  created_at: string
  updated_at: string
}

export interface Run {
  id: string
  project_id: string
  phase: string
  step: string
  status: string
  run_number: number
  created_at: string
  updated_at: string
}

export interface Artifact {
  id: string
  run_id: string
  step_name: string
  version: number
  content: Record<string, unknown>
  created_at: string
}

export interface AgentLog {
  id: string
  run_id: string
  agent_name: string
  event_type: string
  payload: Record<string, unknown>
  created_at: string
}

export interface Phase2Constraints {
  metadata: { created_at: string; user_level: string }
  time_budget: string
  data_availability: string
  resources: {
    lab_access: boolean
    participants_access: boolean
    software_tools: string[]
  }
  notes: string
}

export interface ApproachRecommendation {
  metadata: { model: string; created_at: string }
  refined_problem_statement: string
  refined_research_questions: string[]
  suggested_titles: string[]
  recommended: {
    approach: string
    why_fit: string[]
    effort_level: 'low' | 'medium' | 'high'
    what_user_must_provide: string[]
  }
  alternatives: Array<{
    approach: string
    why: string[]
    tradeoffs: string[]
  }>
}

export interface SelectedApproach {
  metadata: { selected_at: string }
  selected_approach: string
  selected_title: string
  user_overrides: { notes: string }
  source_recommendation_version: number
}

export interface SourcesPack {
  metadata: {
    created_at: string
    search_keywords: string[]
    source_providers: string[]
  }
  papers: Array<{
    title: string
    authors: string[]
    year: number
    venue: string
    doi?: string
    url?: string
    pdf_url?: string
    why_relevant: string
    credibility_notes: string
    source?: string
  }>
  datasets: Array<{
    name: string
    domain: string
    license?: string
    url?: string
    why_relevant: string
    notes?: string
  }>
  tools: Array<{
    name: string
    type: string
    url?: string
    why_useful: string
    notes?: string
  }>
  knowledge_bases: Array<{
    name: string
    url?: string
    why_useful: string
    source?: string
  }>
}

export interface EvidencePlan {
  metadata: { created_at: string }
  evidence_type: 'primary' | 'secondary'
  collection_strategy: string[]
  inclusion_exclusion: {
    include: string[]
    exclude: string[]
  }
  analysis_overview: string
  expected_outputs: string[]
}
