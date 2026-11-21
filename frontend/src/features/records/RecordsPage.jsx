import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PageHeader } from '../../components/ui/PageHeader.jsx'
import { TableSkeleton } from '../../components/ui/States.jsx'
import { words } from '../../lib/format.js'
import LeadEditor from '../enquiries/LeadEditor.jsx'
import InstallationSignoff from '../installations/InstallationSignoff.jsx'
import { InvoiceDocument } from './InvoiceDocument.jsx'
import DispatchAllocation from '../dispatch/DispatchAllocation.jsx'
import PackageEditor from '../catalog/PackageEditor.jsx'
import { hasDetail } from './RecordDetail.jsx'
import WorkflowAction, { collectionActions, quotationAfterApproval, recordActions } from './WorkflowAction.jsx'
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
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedPage = Number(searchParams.get('page'))
  const page = Number.isInteger(requestedPage) && requestedPage >= 1 && requestedPage <= 100000
    ? requestedPage
    : 1
  const search = section.search ? (searchParams.get('q') ?? '').slice(0, 120) : ''
  const [query, setQuery] = useState(search)
  const choices = statuses[section.path]?.split(' ')
  const requestedStatus = searchParams.get('status')
  const status = choices?.includes(requestedStatus) ? requestedStatus : ''
  const [retry, setRetry] = useState(0)
  const [state, setState] = useState({ busy: true })
  const [panel, setPanel] = useState(null)
  const canEditLead = section.path === 'leads' && capabilities.includes('leads:write')
  const canSign =
    section.path === 'installations' && capabilities.includes('installations:complete_assigned')
  const managePackages = section.path === 'packages' && capabilities.includes('catalog:manage')
  const canView = hasDetail(section.path)
  const hasActions =
    canView ||
    canEditLead ||
    canSign ||
    managePackages ||
    state.result?.data.some((row) => recordActions(section.path, row, capabilities).length)

  useEffect(() => {
    setQuery(search)
  }, [search])

  useEffect(() => {
    const controller = new AbortController()
    setState({ busy: true })
    const params = new URLSearchParams({ page: String(page), limit: '20' })
    if (search) params.set('q', search)
    if (status) params.set('status', status)
    api('/' + section.path + '?' + params, { token, signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setState({ result })
      })
      .catch((error) => {
        if (!controller.signal.aborted) setState({ error: error.message })
      })
    return () => controller.abort()
  }, [section.path, token, page, search, status, retry])

  function closePanel() {
    setPanel(null)
  }

  function refresh() {
    closePanel()
    setState({ busy: true })
    setRetry((value) => value + 1)
  }

  function actionSaved(data) {
    const quote = section.path === 'surveys' ? quotationAfterApproval(panel.action, data, capabilities) : null
    refresh()
    if (quote) setPanel({ type: 'action', action: quote })
  }

  function go(nextPage) {
    updateListParams('page', nextPage === 1 ? '' : String(nextPage))
  }

  function updateListParams(name, value) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (name !== 'page') next.delete('page')
      if (value) next.set(name, value)
      else next.delete(name)
      return next
    })
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
              onClick={() => setPanel({ type: 'package' })}
            >
              Add package
            </button>
          </div>
        )}

        {collectionActions(section.path, capabilities).map((candidate) => (
          <div className="toolbar mb-2" key={candidate.key}>
            <button
              type="button"
              className="primary"
              onClick={() => setPanel({ type: 'action', action: candidate })}
            >
              {candidate.label}
            </button>
          </div>
        ))}

        {/* Filter and Search Bar styled as Toolbar */}
        {(section.search || choices) && (
          <form
            className="toolbar mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-gray-100 bg-white/80 p-2 shadow-2xs backdrop-blur-xs"
            onSubmit={(event) => {
              event.preventDefault()
              updateListParams('q', query.trim())
              setRetry((value) => value + 1)
            }}
          >
            {section.search && (
              <input
                aria-label={'Search ' + section.title.toLowerCase()}
                placeholder={section.searchPlaceholder ?? 'Search records…'}
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
                onChange={(event) => updateListParams('status', event.target.value)}
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
                            {canView && (
                              <Link
                                className="secondary mb-1 mr-1"
                                to={`/${section.path}/${encodeURIComponent(section.path === 'assets' ? row.serialNumber : row.id)}`}
                                state={{ fromRecordList: true }}
                              >
                                View
                              </Link>
                            )}
                            {section.path === 'quotes' && row.orderByQuotation && capabilities.includes('orders:read') && (
                              <Link className="secondary mb-1 mr-1" to={'/orders/' + encodeURIComponent(row.orderByQuotation.id)}>
                                View order
                              </Link>
                            )}
                            {section.path === 'dispatches' && row.status !== 'DRAFT' && (
                              <InvoiceDocument order={row.order} token={token} capabilities={capabilities} />
                            )}
                            {managePackages && (
                              <button
                                type="button"
                                className="secondary mb-1 mr-1"
                                onClick={() => setPanel({ type: 'package', id: row.id })}
                              >
                                Edit package
                              </button>
                            )}
                            {canEditLead && row.status === 'NEW' && (
                              <button type="button" className="secondary mb-1 mr-1"
                                onClick={() => setPanel({ type: 'lead', row, target: 'CONTACTED' })}>
                                Mark contacted
                              </button>
                            )}
                            {canEditLead && ['NEW', 'CONTACTED'].includes(row.status) && (
                              <button type="button" className="secondary mb-1 mr-1"
                                onClick={() => setPanel({ type: 'lead', row, target: 'QUALIFIED' })}>
                                Qualify enquiry
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
                                  onClick={() => setPanel({ type: canEditLead ? 'lead' : 'signoff', row })}
                                >
                                  {canEditLead ? 'Edit' : 'Sign off'}
                                </button>
                              )}
                            {recordActions(section.path, row, capabilities).map((candidate) => (
                              <button
                                type="button"
                                className="secondary mb-1 ml-1"
                                key={candidate.key}
                                onClick={() => setPanel({ type: 'action', action: candidate })}
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

      {panel?.type === 'package' && (
        <PackageEditor id={panel.id} token={token} onClose={closePanel} onSaved={refresh} />
      )}
      {panel?.type === 'lead' && (
        <LeadEditor lead={panel.row} target={panel.target} token={token} onClose={closePanel} onSaved={refresh} />
      )}
      {panel?.type === 'signoff' && (
        <InstallationSignoff job={panel.row} token={token} onClose={closePanel} onSaved={refresh} />
      )}
      {panel?.type === 'action' && (panel.action.key === 'allocate' ? (
        <DispatchAllocation dispatchId={panel.action.dispatchId} token={token} onClose={closePanel} onSaved={refresh} />
      ) : (
        <WorkflowAction key={panel.action.key} action={panel.action} token={token} onClose={closePanel} onSaved={actionSaved} />
      ))}
    </div>
  )
}
