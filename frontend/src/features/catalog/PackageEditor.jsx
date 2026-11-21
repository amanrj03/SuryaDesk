import { useEffect, useState } from 'react'
import { api } from '../../lib/api.js'

const categories = [
  ['ON_GRID', 'On-grid system'], ['OFF_GRID', 'Off-grid system'],
  ['PANEL_SET', 'Panel set'], ['INSTALLATION', 'Installation'],
]

export default function PackageEditor({ id, token, onClose, onSaved }) {
  const [catalog, setCatalog] = useState(null)
  const [pack, setPack] = useState(null)
  const [components, setComponents] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    const options = { token, signal: controller.signal }
    Promise.all([api('/products?limit=100', options), id ? api('/packages/' + id, options) : null])
      .then(([products, details]) => {
        setCatalog(products.data)
        setPack(details?.data ?? {})
        setComponents(details?.data.packageComponentsByPackage.map(row => ({
          key: row.id, productId: row.productId, quantity: row.quantity,
        })) ?? [])
      })
      .catch(failure => { if (!controller.signal.aborted) setError(failure.message) })
    return () => controller.abort()
  }, [id, token])

  function update(component, fields) {
    setComponents(rows => rows.map(row => row.key === component.key ? { ...row, ...fields } : row))
  }

  async function save(event) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const capacityKw = fields.get('capacityKw')
    const body = {
      code: fields.get('code'), name: fields.get('name'), type: fields.get('type'), basePrice: fields.get('basePrice'),
      capacityKw: capacityKw === '' ? null : Number(capacityKw), isActive: fields.has('isActive'),
      description: fields.get('description'),
      components: components.map(({ productId, quantity }) => ({ productId, quantity: Number(quantity) })),
    }
    setBusy(true)
    setError('')
    try {
      await api(id ? '/packages/' + id : '/packages', { token, method: id ? 'PATCH' : 'POST', body })
      onSaved()
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  return <section className="lead-editor">
    <div className="toolbar items-center"><h2>{id ? 'Edit package' : 'Add solar package'}</h2>
      <button className="secondary ml-auto" disabled={busy} onClick={onClose}>Close</button>
    </div>
    {!pack && !error && <p className="feedback" role="status">Loading package options…</p>}
    {error && <p className="notice m-4" role="alert">{error}</p>}
    {pack && <form className="form p-4" onSubmit={save}>
      <div className="form-grid">
        <label>Package code<input name="code" defaultValue={pack.code} required maxLength={64} /></label>
        <label>Package name<input name="name" defaultValue={pack.name} required maxLength={120} /></label>
        <label>Type<select name="type" defaultValue={pack.type ?? 'ON_GRID'}>
          {categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <label>Capacity (kW)<input name="capacityKw" type="number" min={1} max={5} step=".01" defaultValue={pack.capacityKw ?? ''} /></label>
        <label>Package price (INR)<input name="basePrice" type="number" min={0} step=".01" defaultValue={pack.basePrice} required /></label>
        <label className="check"><input type="checkbox" name="isActive" defaultChecked={pack.isActive ?? true} />Active package</label>
      </div>
      <label>Description<textarea name="description" defaultValue={pack.description ?? ''} maxLength={2000} /></label>
      <fieldset className="grid gap-3">
        <legend className="mb-2 font-semibold">Bill of materials</legend>
        {components.map((component, index) => <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_6rem_auto]" key={component.key}>
          <label>Component {index + 1}<select value={component.productId} onChange={event => update(component, { productId: event.target.value })} required>
            <option value="">Choose product</option>
            {catalog.filter(item => (item.isActive || component.productId === item.id) &&
              (component.productId === item.id || !components.some(other => other.productId === item.id)))
              .map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select></label>
          <label>Quantity<input type="number" min={1} max={100000} value={component.quantity}
            onChange={event => update(component, { quantity: event.target.value })} required /></label>
          <button type="button" className="secondary sm:self-end" onClick={() => setComponents(rows => rows.filter(row => row.key !== component.key))}>Remove</button>
        </div>)}
        <button type="button" className="secondary w-fit" disabled={components.length >= 100}
          onClick={() => setComponents(rows => [...rows, { key: crypto.randomUUID(), productId: '', quantity: 1 }])}>Add component</button>
      </fieldset>
      <button className="primary w-fit" disabled={busy}>{busy ? 'Saving…' : 'Save package'}</button>
    </form>}
  </section>
}
