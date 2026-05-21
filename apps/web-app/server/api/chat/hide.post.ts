import { db } from '~/server/utils/db'
import { hiddenContact } from '@messanger/db'

export default defineEventHandler(async (event) => {
  if (!event.context.user) throw createError({ statusCode: 401, message: 'Unauthorized' })

  const { contactId } = await readBody<{ contactId: string }>(event)
  if (!contactId) throw createError({ statusCode: 400, message: 'contactId is required' })

  await db.insert(hiddenContact)
    .values({ userId: event.context.user.id as string, contactId })
    .onConflictDoNothing()

  return { ok: true }
})
