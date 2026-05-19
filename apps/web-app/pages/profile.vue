<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const authData = useState('auth-data')
const user = computed(() => authData.value?.user)
const authClient = useAuthClient()

async function signOut() {
  await authClient.signOut()
  useState('auth-data').value = { user: null, session: null }
  await navigateTo('/login')
}
</script>

<template>
  <div class="min-h-screen flex flex-col items-center justify-center gap-4">
    <h1 class="text-2xl font-semibold">Hi, {{ user?.name }}!</h1>
    <p class="text-gray-500">Your user ID is {{ user?.id }}.</p>
    <button
      class="rounded-lg bg-blue-600 px-4 py-2 text-white font-medium hover:bg-blue-700 transition-colors"
      @click="signOut"
    >
      Sign out
    </button>
  </div>
</template>
