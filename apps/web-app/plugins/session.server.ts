export default defineNuxtPlugin(() => {
  const event = useRequestEvent()!
  const authData = useState('auth-data', () => ({
    user: event.context.user as Record<string, unknown> | null,
    session: event.context.session as Record<string, unknown> | null
  }))
  authData.value = {
    user: event.context.user ?? null,
    session: event.context.session ?? null
  }
})
