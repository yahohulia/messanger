<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const authClient = useAuthClient()
const mode = ref<'login' | 'register'>('login')
const email = ref('')
const password = ref('')
const name = ref('')
const username = ref('')
const error = ref('')
const loading = ref(false)

async function submit() {
  error.value = ''
  loading.value = true

  if (mode.value === 'login') {
    const { error: err } = await authClient.signIn.email({ email: email.value, password: password.value })
    loading.value = false
    if (err) { error.value = err.message; return }
  } else {
    const { error: err } = await authClient.signUp.email({
      email: email.value,
      password: password.value,
      name: name.value
    })
    loading.value = false
    if (err) { error.value = err.message; return }

    // Set username separately after sign-up
    if (username.value.trim()) {
      const { error: uErr } = await useFetch('/api/user/update-username', {
        method: 'POST',
        body: { username: username.value.trim() }
      })
      if (uErr.value) { error.value = uErr.value.data?.message ?? 'Could not set username'; return }
    }
  }

  const session = await $fetch('/api/session')
  useState('auth-data').value = session
  await navigateTo('/')
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-100">
    <div class="bg-white shadow-xl rounded-2xl p-8 w-full max-w-sm">
      <h1 class="text-2xl font-bold text-gray-900 mb-6 text-center">Messanger</h1>

      <!-- Toggle slider -->
      <div class="relative flex bg-gray-100 rounded-full p-1 mb-6">
        <div
          class="absolute top-1 bottom-1 w-[calc(50%-4px)] bg-white rounded-full shadow transition-transform duration-200 ease-in-out"
          :class="mode === 'register' ? 'translate-x-[calc(100%+8px)]' : 'translate-x-0'"
        />
        <button
          class="relative z-10 flex-1 py-2 text-sm font-semibold rounded-full transition-colors duration-200"
          :class="mode === 'login' ? 'text-gray-900' : 'text-gray-400'"
          @click="mode = 'login'"
        >Login</button>
        <button
          class="relative z-10 flex-1 py-2 text-sm font-semibold rounded-full transition-colors duration-200"
          :class="mode === 'register' ? 'text-gray-900' : 'text-gray-400'"
          @click="mode = 'register'"
        >Register</button>
      </div>

      <div class="flex flex-col gap-4">
        <label class="flex flex-col gap-1.5 text-sm font-medium text-gray-600">
          Email
          <input v-model="email" type="email" placeholder="you@example.com"
            class="rounded-xl border border-gray-200 px-4 py-2.5 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </label>

        <label class="flex flex-col gap-1.5 text-sm font-medium text-gray-600">
          Password
          <input v-model="password" type="password" placeholder="••••••••"
            class="rounded-xl border border-gray-200 px-4 py-2.5 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            @keydown.enter="submit" />
        </label>

        <template v-if="mode === 'register'">
          <label class="flex flex-col gap-1.5 text-sm font-medium text-gray-600">
            Display name
            <input v-model="name" type="text" placeholder="Your name"
              class="rounded-xl border border-gray-200 px-4 py-2.5 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </label>

          <label class="flex flex-col gap-1.5 text-sm font-medium text-gray-600">
            Username
            <input v-model="username" type="text" placeholder="e.g. john_doe"
              class="rounded-xl border border-gray-200 px-4 py-2.5 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              @keydown.enter="submit" />
            <span class="text-xs text-gray-400 font-normal">Others find you by username</span>
          </label>
        </template>

        <p v-if="error" class="text-red-500 text-sm">{{ error }}</p>

        <button :disabled="loading"
          class="w-full rounded-xl bg-blue-600 py-2.5 text-white font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors mt-1"
          @click="submit">
          {{ loading ? '...' : mode === 'login' ? 'Sign in' : 'Create account' }}
        </button>
      </div>
    </div>
  </div>
</template>
