import { db } from '~/server/utils/db'
import { user, archivedMessage, hiddenContact } from '@messanger/db'
import { eq, or, asc, inArray, notInArray } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  if (!event.context.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const myId = event.context.user.id

  // Get IDs of users we've exchanged messages with
  const sentTo = await db
    .selectDistinct({ id: archivedMessage.receiverId })
    .from(archivedMessage)
    .where(eq(archivedMessage.senderId, myId))

  const receivedFrom = await db
    .selectDistinct({ id: archivedMessage.senderId })
    .from(archivedMessage)
    .where(eq(archivedMessage.receiverId, myId))

  const allContactIds = [...new Set([...sentTo.map((r) => r.id), ...receivedFrom.map((r) => r.id)])]

  const hidden = await db
    .select({ id: hiddenContact.contactId })
    .from(hiddenContact)
    .where(eq(hiddenContact.userId, myId))
  const hiddenIds = hidden.map((h) => h.id)

  const contactIds = allContactIds.filter((id) => !hiddenIds.includes(id))

  const contacts =
    contactIds.length > 0
      ? await db
          .select({ id: user.id, name: user.name, username: user.username, image: user.image })
          .from(user)
          .where(inArray(user.id, contactIds))
      : []

  const initialMessages =
    contactIds.length > 0
      ? await db
          .select()
          .from(archivedMessage)
          .where(or(eq(archivedMessage.senderId, myId), eq(archivedMessage.receiverId, myId)))
          .orderBy(asc(archivedMessage.sentAt))
      : []

  return {
    user: event.context.user,
    session: event.context.session,
    contacts,
    initialMessages
  }
})
