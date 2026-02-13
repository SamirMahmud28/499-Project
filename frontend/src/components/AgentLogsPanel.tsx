import { useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Bot,
  Lightbulb,
  Scale,
  FileText,
  Settings,
  AlertTriangle,
  ArrowRight,
  Compass,
  Search,
  ClipboardList,
  BookOpen,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { AgentLog } from '@/types/api'

/* ── Agent identity system ──────────────────────────────────── */

interface AgentConfig {
  icon: LucideIcon
  color: string
  bgColor: string
  label: string
}

const AGENT_CONFIG: Record<string, AgentConfig> = {
  TopicProposer: {
    icon: Lightbulb,
    color: 'text-amber-600',
    bgColor: 'bg-amber-100',
    label: 'Topic Proposer',
  },
  TopicCritic: {
    icon: Scale,
    color: 'text-purple-600',
    bgColor: 'bg-purple-100',
    label: 'Topic Critic',
  },
  OutlineWriter: {
    icon: FileText,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
    label: 'Outline Writer',
  },
  Orchestrator: {
    icon: Settings,
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
    label: 'Orchestrator',
  },
  System: {
    icon: AlertTriangle,
    color: 'text-red-600',
    bgColor: 'bg-red-100',
    label: 'System',
  },
  ApproachRecommender: {
    icon: Compass,
    color: 'text-teal-600',
    bgColor: 'bg-teal-100',
    label: 'Approach Recommender',
  },
  SourceScout: {
    icon: Search,
    color: 'text-orange-600',
    bgColor: 'bg-orange-100',
    label: 'Source Scout',
  },
  EvidencePlanner: {
    icon: ClipboardList,
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-100',
    label: 'Evidence Planner',
  },
  MethodologyWriter: {
    icon: BookOpen,
    color: 'text-rose-600',
    bgColor: 'bg-rose-100',
    label: 'Methodology Writer',
  },
}

const DEFAULT_CONFIG: AgentConfig = {
  icon: Bot,
  color: 'text-gray-500',
  bgColor: 'bg-gray-100',
  label: 'Agent',
}

function getAgentConfig(name: string): AgentConfig {
  return AGENT_CONFIG[name] ?? { ...DEFAULT_CONFIG, label: name }
}

/* ── Event-type badge colours ───────────────────────────────── */

const EVENT_STYLES: Record<string, string> = {
  start: 'bg-green-100 text-green-700',
  complete: 'bg-green-100 text-green-700',
  thinking: 'bg-yellow-100 text-yellow-700',
  candidate: 'bg-blue-100 text-blue-700',
  evaluation: 'bg-purple-100 text-purple-700',
  recommendation: 'bg-emerald-100 text-emerald-700',
  section: 'bg-indigo-100 text-indigo-700',
  output: 'bg-sky-100 text-sky-700',
  error: 'bg-red-100 text-red-700',
  warning: 'bg-amber-100 text-amber-700',
  searching: 'bg-orange-100 text-orange-700',
  ranking: 'bg-indigo-100 text-indigo-700',
  templates: 'bg-pink-100 text-pink-700',
  risks: 'bg-amber-100 text-amber-700',
}

/* ── Helpers ────────────────────────────────────────────────── */

function extractMessage(log: AgentLog): string {
  if (typeof log.payload === 'object' && log.payload !== null) {
    return String(
      (log.payload as Record<string, unknown>).message ??
        JSON.stringify(log.payload),
    )
  }
  return String(log.payload)
}

const PRIMARY_AGENTS = new Set([
  'TopicProposer',
  'TopicCritic',
  'OutlineWriter',
  'ApproachRecommender',
  'SourceScout',
  'EvidencePlanner',
  'MethodologyWriter',
])

function detectHandoffs(logs: AgentLog[]): Set<number> {
  const handoffs = new Set<number>()
  for (let i = 1; i < logs.length; i++) {
    const prev = logs[i - 1]
    const curr = logs[i]
    if (
      prev.event_type === 'complete' &&
      curr.event_type === 'start' &&
      prev.agent_name !== curr.agent_name &&
      PRIMARY_AGENTS.has(prev.agent_name) &&
      PRIMARY_AGENTS.has(curr.agent_name)
    ) {
      handoffs.add(i)
    }
  }
  return handoffs
}

/* ── Sub-components ─────────────────────────────────────────── */

function HandoffIndicator({
  fromAgent,
  toAgent,
}: {
  fromAgent: string
  toAgent: string
}) {
  const from = getAgentConfig(fromAgent)
  const to = getAgentConfig(toAgent)
  const FromIcon = from.icon
  const ToIcon = to.icon

  return (
    <div className="flex items-center gap-2 py-2 px-3 my-1">
      <div className="flex-1 h-px bg-border" />
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <div
          className={`w-5 h-5 rounded-full flex items-center justify-center ${from.bgColor}`}
        >
          <FromIcon className={`h-2.5 w-2.5 ${from.color}`} />
        </div>
        <span className="font-medium">handoff</span>
        <ArrowRight className="h-3 w-3 text-muted-foreground" />
        <div
          className={`w-5 h-5 rounded-full flex items-center justify-center ${to.bgColor}`}
        >
          <ToIcon className={`h-2.5 w-2.5 ${to.color}`} />
        </div>
      </div>
      <div className="flex-1 h-px bg-border" />
    </div>
  )
}

function LogEntry({
  log,
  config,
  message,
}: {
  log: AgentLog
  config: AgentConfig
  message: string
}) {
  const IconComponent = config.icon
  const badgeClass =
    EVENT_STYLES[log.event_type] ?? 'bg-gray-100 text-gray-600'
  const isSystem = log.agent_name === 'System'

  return (
    <div
      className={`flex items-start gap-2.5 py-1.5 px-2 rounded-md transition-colors ${
        isSystem ? 'bg-red-50 border border-red-200' : 'hover:bg-muted/40'
      }`}
    >
      {/* Avatar */}
      <div
        className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${config.bgColor}`}
        title={config.label}
      >
        <IconComponent className={`h-3.5 w-3.5 ${config.color}`} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-semibold ${config.color}`}>
            {config.label}
          </span>
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${badgeClass}`}
          >
            {log.event_type}
          </span>
          <span className="text-[10px] text-muted-foreground ml-auto flex-shrink-0">
            {log.created_at
              ? new Date(log.created_at).toLocaleTimeString()
              : '--:--:--'}
          </span>
        </div>
        <p
          className={`text-xs mt-0.5 leading-relaxed ${
            isSystem ? 'text-red-700 font-medium' : 'text-foreground/80'
          } ${message.includes('\n') ? 'whitespace-pre-wrap font-mono' : ''}`}
        >
          {message}
        </p>
      </div>
    </div>
  )
}

/* ── Main component ─────────────────────────────────────────── */

interface AgentLogsPanelProps {
  logs: AgentLog[]
}

export default function AgentLogsPanel({ logs }: AgentLogsPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll within the panel (not the page) when new logs arrive
  useEffect(() => {
    const el = containerRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [logs])
  const activeAgents = [
    ...new Set(logs.map((l) => l.agent_name)),
  ].filter((a) => PRIMARY_AGENTS.has(a))

  const handoffs = detectHandoffs(logs)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-lg">Agent Logs (Live)</CardTitle>
          {activeAgents.length > 0 && (
            <div className="flex gap-1.5">
              {activeAgents.map((agent) => {
                const cfg = getAgentConfig(agent)
                const Icon = cfg.icon
                return (
                  <span
                    key={agent}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bgColor} ${cfg.color}`}
                  >
                    <Icon className="h-3 w-3" />
                    {cfg.label}
                  </span>
                )
              })}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div ref={containerRef} className="h-96 overflow-y-auto border rounded-lg bg-muted/20 p-3">
          {logs.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-muted-foreground text-sm">
                Waiting for agent activity...
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {logs.map((log, idx) => {
                const config = getAgentConfig(log.agent_name)
                const message = extractMessage(log)
                return (
                  <div key={log.id || idx}>
                    {handoffs.has(idx) && (
                      <HandoffIndicator
                        fromAgent={logs[idx - 1].agent_name}
                        toAgent={log.agent_name}
                      />
                    )}
                    <LogEntry log={log} config={config} message={message} />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
