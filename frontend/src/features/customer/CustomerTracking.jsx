import { Link, useSearchParams } from 'react-router-dom'
import { StatusBadge } from '../../components/ui/Badge.jsx'
import { ProjectTimeline } from '../../components/ui/ProjectTimeline.jsx'
import { displayReference, formatDateTime } from '../../lib/format.js'

export function CustomerTracking({ projects, refresh }) {
  const [params, setParams] = useSearchParams()
  const project = projects.find(row => row.id === params.get('project')) ?? projects[0]

  return (
    <div className="grid gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Project tracking</h1>
        <button className="secondary" type="button" onClick={refresh}>Refresh tracking</button>
      </header>
      {project ? <>
        <section className="grid min-w-0 gap-4 rounded-2xl border border-gray-200 bg-white p-5">
          {projects.length > 1 && <label className="grid min-w-0 max-w-xl gap-1 text-sm font-medium">
            Select project
            <select className="w-full min-w-0 rounded-lg border border-gray-300 bg-white px-3 py-2" value={project.id}
              onChange={event => setParams({ project: event.target.value })}>
              {projects.map(row => <option key={row.id} value={row.id}>
                {displayReference(row.orderNumber ?? row.reference)}{row.address ? ' · ' + row.address : ''}
              </option>)}
            </select>
          </label>}
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="min-w-0 break-all text-lg font-semibold">{displayReference(project.orderNumber ?? project.reference)}</h2>
            <StatusBadge status={project.status === 'NEW' ? 'ENQUIRY_RECEIVED' : project.status} />
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="min-w-0"><dt className="font-medium">Enquiry reference</dt><dd className="break-all">{displayReference(project.reference)}</dd></div>
            {project.address && <div><dt className="font-medium">Installation address</dt><dd className="break-words">{project.address}</dd></div>}
            {project.surveyAppointment && <div><dt className="font-medium">Survey appointment</dt>
              <dd>{formatDateTime(project.surveyAppointment)}</dd></div>}
            {project.installationAppointment && <div><dt className="font-medium">Installation appointment</dt>
              <dd>{formatDateTime(project.installationAppointment)}</dd></div>}
          </dl>
        </section>
        <ProjectTimeline title="Project timeline" timeline={project.timeline} cancelled={['CANCELLED', 'LOST'].includes(project.status)} />
      </> : <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <p className="mb-4 text-gray-600">Your project will appear here after you request a quote.</p>
        <Link className="primary" to="/customer/quotations/new">Request a quote</Link>
      </div>}
    </div>
  )
}
