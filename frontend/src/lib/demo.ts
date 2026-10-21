/** Set at build time for the public demo deployment (see DEPLOY.md). */
export const DEMO = import.meta.env.VITE_DEMO === '1'
export const DEMO_EMAIL = import.meta.env.VITE_DEMO_EMAIL ?? ''
export const DEMO_PASSWORD = import.meta.env.VITE_DEMO_PASSWORD ?? ''
