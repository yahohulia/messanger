import { db } from '~/server/utils/db'
import { user } from '@messanger/db'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  if (!event.context.user) throw createError({ statusCode: 401, message: 'Unauthorized' })

  const id = getRouterParam(event, 'id')
  const result = await db
    .select({ id: user.id, name: user.name, username: user.username, image: user.image })
    .from(user)
    .where(eq(user.id, id!))
    .limit(1)

  return result[0] ?? null
})
