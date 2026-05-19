import { betterAuth } from 'better-auth/minimal'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { db } from './db'
import * as schema from '@messanger/db'

export const auth = betterAuth({
  baseURL: process.env.NUXT_ORIGIN || 'http://localhost:3000',
  secret: process.env.NUXT_BETTER_AUTH_SECRET || 'dev-secret-change-in-production',
  database: drizzleAdapter(db, { provider: 'sqlite', schema }),
  emailAndPassword: { enabled: true }
})
