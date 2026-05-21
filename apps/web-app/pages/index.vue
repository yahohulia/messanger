<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

type MessageStatus = 'sent' | 'delivered' | 'read'

type Message = {
  id: string
  senderId: string
  receiverId: string
  content: string
  sentAt: string | Date
  editedAt?: string | Date | null
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
  if (!contacts.value.find((c) => c.id === u.id)) {
    contacts.value = [...contacts.value, u]
  }
  targetUserId.value = u.id
  searchQuery.value = ''
  searchResults.value = []
}

async function hideChat(contactId: string) {
  contacts.value = contacts.value.filter((c) => c.id !== contactId)
  if (targetUserId.value === contactId) targetUserId.value = ''
  await $fetch('/api/chat/hide', { method: 'POST', body: { contactId } }).catch(() => {})
}

// ── Context menu ──────────────────────────────────────────────
type CtxMenu =
  | { type: 'contact'; contactId: string; x: number; y: number }
  | { type: 'message'; messageId: string; x: number; y: number }

const ctxMenu = ref<CtxMenu | null>(null)

const MENU_WIDTH = 168 // min-w of context menu in px
const MENU_HEIGHT_APPROX = 100

function menuPos(e: MouseEvent) {
  const x = e.clientX + MENU_WIDTH > window.innerWidth ? e.clientX - MENU_WIDTH : e.clientX
  const y = e.clientY + MENU_HEIGHT_APPROX > window.innerHeight ? e.clientY - MENU_HEIGHT_APPROX : e.clientY
  return { x, y }
}

function openContactMenu(e: MouseEvent, contactId: string) {
  e.preventDefault()
  const { x, y } = menuPos(e)
  ctxMenu.value = { type: 'contact', contactId, x, y }
}

function openMessageMenu(e: MouseEvent, messageId: string) {
  e.preventDefault()
  const { x, y } = menuPos(e)
  ctxMenu.value = { type: 'message', messageId, x, y }
}

function closeCtx() { ctxMenu.value = null }

onMounted(() => document.addEventListener('click', closeCtx))
onUnmounted(() => {
  document.removeEventListener('click', closeCtx)
  ws.value?.close()
})

const clearHistoryConfirmId = ref<string | null>(null)
const deleteChatConfirmId = ref<string | null>(null)

async function clearHistory() {
  if (!clearHistoryConfirmId.value) return
  const contactId = clearHistoryConfirmId.value
  await $fetch('/api/chat/clear-history', { method: 'POST', body: { contactId } }).catch(() => {})
  allMessages.value = allMessages.value.filter(
    (m) => m.senderId !== contactId && m.receiverId !== contactId
  )
  clearHistoryConfirmId.value = null
}

async function deleteChat() {
  if (!deleteChatConfirmId.value) return
  await hideChat(deleteChatConfirmId.value)
  deleteChatConfirmId.value = null
}

// ── Delete message ────────────────────────────────────────────
const deleteConfirmId = ref<string | null>(null)

async function confirmDelete() {
  if (!deleteConfirmId.value) return
  const id = deleteConfirmId.value
  await $fetch(`/api/messages/${id}`, { method: 'DELETE' }).catch(() => {})
  allMessages.value = allMessages.value.filter((m) => m.id !== id)
  deleteConfirmId.value = null
}

// ── Edit message ──────────────────────────────────────────────
const editingId = ref<string | null>(null)
const editText = ref('')
const editInput = ref<HTMLTextAreaElement | null>(null)

function startEdit(msg: Message) {
  editingId.value = msg.id
  editText.value = msg.content
  closeCtx()
  nextTick(() => editInput.value?.focus())
}

function cancelEdit() { editingId.value = null; editText.value = '' }

