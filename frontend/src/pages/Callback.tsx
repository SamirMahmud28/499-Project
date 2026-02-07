import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

export default function Callback() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!loading && user) {
      // User is authenticated, redirect to home
      navigate('/', { replace: true })
    }
  }, [user, loading, navigate])

  return (
    <div className="container mx-auto p-6 flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="text-lg font-medium">Completing sign-in...</div>
        <div className="text-sm text-muted-foreground mt-2">
          Please wait while we verify your account.
        </div>
      </div>
    </div>
  )
}
