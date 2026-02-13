import { Link, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import WizardStepper from '@/components/WizardStepper'

import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabaseClient'

export default function Home() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/auth/login')
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-start">
        <div className="text-center flex-1">
          <h1 className="text-4xl font-bold mb-2">ResearchGPT</h1>
          <p className="text-muted-foreground">Multi-agent research assistant</p>
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
          <CardTitle>Research Wizard</CardTitle>
        </CardHeader>
        <CardContent>
          <WizardStepper />
        </CardContent>
      </Card>

    </div>
  )
}