async function submitEdit() {
  if (!editingId.value || !editText.value.trim()) return
  const id = editingId.value
  const content = editText.value.trim()
  await $fetch(`/api/messages/${id}`, { method: 'PATCH', body: { content } }).catch(() => {})
  allMessages.value = allMessages.value.map((m) =>
    m.id === id ? { ...m, content, editedAt: new Date() } : m
  )
  cancelEdit()
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
      // Auto-add sender to contacts if not already there
      const senderId = parsed.data.senderId
      if (senderId !== currentUser.value?.id && !contacts.value.find((c) => c.id === senderId)) {
        $fetch<Contact>(`/api/users/${senderId}`)
          .then((u) => { if (u) contacts.value = [...contacts.value, u] })
          .catch(() => {})
      }

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
        <div
          v-for="u in sidebarUsers"
          :key="u.id"
          class="group relative flex items-center border-b border-gray-50"
          :class="targetUserId === u.id ? 'bg-blue-50' : 'hover:bg-gray-50'"
        >
        <button
          class="flex-1 flex items-center gap-3 px-4 py-3 transition-colors"
          @click="selectUser(u)"
          @contextmenu="openContactMenu($event, u.id)"
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
            @contextmenu="openMessageMenu($event, msg.id)"
          >
            <div
              class="max-w-[65%] px-4 py-2 rounded-2xl shadow-sm"
              :class="
                msg.senderId === currentUser?.id
                  ? 'bg-blue-500 text-white rounded-br-none'
                  : 'bg-white text-gray-900 rounded-bl-none border border-gray-100'
              "
            >
              <!-- Edit mode -->
              <template v-if="editingId === msg.id">
                <textarea
                  ref="editInput"
                  v-model="editText"
                  rows="2"
                  class="w-full bg-blue-400 text-white placeholder:text-blue-200 rounded-lg px-2 py-1 text-sm resize-none focus:outline-none"
                  @keydown.enter.exact.prevent="submitEdit"
                  @keydown.escape="cancelEdit"
                />
                <div class="flex justify-end gap-2 mt-1">
                  <button class="text-xs text-blue-200 hover:text-white" @click="cancelEdit">Cancel</button>
                  <button class="text-xs text-white font-semibold hover:text-blue-100" @click="submitEdit">Save</button>
                </div>
              </template>

              <!-- Normal mode -->
              <template v-else>
                <p class="leading-relaxed break-words">{{ msg.content }}</p>
                <div class="flex items-center justify-end gap-1 mt-0.5">
                  <span v-if="msg.editedAt" class="text-xs opacity-60 italic" :class="msg.senderId === currentUser?.id ? 'text-blue-100' : 'text-gray-400'">edited</span>
                  <span class="text-xs" :class="msg.senderId === currentUser?.id ? 'text-blue-100' : 'text-gray-400'">
                    {{ formatTime(msg.sentAt) }}
                  </span>
                  <template v-if="msg.senderId === currentUser?.id && msg.status">
                    <svg v-if="msg.status === 'read'" class="w-4 h-3 text-cyan-300" viewBox="0 0 20 12" fill="none">
                      <path d="M1 6L5 10L11 2" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
                      <path d="M7 6L11 10L17 2" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <svg v-else-if="msg.status === 'delivered'" class="w-4 h-3 text-white opacity-60" viewBox="0 0 20 12" fill="none">
                      <path d="M1 6L5 10L11 2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                      <path d="M7 6L11 10L17 2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <svg v-else class="w-3 h-3 text-white opacity-50" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6L5 9L10 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </template>
                </div>
              </template>
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

  <!-- ── Context menu ─────────────────────────────────────────── -->
  <Teleport to="body">
    <div
      v-if="ctxMenu"
      class="fixed z-50 min-w-[160px] bg-white rounded-xl shadow-xl border border-gray-100 py-1 overflow-hidden"
      :style="{ top: ctxMenu.y + 'px', left: ctxMenu.x + 'px' }"
      @click.stop
    >
      <!-- Contact menu -->
      <template v-if="ctxMenu.type === 'contact'">
        <button
          class="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          @click="clearHistoryConfirmId = ctxMenu.contactId; closeCtx()"
        >
          <svg class="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m2 0H7m2-3h6a1 1 0 011 1H8a1 1 0 011-1z"/>
          </svg>
          Clear history
        </button>
        <button
          class="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors"
          @click="deleteChatConfirmId = ctxMenu.contactId; closeCtx()"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
          Delete chat
        </button>
      </template>

      <!-- Message menu -->
      <template v-else-if="ctxMenu.type === 'message'">
        <template v-if="allMessages.find(m => m.id === ctxMenu.messageId)?.senderId === currentUser?.id">
          <button
            class="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            @click="startEdit(allMessages.find(m => m.id === ctxMenu.messageId)!)"
          >
            <svg class="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
            </svg>
            Edit
          </button>
          <div class="border-t border-gray-100 my-0.5" />
        </template>
        <button
          class="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors"
          @click="deleteConfirmId = ctxMenu.messageId; closeCtx()"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m2 0H7m2-3h6a1 1 0 011 1H8a1 1 0 011-1z"/>
          </svg>
          Delete
        </button>
      </template>
    </div>

    <!-- ── Delete message modal ──────────────────────────────── -->
    <div
      v-if="deleteConfirmId"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      @click.self="deleteConfirmId = null"
    >
      <div class="bg-white rounded-2xl shadow-2xl w-80 p-6 flex flex-col gap-4">
        <div class="flex flex-col gap-1">
          <h3 class="text-base font-semibold text-gray-900">Delete message?</h3>
          <p class="text-sm text-gray-500">This action cannot be undone.</p>
        </div>
        <div class="flex gap-3 justify-end">
          <button
            class="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
            @click="deleteConfirmId = null"
          >
            Cancel
          </button>
          <button
            class="px-4 py-2 rounded-xl text-sm font-semibold bg-red-500 text-white hover:bg-red-600 transition-colors"
            @click="confirmDelete"
          >
            Delete
          </button>
        </div>
      </div>
    </div>

    <!-- ── Clear history modal ───────────────────────────────── -->
    <div
      v-if="clearHistoryConfirmId"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      @click.self="clearHistoryConfirmId = null"
    >
      <div class="bg-white rounded-2xl shadow-2xl w-80 p-6 flex flex-col gap-4">
        <div class="flex flex-col gap-1">
          <h3 class="text-base font-semibold text-gray-900">Clear history?</h3>
          <p class="text-sm text-gray-500">All messages with this contact will be permanently deleted.</p>
        </div>
        <div class="flex gap-3 justify-end">
          <button
            class="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
            @click="clearHistoryConfirmId = null"
          >
            Cancel
          </button>
          <button
            class="px-4 py-2 rounded-xl text-sm font-semibold bg-red-500 text-white hover:bg-red-600 transition-colors"
            @click="clearHistory"
          >
            Clear
          </button>
        </div>
      </div>
    </div>

    <!-- ── Delete chat modal ─────────────────────────────────── -->
    <div
      v-if="deleteChatConfirmId"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      @click.self="deleteChatConfirmId = null"
    >
      <div class="bg-white rounded-2xl shadow-2xl w-80 p-6 flex flex-col gap-4">
        <div class="flex flex-col gap-1">
          <h3 class="text-base font-semibold text-gray-900">Delete chat?</h3>
          <p class="text-sm text-gray-500">The chat will be removed from your list. It will reappear if a new message arrives.</p>
        </div>
        <div class="flex gap-3 justify-end">
          <button
            class="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
            @click="deleteChatConfirmId = null"
          >
            Cancel
          </button>
          <button
            class="px-4 py-2 rounded-xl text-sm font-semibold bg-red-500 text-white hover:bg-red-600 transition-colors"
            @click="deleteChat"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
