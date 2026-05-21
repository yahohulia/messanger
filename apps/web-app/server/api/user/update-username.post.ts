import { db } from '~/server/utils/db'
import { user } from '@messanger/db'
import { eq, ne, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  if (!event.context.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const { username } = await readBody<{ username: string }>(event)
  const trimmed = username?.trim()

  if (!trimmed) throw createError({ statusCode: 400, message: 'Username is required' })
  if (!/^[a-zA-Z0-9_]{3,30}$/.test(trimmed)) {
    throw createError({ statusCode: 400, message: 'Username must be 3–30 chars: letters, numbers, underscore' })
  }

  // Check uniqueness
  const existing = await db.select({ id: user.id }).from(user)
    .where(and(eq(user.username, trimmed), ne(user.id, event.context.user.id as string)))

  if (existing.length > 0) throw createError({ statusCode: 409, message: 'Username already taken' })

  await db.update(user).set({ username: trimmed }).where(eq(user.id, event.context.user.id as string))

  return { username: trimmed }
})
