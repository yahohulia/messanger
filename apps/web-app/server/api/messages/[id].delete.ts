import { db } from '~/server/utils/db'
import { archivedMessage } from '@messanger/db'
import { and, eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  if (!event.context.user) throw createError({ statusCode: 401, message: 'Unauthorized' })

  const id = getRouterParam(event, 'id')!
  const userId = event.context.user.id as string

  const result = await db.delete(archivedMessage).where(
    and(eq(archivedMessage.id, id), eq(archivedMessage.senderId, userId))
  )

  return { ok: true }
})
