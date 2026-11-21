import { useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell.jsx'
import { Notice } from '../components/ui/Notice.jsx'
import { PageHeader } from '../components/ui/PageHeader.jsx'
import { api } from '../lib/api.js'
import Dashboard from '../features/dashboard/Dashboard.jsx'
import Records from '../features/records/RecordsPage.jsx'
import RecordDetail, { hasDetail } from '../features/records/RecordDetail.jsx'
import { sections } from './workspaceSections.jsx'

const workspaceAliases = [
  ['catalog/products', 'products'],
  ['catalog/packages', 'packages'],
  ['dispatch', 'dispatches'],
  ['support/tickets', 'tickets'],
  ['finance/invoices', 'invoices'],
  ['finance/payments', 'payments'],
  ['finance/subsidies', 'subsidies'],
  ['admin/users', 'users'],
]

function DetailPage({ section, token, capabilities }) {
  const { id } = useParams()
  const { state } = useLocation()
  const navigate = useNavigate()

  function goBack() {
    if (state?.fromRecordList) navigate(-1)
    else navigate('/' + section.path, { replace: true })
  }

  return (
    <div className="records">
      <RecordDetail
        key={section.path + '/' + id}
        id={id}
        section={section.path}
        token={token}
        capabilities={capabilities}
        backLabel={'Back to ' + section.title}
        onBack={goBack}
      />
    </div>
  )
}

export default function Workspace({ session, onLogout }) {
  const allowed = sections.filter((section) =>
    (section.capabilities ?? [section.capability]).some((capability) =>
      session.user.capabilities.includes(capability),
    ),
  )
  const hasReports = session.user.capabilities.includes('reports:view')
  const [error, setError] = useState('')

  async function logout() {
    try {
      await api('/auth/logout', { token: session.accessToken, method: 'POST' })
      onLogout()
    } catch (failure) {
      setError(failure.message)
    }
  }

  return (
    <AppShell session={session} sections={sections} onLogout={logout}>
      <Notice>{error}</Notice>
      <Routes>
        {hasReports && <Route path="overview" element={<Dashboard session={session} />} />}
        {hasReports &&
          ['dashboard', 'reports/operations', 'reports/profitability'].map((path) => (
            <Route key={path} path={path} element={<Navigate to="/overview" replace />} />
          ))}
        {workspaceAliases
          .filter(([, path]) => allowed.some((section) => section.path === path))
          .map(([alias, path]) => (
            <Route key={alias} path={alias} element={<Navigate to={'/' + path} replace />} />
          ))}
        {allowed
          .filter((section) => hasDetail(section.path))
          .map((section) => (
            <Route
              key={section.path + '/:id'}
              path={section.path + '/:id'}
              element={
                <DetailPage section={section} token={session.accessToken} capabilities={session.user.capabilities} />
              }
            />
          ))}
        {allowed.map((section) => (
          <Route
            key={section.path}
            path={section.path}
            element={
              <Records
                key={section.path}
                section={section}
                token={session.accessToken}
                capabilities={session.user.capabilities}
              />
            }
          />
        ))}
        <Route
          path="*"
          element={
            hasReports ? (
              <Navigate to="/overview" replace />
            ) : allowed.length ? (
              <Navigate to={'/' + allowed[0].path} replace />
            ) : (
              <PageHeader
                title="Workspace"
                subtitle="No pages are assigned to your role yet."
              />
            )
          }
        />
      </Routes>
    </AppShell>
  )
}
