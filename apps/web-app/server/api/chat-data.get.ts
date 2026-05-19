import { db } from '~/server/utils/db'
import { user, archivedMessage } from '@messanger/db'
import { ne, eq, or, asc } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  if (!event.context.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const myId = event.context.user.id

  const availableUsers = await db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(ne(user.id, myId))

  const initialMessages = await db
    .select()
    .from(archivedMessage)
    .where(or(eq(archivedMessage.senderId, myId), eq(archivedMessage.receiverId, myId)))
    .orderBy(asc(archivedMessage.sentAt))

  return {
    user: event.context.user,
    session: event.context.session,
    availableUsers,
    initialMessages
  }
})
