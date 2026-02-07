import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import WizardStepper from '@/components/WizardStepper'
import AgentLogsPanel from '@/components/AgentLogsPanel'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabaseClient'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL

export default function Home() {
  const { session, user } = useAuth()
  const navigate = useNavigate()
  const [meResult, setMeResult] = useState<string | null>(null)
  const [meLoading, setMeLoading] = useState(false)

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/auth/login')
  }

  const handleTestBackendAuth = async () => {
    setMeLoading(true)
    setMeResult(null)
    try {
      const res = await fetch(`${BACKEND_URL}/me`, {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      })
      const data = await res.json()
      setMeResult(JSON.stringify(data, null, 2))
    } catch (err: any) {
      setMeResult(`Error: ${err.message}`)
    } finally {
      setMeLoading(false)
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-start">
        <div className="text-center flex-1">
          <h1 className="text-4xl font-bold mb-2">ResearchGPT – Phase 1</h1>
          <p className="text-muted-foreground">Status: Frontend Running</p>
        </div>
        <div className="flex items-center gap-4">
          <Link to="/projects">
            <Button variant="outline" size="sm">Projects</Button>
          </Link>
          <div className="text-right">
            <div className="text-sm font-medium">{user?.email}</div>
            <div className="text-xs text-muted-foreground">Logged in</div>
          </div>
          <Button onClick={handleLogout} variant="outline" size="sm">
            Logout
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Backend Auth Test</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={handleTestBackendAuth} disabled={meLoading}>
            {meLoading ? 'Testing...' : 'Test Backend Auth'}
          </Button>
          {meResult && (
            <pre className="bg-muted p-3 rounded text-sm overflow-auto max-h-40">
              {meResult}
            </pre>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Research Wizard</CardTitle>
        </CardHeader>
        <CardContent>
          <WizardStepper />
        </CardContent>
      </Card>

      <AgentLogsPanel />
    </div>
  )
}
