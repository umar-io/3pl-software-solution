export type Role = 'admin' | 'operator' | 'merchant' | 'viewer'

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  operator: 'Warehouse operator',
  merchant: 'Merchant',
  viewer: 'Demo viewer',
}

export const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'operator', label: 'Warehouse operator' },
  { value: 'admin', label: 'Admin' },
  { value: 'merchant', label: 'Merchant (read-only)' },
]
