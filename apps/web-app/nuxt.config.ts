import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],
  vite: {
    plugins: [tailwindcss()]
  },
  runtimeConfig: {
    databaseUrl: '',
    betterAuthSecret: '',
    origin: ''
  }
})
