import { db } from '~/server/utils/db'
import { archivedMessage } from '@messanger/db'
import { and, eq, or } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  if (!event.context.user) throw createError({ statusCode: 401, message: 'Unauthorized' })

  const { contactId } = await readBody<{ contactId: string }>(event)
  if (!contactId) throw createError({ statusCode: 400, message: 'contactId is required' })

  const myId = event.context.user.id as string

  await db.delete(archivedMessage).where(
    or(
      and(eq(archivedMessage.senderId, myId), eq(archivedMessage.receiverId, contactId)),
      and(eq(archivedMessage.senderId, contactId), eq(archivedMessage.receiverId, myId))
    )
  )

  return { ok: true }
})
