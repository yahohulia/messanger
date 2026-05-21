import { db } from '~/server/utils/db'
import { user } from '@messanger/db'
import { ne, like, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  if (!event.context.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const { q } = getQuery(event) as { q?: string }
  const term = (q ?? '').trim()

  if (!term) return []

  return db
    .select({ id: user.id, name: user.name, username: user.username, image: user.image })
    .from(user)
    .where(and(ne(user.id, event.context.user.id), like(user.username, `%${term}%`)))
    .limit(10)
})
