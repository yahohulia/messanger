import { db } from '~/server/utils/db'
import { user } from '@messanger/db'
import { eq, and, ne } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  if (!event.context.user) throw createError({ statusCode: 401, message: 'Unauthorized' })

  const { name, email } = await readBody<{ name?: string; email?: string }>(event)
  const userId = event.context.user.id as string
  const updates: Partial<typeof user.$inferInsert> = {}

  if (name?.trim()) updates.name = name.trim()

  if (email?.trim()) {
    const existing = await db.select({ id: user.id }).from(user)
      .where(and(eq(user.email, email.trim()), ne(user.id, userId)))
    if (existing.length > 0) throw createError({ statusCode: 409, message: 'Email already in use' })
    updates.email = email.trim()
  }

  if (Object.keys(updates).length === 0) throw createError({ statusCode: 400, message: 'Nothing to update' })

  await db.update(user).set(updates).where(eq(user.id, userId))

  return { ok: true, ...updates }
})
