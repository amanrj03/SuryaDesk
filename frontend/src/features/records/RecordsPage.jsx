import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '../../components/ui/PageHeader.jsx'
import { TableSkeleton } from '../../components/ui/States.jsx'
import { words } from '../../lib/format.js'
import LeadEditor from '../enquiries/LeadEditor.jsx'
import InstallationSignoff from '../installations/InstallationSignoff.jsx'
import PackageEditor from '../catalog/PackageEditor.jsx'
import RecordDetail, { hasDetail } from './RecordDetail.jsx'
import WorkflowAction, { collectionActions, recordActions } from './WorkflowAction.jsx'
import { Notice } from '../../components/ui/Notice.jsx'
import { api } from '../../lib/api.js'

const statuses = {
  leads: 'NEW CONTACTED QUALIFIED SURVEY_SCHEDULED SURVEY_PENDING_APPROVAL SURVEY_APPROVED QUOTED WON LOST',
  surveys: 'SCHEDULED IN_PROGRESS SUBMITTED APPROVED REJECTED',
  quotes: 'DRAFT SENT ACCEPTED REJECTED EXPIRED',
  orders: 'CONFIRMED AWAITING_STOCK READY_TO_DISPATCH DISPATCHED DELIVERED INSTALLATION_IN_PROGRESS COMPLETED CANCELLED',
  assets: 'IN_STOCK RESERVED DISPATCHED DELIVERED INSTALLED UNDER_REPAIR REPLACED',
  dispatches: 'DRAFT ALLOCATED DISPATCHED DELIVERED CANCELLED',
  warranties: 'ACTIVE EXPIRED VOID REPLACED',
  installations: 'UNSCHEDULED SCHEDULED IN_PROGRESS PENDING_SIGNOFF COMPLETED',
  tickets: 'OPEN TRIAGED ASSIGNED IN_PROGRESS RESOLVED_PENDING_CONFIRMATION CLOSED',
  invoices: 'DRAFT ISSUED PARTIALLY_PAID PAID VOID',
  subsidies: 'NOT_STARTED DOCUMENTS_PENDING SUBMITTED APPROVED REJECTED PAID',
  purchases: 'DRAFT ORDERED PARTIALLY_RECEIVED RECEIVED CANCELLED',
}

