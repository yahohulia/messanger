export default defineNuxtRouteMiddleware((to) => {
  const authData = useState('auth-data')
  const user = authData.value?.user

  if (!user && to.path !== '/login') {
    return navigateTo('/login')
  }
  if (user && to.path === '/login') {
    return navigateTo('/')
  }
})
