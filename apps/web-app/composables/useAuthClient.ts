import { createAuthClient } from 'better-auth/vue'

export const useAuthClient = () =>
  createAuthClient({ baseURL: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000' })
