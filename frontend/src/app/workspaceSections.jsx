import { StatusBadge } from '../components/ui/Badge.jsx'
import { displayContactEmail, displayReference, displaySupplierName, words } from '../lib/format.js'
import { ClipboardDocumentCheckIcon, CubeIcon, DocumentTextIcon, InboxStackIcon, ShoppingBagIcon, CreditCardIcon, TruckIcon, ShieldCheckIcon, Squares2X2Icon, WrenchScrewdriverIcon } from '@heroicons/react/24/outline'

const date = (value) =>
  value
    ? new Intl.DateTimeFormat('en-IN', {
      dateStyle: 'medium',
      timeZone: 'Asia/Kolkata',
    }).format(new Date(value))
    : '—'

const currency = (value) =>
  value == null
    ? '—'
    : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(value))

export const sections = [
  {
    path: 'leads',
    title: 'Enquiries',
    capability: 'leads:read',
    icon: InboxStackIcon,
    search: true,
    columns: [
      ['Reference', (row) => displayReference(row.leadNumber)],
      ['Customer', (row) => row.customer.name],
      ['Phone', (row) => row.customer.phone],
      ['Source', (row) => words(row.source)],
      ['Subsidy interest', (row) => row.subsidyInterest ? 'Interested' : 'Not indicated'],
      ['Status', (row) => <StatusBadge status={row.status} />],
      ['Received', (row) => date(row.createdAt)],
    ],
  },
  {
    path: 'customers',
    title: 'Customers',
    capabilities: ['leads:write', 'tickets:create', 'reports:view', 'orders:create'],
    icon: InboxStackIcon,
    search: true,
    columns: [
      ['Customer', (row) => row.name],
      ['Phone', (row) => row.phone],
      ['Email', (row) => displayContactEmail(row.email)],
      ['Address', (row) => row.address],
    ],
  },
  {
    path: 'surveys',
    title: 'Surveys',
    capability: 'surveys:read',
    icon: ClipboardDocumentCheckIcon,
    search: true,
    searchPlaceholder: 'Search customer, phone, or surveyor…',
    columns: [
      ['Customer', (row) => row.lead.customer.name],
      ['Surveyor', (row) => row.surveyor?.name ?? '—'],
      ['Scheduled', (row) => date(row.scheduledAt)],
      ['Status', (row) => <StatusBadge status={row.status} />],
    ],
  },
  {
    path: 'packages',
    title: 'Packages',
    capability: 'catalog:read',
    icon: CubeIcon,
    search: true,
    columns: [
      ['Code', (row) => displayReference(row.code)],
      ['Package', (row) => row.name],
      ['System', (row) => words(row.type)],
      ['Capacity', (row) => (row.capacityKw ? row.capacityKw + ' kW' : '—')],
      ['Price', (row) => currency(row.basePrice)],
    ],
  },
  {
    path: 'products',
    title: 'Products',
    capability: 'catalog:read',
    icon: CubeIcon,
    search: true,
    columns: [
      ['SKU', (row) => displayReference(row.sku)],
      ['Product', (row) => row.name],
      ['Category', (row) => words(row.category)],
      ['Sale price', (row) => currency(row.salePrice)],
      ['Tax rate', (row) => row.taxRate == null ? 'Not set' : Number(row.taxRate) + '%'],
      ['Status', (row) => (row.isActive ? 'Active' : 'Inactive')],
    ],
  },
  {
    path: 'quotes',
    title: 'Quotations',
    capability: 'quotes:read',
    icon: DocumentTextIcon,
    search: true,
    columns: [
      ['Reference', (row) => displayReference(row.quoteNumber)],
      ['Customer', (row) => row.lead.customer.name],
      ['Total', (row) => currency(row.total)],
      ['Status', (row) => <StatusBadge status={row.status} />],
      ['Created', (row) => date(row.createdAt)],
    ],
  },
  {
    path: 'orders',
    title: 'Orders',
    capability: 'orders:read',
    icon: ShoppingBagIcon,
    search: true,
    searchPlaceholder: 'Order, quotation, or customer',
    columns: [
      ['Reference', (row) => (
        <>
          <span className="block break-all">{displayReference(row.orderNumber)}</span>
          {row.quotation && <span className="block text-xs text-gray-500">Quote {displayReference(row.quotation.quoteNumber)}</span>}
        </>
      )],
      ['Customer', (row) => row.customer.name],
      ['Total', (row) => currency(row.total)],
      ['Paid', (row) => currency(row.paidTotal)],
      ['Remaining', (row) => currency(row.status === 'CANCELLED' ? null : row.balance)],
      ['Status', (row) => <StatusBadge status={row.status} />],
      ['Confirmed', (row) => date(row.confirmedAt)],
    ],
  },
  {
    path: 'inventory',
    title: 'Inventory',
    capability: 'inventory:read',
    icon: Squares2X2Icon,
    search: true,
    columns: [
      ['SKU', (row) => displayReference(row.sku)],
      ['Product', (row) => row.name],
      ['In stock', (row) => row.onHand],
      ['Reserved', (row) => row.reserved],
      ['Available', (row) => row.available],
      ['Reorder', (row) => (row.lowStock ? 'Required' : '—')],
    ],
  },
  {
    path: 'assets',
    title: 'Equipment serials',
    capability: 'inventory:read',
    icon: CubeIcon,
    search: true,
    columns: [
      ['Serial', (row) => row.serialNumber],
      ['Product', (row) => row.product.name],
      ['Status', (row) => <StatusBadge status={row.status} />],
      ['Order', (row) => displayReference(row.order?.orderNumber)],
      ['Customer', (row) => row.customer?.name],
    ],
  },
  {
    path: 'dispatches',
    title: 'Dispatch',
    capability: 'dispatch:prepare',
    icon: TruckIcon,
    search: true,
    searchPlaceholder: 'Search dispatch, order, or customer…',
    columns: [
      ['Reference', (row) => (
        <span
          title={displayReference(row.dispatchNumber)}
          className="inline-block max-w-[200px] truncate font-mono text-[11px] font-semibold text-gray-800 bg-gray-50 border border-gray-200/80 px-2 py-0.5 rounded-md align-middle"
        >
          {displayReference(row.dispatchNumber)}
        </span>
      )],
      ['Customer', (row) => <span className="font-medium text-gray-900">{row.order.customer.name}</span>],
      ['Status', (row) => <StatusBadge status={row.status} />],
      ['Delivered', (row) => <span className="text-gray-500">{date(row.deliveredAt)}</span>],
    ],
  },
  {
    path: 'warranties',
    title: 'Warranties',
    capability: 'warranties:read',
    icon: ShieldCheckIcon,
    search: true,
    columns: [
      ['Serial', (row) => row.asset.serialNumber],
      ['Product', (row) => row.asset.product.name],
      ['Customer', (row) => row.customer.name],
      ['Status', (row) => <StatusBadge status={row.status} />],
      ['Expires', (row) => date(row.endAt)],
    ],
  },
  {
    path: 'installations',
    title: 'Installations',
    capability: 'installations:read',
    icon: WrenchScrewdriverIcon,
    search: true,
    searchPlaceholder: 'Search by order ID, customer, or phone',
    columns: [
      ['Order ID', (row) => displayReference(row.order.orderNumber)],
      ['Customer', (row) => row.order.customer.name],
      ['Capacity', (row) => row.capacityKw + ' kW'],
      ['Scheduled', (row) => date(row.scheduledAt)],
      ['Status', (row) => <StatusBadge status={row.status} />],
    ],
  },
  {
    path: 'tickets',
    title: 'Service tickets',
    capability: 'tickets:read',
    icon: ClipboardDocumentCheckIcon,
    search: true,
    columns: [
      ['Reference', (row) => displayReference(row.ticketNumber)],
      ['Customer', (row) => row.customer.name],
      ['Fault', (row) => row.faultCode || '—'],
      ['Priority', (row) => words(row.priority)],
      ['Status', (row) => <StatusBadge status={row.status === 'IN_PROGRESS' && row.repairReportedAt ? 'REPAIR_REPORTED' : row.status} />],
    ],
  },
  {
    path: 'invoices',
    title: 'Invoices',
    capability: 'invoices:read',
    icon: DocumentTextIcon,
    search: true,
    columns: [
      ['Reference', (row) => displayReference(row.invoiceNumber)],
      ['Customer', (row) => row.customer.name],
      ['Total', (row) => currency(row.total)],
      ['Status', (row) => <StatusBadge status={row.status} />],
      ['Issued', (row) => date(row.issuedAt)],
    ],
  },
  {
    path: 'subsidies',
    title: 'Subsidies',
    capability: 'subsidies:read',
    icon: ClipboardDocumentCheckIcon,
    columns: [
      ['Order', (row) => displayReference(row.order.orderNumber)],
      ['Customer', (row) => row.order.customer.name],
      ['Reference', (row) => displayReference(row.reference) || '—'],
      ['Status', (row) => <StatusBadge status={row.status} />],
    ],
  },
  {
    path: 'suppliers',
    title: 'Suppliers',
    capability: 'inventory:read',
    icon: CubeIcon,
    search: true,
    columns: [
      ['Code', (row) => displayReference(row.code)],
      ['Supplier', (row) => displaySupplierName(row)],
      ['Email', (row) => displayContactEmail(row.email)],
      ['Phone', (row) => row.phone],
    ],
  },
  {
    path: 'purchases',
    title: 'Purchase orders',
    capability: 'inventory:read',
    icon: TruckIcon,
    search: true,
    columns: [
      ['Reference', (row) => displayReference(row.purchaseNumber)],
      ['Supplier', (row) => displaySupplierName(row.supplier)],
      ['Expected', (row) => date(row.expectedAt)],
      ['Status', (row) => <StatusBadge status={row.status} />],
    ],
  },
  {
    path: 'users',
    title: 'Staff',
    capability: 'users:manage',
    icon: ClipboardDocumentCheckIcon,
    search: true,
    columns: [
      ['Name', (row) => row.name],
      ['Email', (row) => row.email],
      ['Role', (row) => words(row.role)],
      ['Account', (row) => (row.isActive ? 'Active' : 'Inactive')],
    ],
  },
  {
    path: 'payments',
    title: 'Payments',
    capability: 'payments:read',
    icon: CreditCardIcon,
    columns: [
      ['Reference', (row) => displayReference(row.reference) || '—'],
      ['Amount', (row) => currency(row.amount)],
      ['Method', (row) => words(row.method)],
      ['Received', (row) => date(row.receivedAt)],
    ],
  },
]
