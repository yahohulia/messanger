<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const authData = useState('auth-data')
const user = computed(() => authData.value?.user)
const authClient = useAuthClient()

// Profile (name + email)
const newName = ref(user.value?.name ?? '')
const newEmail = ref(user.value?.email ?? '')
const savingProfile = ref(false)
const savedProfile = ref(false)
const profileError = ref('')

async function updateProfile() {
  const name = newName.value.trim()
  const email = newEmail.value.trim()
  if (!name && !email) return
  savingProfile.value = true
  savedProfile.value = false
  profileError.value = ''
  try {
    await $fetch('/api/user/update-profile', { method: 'POST', body: { name, email } })
    authData.value = { ...authData.value, user: { ...user.value, name: name || user.value?.name, email: email || user.value?.email } }
    savedProfile.value = true
    setTimeout(() => { savedProfile.value = false }, 2000)
  } catch (e: any) {
    profileError.value = e?.data?.message ?? 'Failed to update'
  } finally {
    savingProfile.value = false
  }
}

// Username
const newUsername = ref((user.value as any)?.username ?? '')
const saving = ref(false)
const saved = ref(false)
const saveError = ref('')

const avatarUrl = ref<string | null>(user.value?.image ?? null)
const uploadingAvatar = ref(false)
const avatarError = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

function avatarLetter(name: unknown): string {
  return String(name ?? '?')[0].toUpperCase()
}

function onAvatarClick() {
  fileInput.value?.click()
}

async function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (!file.type.startsWith('image/')) { avatarError.value = 'Only image files are allowed'; return }
  if (file.size > 5 * 1024 * 1024) { avatarError.value = 'Image must be under 5 MB'; return }

  avatarError.value = ''
  uploadingAvatar.value = true

  try {
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })

    const { url } = await $fetch<{ url: string }>('/api/user/upload-avatar', {
      method: 'POST',
      body: { data },
    })

    avatarUrl.value = url
    authData.value = { ...authData.value, user: { ...user.value, image: url } }
  } catch {
    avatarError.value = 'Upload failed. Please try again.'
  } finally {
    uploadingAvatar.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}

async function updateUsername() {
  const trimmed = newUsername.value.trim()
  if (!trimmed || trimmed === (user.value as any)?.username) return
  saving.value = true
  saved.value = false
  saveError.value = ''
  try {
    const res = await $fetch('/api/user/update-username', {
      method: 'POST',
      body: { username: trimmed }
    }).catch((e) => { throw new Error(e?.data?.message ?? 'Failed to update') })
    authData.value = { ...authData.value, user: { ...user.value, username: trimmed } }
    saved.value = true
    setTimeout(() => { saved.value = false }, 2000)
  } catch (e: any) {
    saveError.value = e.message
  } finally {
    saving.value = false
  }
}

async function signOut() {
  await authClient.signOut()
  useState('auth-data').value = { user: null, session: null }
  await navigateTo('/login')
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-100">
    <div class="bg-white shadow-xl rounded-2xl p-8 w-full max-w-sm flex flex-col gap-6">

      <!-- Avatar -->
      <div class="flex flex-col items-center gap-2">
        <button
          class="relative group focus:outline-none"
          :disabled="uploadingAvatar"
          title="Change avatar"
          @click="onAvatarClick"
        >
          <!-- Image or letter avatar -->
          <img
            v-if="avatarUrl"
            :src="avatarUrl"
            alt="Avatar"
            class="h-20 w-20 rounded-full object-cover ring-2 ring-gray-200"
          />
          <div
            v-else
            class="h-20 w-20 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-3xl ring-2 ring-gray-200"
          >
            {{ avatarLetter(user?.name) }}
          </div>

          <!-- Hover overlay -->
          <div class="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <svg v-if="!uploadingAvatar" class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/>
            </svg>
            <svg v-else class="w-6 h-6 text-white animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
          </div>
        </button>

        <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onFileChange" />

        <p v-if="avatarError" class="text-red-500 text-xs text-center">{{ avatarError }}</p>
        <p v-else class="text-xs text-gray-400">Click avatar to change photo</p>

        <div class="text-center">
          <p class="font-semibold text-gray-900">{{ user?.name }}</p>
          <p class="text-sm text-gray-400">{{ user?.email }}</p>
        </div>
      </div>

      <!-- Change name & email -->
      <div class="flex flex-col gap-3">
        <h2 class="text-sm font-semibold text-gray-700">Profile info</h2>
        <label class="flex flex-col gap-1.5 text-sm text-gray-600">
          Display name
          <input v-model="newName" type="text" placeholder="Your name"
            class="rounded-xl border border-gray-200 px-4 py-2.5 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            @keydown.enter="updateProfile" />
        </label>
        <label class="flex flex-col gap-1.5 text-sm text-gray-600">
          Email
          <input v-model="newEmail" type="email" placeholder="you@example.com"
            class="rounded-xl border border-gray-200 px-4 py-2.5 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            @keydown.enter="updateProfile" />
        </label>
        <p v-if="profileError" class="text-red-500 text-sm">{{ profileError }}</p>
        <button
          :disabled="savingProfile || (newName.trim() === user?.name && newEmail.trim() === user?.email)"
          class="w-full rounded-xl py-2.5 text-sm font-semibold transition-colors disabled:opacity-50"
          :class="savedProfile ? 'bg-emerald-500 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'"
          @click="updateProfile"
        >{{ savedProfile ? '✓ Saved' : savingProfile ? 'Saving...' : 'Save profile' }}</button>
      </div>

      <div class="border-t border-gray-100" />

      <!-- Change username -->
      <div class="flex flex-col gap-3">
        <h2 class="text-sm font-semibold text-gray-700">Change username</h2>
        <label class="flex flex-col gap-1.5 text-sm text-gray-600">
          Username
          <input
            v-model="newUsername"
            type="text"
            placeholder="New username"
            class="rounded-xl border border-gray-200 px-4 py-2.5 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            @keydown.enter="updateUsername"
          />
          <span class="text-xs text-gray-400">This is how others find you in search</span>
        </label>

        <p v-if="saveError" class="text-red-500 text-sm">{{ saveError }}</p>

        <button
          :disabled="saving || !newUsername.trim() || newUsername.trim() === (user as any)?.username"
          class="w-full rounded-xl py-2.5 text-sm font-semibold transition-colors disabled:opacity-50"
          :class="saved ? 'bg-emerald-500 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'"
          @click="updateUsername"
        >
          {{ saved ? '✓ Saved' : saving ? 'Saving...' : 'Save username' }}
        </button>
      </div>

      <div class="border-t border-gray-100" />

      <!-- Actions -->
      <div class="flex flex-col gap-2">
        <NuxtLink
          to="/"
          class="w-full rounded-xl py-2.5 text-sm font-semibold text-center text-gray-700 hover:bg-gray-100 transition-colors"
        >
          ← Back to chats
        </NuxtLink>
        <button
          class="w-full rounded-xl py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors"
          @click="signOut"
        >
          Sign out
        </button>
      </div>

    </div>
  </div>
</template>
