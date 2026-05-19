import { auth } from '~/server/utils/auth'
import { getRequestHeaders } from 'h3'

export default defineEventHandler(async (event) => {
  const headers = new Headers(getRequestHeaders(event) as HeadersInit)
  const session = await auth.api.getSession({ headers })
  event.context.user = session?.user ?? null
  event.context.session = session?.session ?? null
})