export default function Records({ section, token, capabilities }) {
  const [page, setPage] = useState(1)
  const [searchParams, setSearchParams] = useSearchParams()
  const search = section.search ? (searchParams.get('q') ?? '').slice(0, 120) : ''
  const [query, setQuery] = useState(search)
  const [status, setStatus] = useState('')
  const choices = statuses[section.path]?.split(' ')
  const [retry, setRetry] = useState(0)
  const [state, setState] = useState({ busy: true })
  const [selected, setSelected] = useState(null)
  const canEditLead = section.path === 'leads' && capabilities.includes('leads:write')
  const canSign =
    section.path === 'installations' && capabilities.includes('installations:complete_assigned')
  const [action, setAction] = useState(null)
  const [detail, setDetail] = useState(null)
  const [packageEdit, setPackageEdit] = useState(null)
  const managePackages = section.path === 'packages' && capabilities.includes('catalog:manage')
  const hasActions =
    hasDetail(section.path) ||
    canEditLead ||
    canSign ||
    managePackages ||
    state.result?.data.some((row) => recordActions(section.path, row, capabilities).length)
  const Editor = canEditLead ? LeadEditor : InstallationSignoff

  useEffect(() => {
    setQuery(search)
    setPage(1)
    setState({ busy: true })
  }, [search])

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ page: String(page), limit: '20' })
    if (search) params.set('q', search)
    if (status) params.set('status', status)
    api('/' + section.path + '?' + params, { token, signal: controller.signal })
      .then((result) => setState({ result }))
      .catch((error) => {
        if (!controller.signal.aborted) setState({ error: error.message })
      })
    return () => controller.abort()
  }, [section.path, token, page, search, status, retry])

  function refresh() {
    setSelected(null)
    setAction(null)
    setDetail(null)
    setPackageEdit(null)
    setState({ busy: true })
    setRetry((value) => value + 1)
  }

  function go(nextPage) {
    setState({ busy: true })
    setPage(nextPage)
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={section.title}
        subtitle={
          state.result
            ? `${state.result.meta.total} ${state.result.meta.total === 1 ? 'record' : 'records'}`
            : undefined
        }
      />

      <div className="records">
        {managePackages && (
          <div className="toolbar mb-2">
            <button
              type="button"
              className="primary"
              onClick={() => {
                setDetail(null)
                setPackageEdit({})
              }}
            >
              Add package
            </button>
          </div>
        )}

        {packageEdit && (
          <PackageEditor
            key={packageEdit.id ?? 'new'}
            id={packageEdit.id}
            token={token}
            onSaved={refresh}
            onClose={() => setPackageEdit(null)}
          />
        )}

        {collectionActions(section.path, capabilities).map((candidate) => (
          <div className="toolbar mb-2" key={candidate.key}>
            <button
              type="button"
              className="primary"
              onClick={() => {
                setDetail(null)
                setSelected(null)
                setAction(candidate)
              }}
            >
              {candidate.label}
            </button>
          </div>
        ))}

        {detail && (
          <RecordDetail
            key={detail}
            id={detail}
            section={section.path}
            token={token}
            onClose={() => setDetail(null)}
          />
        )}

        {selected && (
          <Editor
            key={selected.id}
            lead={selected}
            job={selected}
            token={token}
            onClose={() => setSelected(null)}
            onSaved={refresh}
          />
        )}

        {action && (
          <WorkflowAction
            key={action.path + action.key}
            action={action}
            token={token}
            onSaved={refresh}
            onClose={() => setAction(null)}
          />
        )}

        {/* Filter and Search Bar styled as Toolbar */}
        {(section.search || choices) && (
          <form
            className="toolbar mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-gray-100 bg-white/80 p-2 shadow-2xs backdrop-blur-xs"
            onSubmit={(event) => {
              event.preventDefault()
              setState({ busy: true })
              setSearchParams((current) => {
                const next = new URLSearchParams(current)
                const term = query.trim()
                if (term) next.set('q', term)
                else next.delete('q')
                return next
              })
              setPage(1)
              setRetry((value) => value + 1)
            }}
          >
            {section.search && (
              <input
                aria-label={'Search ' + section.title.toLowerCase()}
                placeholder="Search records…"
                maxLength={120}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="w-full max-w-xs rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-xs text-gray-800 placeholder-gray-400 focus:outline-hidden focus:ring-2 focus:ring-black/10"
              />
            )}
            {choices && (
              <select
                aria-label="Filter by status"
                className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-2xs focus:outline-hidden focus:ring-2 focus:ring-black/10"
                value={status}
                onChange={(event) => {
                  setPage(1)
                  setState({ busy: true })
                  setStatus(event.target.value)
                }}
              >
                <option value="">All statuses</option>
                {choices.map((value) => (
                  <option key={value} value={value}>
                    {words(value)}
                  </option>
                ))}
              </select>
            )}
            {section.search && (
              <button type="submit" className="secondary">
                Search
              </button>
            )}
          </form>
        )}

        {state.busy && <TableSkeleton rows={6} columns={section.columns.length + (hasActions ? 1 : 0)} />}

        {state.error && (
          <div className="feedback">
            <Notice>{state.error}</Notice>
            <button
              type="button"
              className="secondary mt-2"
              onClick={() => {
                setState({ busy: true })
                setRetry((value) => value + 1)
              }}
            >
              Try again
            </button>
          </div>
        )}

        {state.result &&
          (!state.result.data.length ? (
            <p className="feedback">No {section.title.toLowerCase()} found.</p>
          ) : (
            <div className="rounded-2xl border border-gray-100 bg-white shadow-2xs overflow-hidden">
              <div className="overflow-x-auto scrollbar-thin">
                <table>
                  <thead>
                    <tr>
                      {section.columns.map(([label]) => (
                        <th key={label}>{label}</th>
                      ))}
                      {hasActions && <th scope="col">Action</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {state.result.data.map((row) => (
                      <tr key={row.id}>
                        {section.columns.map(([label, value]) => (
                          <td key={label}>{value(row)}</td>
                        ))}
                        {hasActions && (
                          <td>
                            {hasDetail(section.path) && (
                              <button
                                type="button"
                                className="secondary mb-1 mr-1"
                                onClick={() => {
                                  setPackageEdit(null)
                                  setAction(null)
                                  setSelected(null)
                                  setDetail(section.path === 'assets' ? row.serialNumber : row.id)
                                }}
                              >
                                View
                              </button>
                            )}
                            {managePackages && (
                              <button
                                type="button"
                                className="secondary mb-1 mr-1"
                                onClick={() => {
                                  setDetail(null)
                                  setPackageEdit({ id: row.id })
                                }}
                              >
                                Edit package
                              </button>
                            )}
                            {(canEditLead ||
                              (canSign &&
                                row.status !== 'COMPLETED' &&
                                ['DELIVERED', 'INSTALLATION_IN_PROGRESS'].includes(row.order?.status) &&
                                row.installationAssignmentsByInstallation?.length > 0)) && (
                                <button
                                  type="button"
                                  className="secondary mb-1"
                                  onClick={() => {
                                    setDetail(null)
                                    setAction(null)
                                    setSelected(row)
                                  }}
                                >
                                  {canEditLead ? 'Edit' : 'Sign off'}
                                </button>
                              )}
                            {recordActions(section.path, row, capabilities).map((candidate) => (
                              <button
                                type="button"
                                className="secondary mb-1 ml-1"
                                key={candidate.key}
                                onClick={() => {
                                  setSelected(null)
                                  setAction(candidate)
                                }}
                              >
                                {candidate.label}
                              </button>
                            ))}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="pager">
                <button
                  type="button"
                  className="secondary"
                  disabled={page <= 1}
                  onClick={() => go(page - 1)}
                >
                  Previous
                </button>
                <span>
                  Page {page} of {state.result.meta.totalPages}
                </span>
                <button
                  type="button"
                  className="secondary"
                  disabled={page >= state.result.meta.totalPages}
                  onClick={() => go(page + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          ))}
      </div>
    </div>
  )
}
