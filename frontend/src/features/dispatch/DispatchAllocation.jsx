import { useEffect, useState } from 'react'
import { RecordDialog } from '../../components/ui/RecordDialog.jsx'
import { Notice } from '../../components/ui/Notice.jsx'
import { api } from '../../lib/api.js'

async function serialOptions(productId, term, token, { signal, exact = false } = {}) {
  const query = new URLSearchParams({
    productId, status: 'IN_STOCK', unassigned: 'true', limit: '100',
    [exact ? 'serialNumber' : 'q']: term,
  })
  const { data, meta } = await api('/assets?' + query, { token, signal })
  return { serials: data.map(asset => asset.serialNumber), truncated: meta.total > data.length }
}

function SerialPicker({ item, selected, onSelect, token, revision, disabled }) {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState({})
  const [scanError, setScanError] = useState('')
  const [scanning, setScanning] = useState(false)
  const term = query.trim()
  const full = selected.length >= item.quantity

  useEffect(() => {
    if (full) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const options = await serialOptions(item.productId, term, token, { signal: controller.signal })
        if (!controller.signal.aborted) setResult({ term, revision, ...options })
      } catch (failure) {
        if (!controller.signal.aborted) setResult({ term, revision, error: failure.message })
      }
    }, term ? 200 : 0)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [full, item.productId, revision, term, token])

  const current = result.term === term && result.revision === revision ? result : null
  const options = current?.serials?.filter(serial => !selected.includes(serial)) ?? []

  function add(serial) {
    onSelect([...selected, serial])
    setQuery('')
    setScanError('')
  }

  async function scan(event) {
    if (event.key !== 'Enter') return
    event.preventDefault()
    if (!term || scanning || disabled || full) return
    setScanError('')
    const expected = term.toUpperCase()
    if (selected.includes(expected)) {
      setScanError('That serial is already selected.')
      return
    }
    setScanning(true)
    try {
      const { serials } = await serialOptions(item.productId, expected, token, { exact: true })
      if (serials.includes(expected)) add(expected)
      else setScanError('No available unit matches that serial for this product.')
    } catch (failure) {
      setScanError(failure.message)
    } finally {
      setScanning(false)
    }
  }

  return (
    <div className="grid gap-2">
      <p role="status" className="text-xs font-semibold text-gray-700">{selected.length} of {item.quantity} selected</p>
      {!full && (
        <fieldset disabled={disabled} className="grid min-w-0 gap-2 sm:grid-cols-2">
          <label>
            Search or scan serial
            <input
              type="search" value={query} maxLength={120} autoComplete="off" readOnly={scanning}
              onChange={event => { setQuery(event.target.value); setScanError('') }}
              onKeyDown={scan}
            />
          </label>
          <label>
            Available serials
            <select value="" disabled={!options.length || scanning} onChange={event => add(event.target.value)}>
              <option value="">
                {options.length ? 'Choose a serial' : current ? 'No matching serials' : 'Loading serials…'}
              </option>
              {options.map(serial => <option key={serial} value={serial}>{serial}</option>)}
            </select>
          </label>
        </fieldset>
      )}
      {current?.truncated && !full && <p className="text-xs text-gray-600">Search to narrow the available serials.</p>}
      <Notice>{scanError || (!full && current?.error)}</Notice>
      {selected.length > 0 && (
        <ul aria-label="Selected serials" className="flex flex-wrap gap-2">
          {selected.map(serial => (
            <li key={serial}>
              <button type="button" className="secondary" aria-label={'Remove ' + serial} disabled={disabled || scanning}
                onClick={() => onSelect(selected.filter(value => value !== serial))}>
                {serial} <span aria-hidden="true" className="ml-1">×</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function DispatchAllocation({ dispatchId, token, onClose, onSaved }) {
  const path = '/dispatches/' + encodeURIComponent(dispatchId)
  const [stock, setStock] = useState({})
  const [selected, setSelected] = useState({})
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    api(path + '/allocation-options', { token, signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setStock({ items: data, revision }) })
      .catch(failure => {
        if (!controller.signal.aborted) setStock({ error: failure.message, revision })
      })
    return () => controller.abort()
  }, [path, revision, token])

  const loading = stock.revision !== revision
  const canAllocate = !loading && !busy && stock.items?.every(item =>
    item.available >= item.quantity && (!item.serialized || selected[item.productId]?.length === item.quantity))

  async function allocate(event) {
    event.preventDefault()
    if (!canAllocate) return
    setBusy(true)
    setError('')
    try {
      const items = stock.items.map(({ productId, quantity }) => ({
        productId, quantity, serialNumbers: selected[productId] ?? [],
      }))
      await api(path + '/allocate', { token, method: 'POST', body: { items } })
      onSaved()
    } catch (failure) {
      setError(failure.message)
      setRevision(value => value + 1)
    } finally {
      setBusy(false)
    }
  }

  return (
    <RecordDialog title="Allocate stock" busy={busy} onClose={onClose}>
      <form className="form p-4" onSubmit={allocate}>
        <p className="text-sm text-gray-600">Choose or scan the serials for the units you’re packing. Quantity-tracked items are reserved automatically.</p>
        {loading && <p role="status">Checking available stock…</p>}
        <Notice>{error || (!loading && stock.error)}</Notice>
        {stock.items?.length === 0 && <p className="text-sm">This order has no materials to reserve.</p>}
        {stock.items?.map(item => (
          <section key={item.productId} aria-label={item.name} className="min-w-0 rounded-xl border border-gray-200 p-3">
            <h3 className="text-sm font-semibold">{item.name}</h3>
            <p className="mb-2 text-xs text-gray-600">Required: {item.quantity} · Available: {item.available}</p>
            {item.available < item.quantity && <p className="mb-2 text-xs font-semibold text-red-700">Short by {item.quantity - item.available}</p>}
            {item.serialized ? (
              <SerialPicker
                item={item} selected={selected[item.productId] ?? []} token={token} revision={revision}
                disabled={busy || loading}
                onSelect={serials => setSelected(current => ({ ...current, [item.productId]: serials }))}
              />
            ) : <p className="text-xs text-gray-600">Tracked by quantity</p>}
          </section>
        ))}
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="primary" disabled={!canAllocate}>{busy ? 'Allocating…' : 'Allocate stock'}</button>
          <button type="button" className="secondary" disabled={busy || loading} onClick={() => setRevision(value => value + 1)}>
            Refresh availability
          </button>
        </div>
      </form>
    </RecordDialog>
  )
}
