export default defineEventHandler((event) => {
  return {
    user: event.context.user ?? null,
    session: event.context.session ?? null
  }
})
