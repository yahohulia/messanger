import { v2 as cloudinary } from 'cloudinary'
import { db } from '~/server/utils/db'
import { user } from '@messanger/db'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  if (!event.context.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const config = useRuntimeConfig()
  cloudinary.config({
    cloud_name: config.cloudinaryCloudName,
    api_key: config.cloudinaryApiKey,
    api_secret: config.cloudinaryApiSecret,
  })

  const { data } = await readBody<{ data: string }>(event)
  if (!data?.startsWith('data:image/')) {
    throw createError({ statusCode: 400, message: 'Invalid image data' })
  }

  const userId = event.context.user.id as string

  const result = await cloudinary.uploader.upload(data, {
    folder: 'messanger/avatars',
    public_id: userId,
    overwrite: true,
    transformation: [{ width: 256, height: 256, crop: 'fill', gravity: 'face' }],
  })

  await db.update(user).set({ image: result.secure_url }).where(eq(user.id, userId))

  return { url: result.secure_url }
})
