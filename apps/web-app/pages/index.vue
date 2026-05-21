<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

type MessageStatus = 'sent' | 'delivered' | 'read'

type Message = {
  id: string
  senderId: string
  receiverId: string
  content: string
  sentAt: string | Date
  status?: MessageStatus
}

const { data, error } = await useFetch('/api/chat-data')
if (error.value) await navigateTo('/login')

type Contact = { id: string; name: string; username?: string | null; image?: string | null }

const currentUser = computed(() => data.value?.user)

const ws = ref<WebSocket | null>(null)
const isConnected = ref(false)
const onlineUserIds = ref<Set<string>>(new Set())
const targetUserId = ref('')
const inputText = ref('')
const unreadCounts = ref<Record<string, number>>({})

// Contacts = users with existing message history; grows when new chat is opened via search
const contacts = ref<Contact[]>((data.value?.contacts ?? []) as Contact[])

function inferStatus(m: Record<string, unknown>): MessageStatus | undefined {
  if (!m.senderId || m.senderId !== currentUser.value?.id) return undefined
  if (m.readAt) return 'read'
  if (m.deliveredAt) return 'delivered'
  return 'sent'
}

const allMessages = ref<Message[]>(
  ((data.value?.initialMessages ?? []) as Record<string, unknown>[]).map((m) => ({
    ...(m as unknown as Message),
    status: inferStatus(m),
  }))
)
const chatContainer = ref<HTMLElement | null>(null)

const targetUser = computed(() => contacts.value.find((u) => u.id === targetUserId.value))
const targetIsOnline = computed(() => onlineUserIds.value.has(targetUserId.value))

// Sidebar: when search is empty show contacts; when typing show search results
const searchQuery = ref('')
const searchResults = ref<Contact[]>([])
const isSearching = ref(false)

const sidebarUsers = computed(() =>
  searchQuery.value.trim() ? searchResults.value : contacts.value
)

let searchTimeout: ReturnType<typeof setTimeout> | null = null

async function onSearchInput() {
  const q = searchQuery.value.trim()
  if (!q) { searchResults.value = []; return }
  if (searchTimeout) clearTimeout(searchTimeout)
  searchTimeout = setTimeout(async () => {
    isSearching.value = true
    try {
      searchResults.value = await $fetch<Contact[]>('/api/users/search', { query: { q } })
    } finally {
      isSearching.value = false
    }
  }, 300)
}

function selectUser(u: Contact) {
  // Add to contacts locally if not present (new chat opened via search)
  if (!contacts.value.find((c) => c.id === u.id)) {
    contacts.value = [...contacts.value, u]
  }
  targetUserId.value = u.id
  searchQuery.value = ''
  searchResults.value = []
}

const activeMessages = computed(() =>
  allMessages.value.filter(
    (m) =>
      (m.senderId === targetUserId.value && m.receiverId === currentUser.value?.id) ||
      (m.senderId === currentUser.value?.id && m.receiverId === targetUserId.value)
  )
)

function lastMessageFor(userId: string): string {
  const msgs = allMessages.value.filter(
    (m) =>
      (m.senderId === userId && m.receiverId === currentUser.value?.id) ||
      (m.senderId === currentUser.value?.id && m.receiverId === userId)
  )
  return msgs[msgs.length - 1]?.content ?? ''
}

