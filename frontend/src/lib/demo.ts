/** Set at build time for the public demo deployment (see DEPLOY.md). */
export const DEMO = import.meta.env.VITE_DEMO === '1'
export const DEMO_EMAIL = import.meta.env.VITE_DEMO_EMAIL ?? ''
export const DEMO_PASSWORD = import.meta.env.VITE_DEMO_PASSWORD ?? ''

/**
 * Fully static build: no backend at all. Data comes from pre-generated JSON in
 * /demo-data and the browser applies the same filtering the API would.
 */
export const STATIC_DEMO = import.meta.env.VITE_STATIC_DEMO === '1'
