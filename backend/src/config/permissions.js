const grants = {
  SALES: 'leads:read/write surveys:read/schedule catalog:read quotes:read/create/send/accept orders:read/create payments:read',
  SURVEYOR: 'surveys:read/record attachments:upload leads:read',
  WAREHOUSE: 'inventory:read/write catalog:read orders:read dispatch:prepare/allocate/complete/deliver warranties:read',
  TECHNICIAN: 'installations:read/complete_assigned attachments:upload tickets:read/manage warranties:read',
  SUPPORT: 'attachments:upload tickets:create/read/manage/resolve/confirm warranties:read orders:read inventory:read',
  FINANCE: 'attachments:upload orders:read payments:read/record invoices:read/manage subsidies:read/manage reports:view/financial/export',
}

function expand(specification) {
  return specification.split(' ').flatMap(entry => {
    const [resource, actions] = entry.split(':')
    return actions.split('/').map(action => resource + ':' + action)
  })
}

const operations = expand('surveys:approve catalog:manage installations:manage audit:read')
const staffGrants = Object.fromEntries(Object.entries(grants).map(([role, spec]) => [role, expand(spec)]))
const capabilities = [...new Set([...Object.values(staffGrants).flat(), ...operations, 'users:manage'])]
export const roleCapabilities = Object.freeze({
  ...staffGrants,
  ADMIN: capabilities,
  DIRECTOR: capabilities.filter(capability => capability.endsWith(':read') || capability.startsWith('reports:') ||
    ['surveys:approve', 'quotes:accept'].includes(capability)),
})