function formatTime(sentAt: string | Date): string {
  return new Date(sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

onMounted(() => {
  const token = (data.value?.session as Record<string, unknown>)?.token as string | undefined
  if (token) connectWebSocket(token)
})

onUnmounted(() => ws.value?.close())

watch(targetUserId, (id) => {
  if (!id) return
  unreadCounts.value[id] = 0
  if (ws.value?.readyState === WebSocket.OPEN && isConnected.value) {
    ws.value.send(JSON.stringify({ type: 'read_receipt', withUserId: id }))
  }
})

watch(
  () => activeMessages.value.length,
  () => nextTick(() => setTimeout(() => {
    if (chatContainer.value) chatContainer.value.scrollTop = chatContainer.value.scrollHeight
  }, 10))
)

function connectWebSocket(token: string) {
  const { public: pub } = useRuntimeConfig()
  ws.value = new WebSocket((pub.wsUrl as string) || 'ws://localhost:8080')

  ws.value.onopen = () => ws.value?.send(JSON.stringify({ type: 'auth', token }))

  ws.value.onmessage = (event) => {
    const parsed = JSON.parse(event.data)

    if (parsed.type === 'authenticated') {
      isConnected.value = true
      // Send read receipt if a chat is already open
      if (targetUserId.value) {
        ws.value?.send(JSON.stringify({ type: 'read_receipt', withUserId: targetUserId.value }))
      }
    }

    if (parsed.type === 'user_online') {
      onlineUserIds.value = new Set([...onlineUserIds.value, parsed.userId])
    }

    if (parsed.type === 'user_offline') {
      const next = new Set(onlineUserIds.value)
      next.delete(parsed.userId)
      onlineUserIds.value = next
    }

    if (parsed.type === 'new_message') {
      const alreadyExists = allMessages.value.some((m) => m.id === parsed.data.id)
      if (!alreadyExists) {
        allMessages.value.push(parsed.data)
        if (parsed.data.senderId !== targetUserId.value) {
          unreadCounts.value[parsed.data.senderId] = (unreadCounts.value[parsed.data.senderId] || 0) + 1
        } else {
          // Chat is open — immediately mark as read
          ws.value?.send(JSON.stringify({ type: 'read_receipt', withUserId: parsed.data.senderId }))
        }
      }
      ws.value?.send(JSON.stringify({ type: 'ack', deliveryTag: parsed.deliveryTag }))
    }

    if (parsed.type === 'message_delivered') {
      const idx = allMessages.value.findIndex((m) => m.id === parsed.messageId)
      if (idx !== -1 && allMessages.value[idx]!.status === 'sent') {
        allMessages.value[idx] = { ...allMessages.value[idx]!, status: 'delivered' }
      }
    }

    if (parsed.type === 'messages_read') {
      allMessages.value = allMessages.value.map((m) =>
        m.senderId === (currentUser.value?.id as string) &&
        m.receiverId === parsed.byUserId &&
        (m.status === 'sent' || m.status === 'delivered')
          ? { ...m, status: 'read' }
          : m
      )
    }
  }

  ws.value.onclose = () => { isConnected.value = false }
}

function sendMessage() {
  if (!inputText.value.trim() || !targetUserId.value || !currentUser.value) return
  if (ws.value?.readyState !== WebSocket.OPEN) return

  const id = crypto.randomUUID()

  ws.value.send(JSON.stringify({
    type: 'send_message',
    receiverId: targetUserId.value,
    content: inputText.value,
    tempId: id
  }))

  allMessages.value.push({
    id,
    senderId: currentUser.value.id as string,
    receiverId: targetUserId.value,
    content: inputText.value,
    sentAt: new Date().toISOString(),
    status: 'sent'
  })

  inputText.value = ''
}

function avatarLetter(name: unknown): string {
  return String(name ?? '?')[0].toUpperCase()
}
</script>

<template>
  <div class="flex h-screen bg-gray-100 overflow-hidden">

    <!-- Sidebar -->
    <aside class="w-72 bg-white border-r border-gray-200 flex flex-col shrink-0">
      <div class="px-4 py-3 border-b border-gray-100 flex flex-col gap-2">
        <h2 class="text-lg font-bold text-gray-900">Chats</h2>
        <div class="relative">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search by username..."
            class="w-full pl-9 pr-3 py-2 bg-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            @input="onSearchInput"
          />
          <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/>
          </svg>
          <svg v-if="isSearching" class="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto">
        <div v-if="sidebarUsers.length === 0" class="p-6 text-center text-gray-400 text-sm">
          {{ searchQuery.trim() ? `No users found for "@${searchQuery.trim()}"` : 'No other users yet.' }}
        </div>
        <button
          v-for="u in sidebarUsers"
          :key="u.id"
          class="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-50"
          :class="targetUserId === u.id ? 'bg-blue-50 hover:bg-blue-50' : ''"
          @click="selectUser(u)"
        >
          <!-- Avatar with online dot -->
          <div class="relative shrink-0">
            <img v-if="u.image" :src="u.image" :alt="String(u.name)" class="h-12 w-12 rounded-full object-cover" />
            <div v-else class="h-12 w-12 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-lg">
              {{ avatarLetter(u.name) }}
            </div>
            <span
              v-if="onlineUserIds.has(u.id)"
              class="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full bg-emerald-500 border-2 border-white"
            />
          </div>
          <div class="flex-1 min-w-0 text-left">
            <div class="flex items-center justify-between gap-2">
              <span class="font-semibold text-gray-900 truncate">{{ u.name }}</span>
              <span
                v-if="unreadCounts[u.id]"
                class="shrink-0 bg-blue-500 text-white text-xs font-bold rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center"
              >
                {{ unreadCounts[u.id] }}
              </span>
            </div>
            <p v-if="u.username" class="text-xs text-gray-400 truncate">@{{ u.username }}</p>
            <p class="text-sm text-gray-400 truncate">{{ lastMessageFor(u.id) || 'No messages yet' }}</p>
          </div>
        </button>
      </div>

      <!-- Current user -->
      <div class="px-4 py-3 border-t border-gray-100 flex items-center gap-3">
        <img v-if="currentUser?.image" :src="currentUser.image" :alt="String(currentUser.name)" class="h-9 w-9 rounded-full object-cover shrink-0" />
        <div v-else class="h-9 w-9 rounded-full bg-gray-400 flex items-center justify-center text-white font-bold shrink-0">
          {{ avatarLetter(currentUser?.name) }}
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-semibold text-gray-900 truncate">{{ currentUser?.name }}</p>
          <div class="flex items-center gap-1.5 text-xs" :class="isConnected ? 'text-emerald-500' : 'text-gray-400'">
            <span class="h-1.5 w-1.5 rounded-full" :class="isConnected ? 'bg-emerald-500' : 'bg-gray-400'" />
            {{ isConnected ? 'Online' : 'Connecting...' }}
          </div>
        </div>
        <NuxtLink to="/profile" class="text-gray-400 hover:text-gray-600 transition-colors text-lg" title="Profile">
          ⚙️
        </NuxtLink>
      </div>
    </aside>

    <!-- Main area -->
    <main class="flex-1 flex flex-col min-w-0">
      <!-- Empty state -->
      <div v-if="!targetUserId" class="flex-1 flex flex-col items-center justify-center text-gray-400 bg-gray-50">
        <div class="text-7xl mb-4">💬</div>
        <p class="text-xl font-semibold text-gray-500">Select a chat</p>
        <p class="text-sm mt-1">Choose a conversation from the left</p>
      </div>

      <template v-else>
        <!-- Chat header with online status -->
        <div class="px-6 py-3.5 bg-white border-b border-gray-200 flex items-center gap-3 shrink-0">
          <div class="relative shrink-0">
            <img v-if="targetUser?.image" :src="targetUser.image" :alt="String(targetUser.name)" class="h-10 w-10 rounded-full object-cover" />
            <div v-else class="h-10 w-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold">
              {{ avatarLetter(targetUser?.name) }}
            </div>
            <span
              v-if="targetIsOnline"
              class="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-emerald-500 border-2 border-white"
            />
          </div>
          <div>
            <p class="font-semibold text-gray-900 leading-tight">{{ targetUser?.name }}</p>
            <p class="text-xs" :class="targetIsOnline ? 'text-emerald-500' : 'text-gray-400'">
              {{ targetIsOnline ? 'Online' : 'Offline' }}
              <span v-if="targetUser?.username" class="text-gray-400 ml-1">· @{{ targetUser.username }}</span>
            </p>
          </div>
        </div>

        <!-- Messages -->
        <div ref="chatContainer" class="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-2 bg-gray-50">
          <div v-if="activeMessages.length === 0" class="flex-1 flex items-center justify-center text-gray-400 text-sm">
            No messages yet. Say hello!
          </div>
          <div
            v-for="msg in activeMessages"
            :key="msg.id"
            class="flex"
            :class="msg.senderId === currentUser?.id ? 'justify-end' : 'justify-start'"
          >
            <div
              class="max-w-[65%] px-4 py-2 rounded-2xl shadow-sm"
              :class="
                msg.senderId === currentUser?.id
                  ? 'bg-blue-500 text-white rounded-br-none'
                  : 'bg-white text-gray-900 rounded-bl-none border border-gray-100'
              "
            >
              <p class="leading-relaxed break-words">{{ msg.content }}</p>
              <div class="flex items-center justify-end gap-1 mt-0.5">
                <span class="text-xs" :class="msg.senderId === currentUser?.id ? 'text-blue-100' : 'text-gray-400'">
                  {{ formatTime(msg.sentAt) }}
                </span>
                <!-- Ticks: only for own messages sent in this session -->
                <template v-if="msg.senderId === currentUser?.id && msg.status">
                  <!-- ✓✓ cyan = read -->
                  <svg v-if="msg.status === 'read'" class="w-4 h-3 text-cyan-300" viewBox="0 0 20 12" fill="none">
                    <path d="M1 6L5 10L11 2" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M7 6L11 10L17 2" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  <!-- ✓✓ dim = delivered -->
                  <svg v-else-if="msg.status === 'delivered'" class="w-4 h-3 text-white opacity-60" viewBox="0 0 20 12" fill="none">
                    <path d="M1 6L5 10L11 2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M7 6L11 10L17 2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  <!-- ✓ dim = sent -->
                  <svg v-else class="w-3 h-3 text-white opacity-50" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6L5 9L10 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </template>
              </div>
            </div>
          </div>
        </div>

        <!-- Input -->
        <div class="px-6 py-4 bg-white border-t border-gray-200 flex gap-3 shrink-0">
          <input
            v-model="inputText"
            type="text"
            placeholder="Type a message..."
            :disabled="!isConnected"
            class="flex-1 px-4 py-2.5 bg-gray-100 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            @keydown.enter="sendMessage"
          />
          <button
            :disabled="!isConnected || !inputText.trim()"
            class="px-5 py-2.5 bg-blue-500 text-white font-semibold rounded-full hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm"
            @click="sendMessage"
          >
            Send
          </button>
        </div>
      </template>
    </main>
  </div>
</template>
