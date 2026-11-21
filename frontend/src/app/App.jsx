import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Login from '../features/auth/LoginPage.jsx'
import Enquiry from '../features/enquiries/EnquiryPage.jsx'
import Workspace from './Workspace.jsx'
import LandingPage from '../features/public/LandingPage.jsx'
import TrackingPage from '../features/public/TrackingPage.jsx'

export default function App() {
  const [session, setSession] = useState(null)

  useEffect(() => {
    const expired = () => setSession(null)
    window.addEventListener('suryadesk:session-expired', expired)
    return () => window.removeEventListener('suryadesk:session-expired', expired)
  }, [])

  return (
    <Routes>
      <Route path="/" element={<LandingPage signedIn={Boolean(session)} />} />
      <Route path="/track" element={<TrackingPage />} />
      <Route path="/enquiry" element={<Enquiry />} />
      <Route path="/request-quote" element={<Navigate to="/enquiry" replace />} />
      <Route
        path="/login"
        element={session ? <Navigate to="/workspace" replace /> : <Login onLogin={setSession} />}
      />
      <Route
        path="*"
        element={
          session ? (
            <Workspace session={session} onLogout={() => setSession(null)} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
    </Routes>
  )
}
