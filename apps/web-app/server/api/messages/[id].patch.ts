import { db } from '~/server/utils/db'
import { archivedMessage } from '@messanger/db'
import { and, eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  if (!event.context.user) throw createError({ statusCode: 401, message: 'Unauthorized' })

  const id = getRouterParam(event, 'id')!
  const { content } = await readBody<{ content: string }>(event)
  const trimmed = content?.trim()

  if (!trimmed) throw createError({ statusCode: 400, message: 'Content is required' })

  const userId = event.context.user.id as string

  await db.update(archivedMessage)
    .set({ content: trimmed, editedAt: new Date() })
    .where(and(eq(archivedMessage.id, id), eq(archivedMessage.senderId, userId)))

  return { ok: true, content: trimmed, editedAt: new Date() }
})
