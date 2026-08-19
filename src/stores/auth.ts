import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Author } from '@/types/entities'

const TOKEN_KEY = 'access_token'

export const useAuthStore = defineStore('auth', () => {
  const token = ref('')
  const user = ref<Author | null>(null)

  const isLogin = computed(() => !!token.value)
  const profilePath = computed(() => {
    const id = user.value?.authorId || user.value?.documentId
    return id ? `/profile/${id}` : null
  })

  function hydrateFromStorage() {
    token.value = localStorage.getItem(TOKEN_KEY) || ''
    if (token.value) {
      fetchSelfUser()
    }
  }

  async function fetchSelfUser() {
    try {
      const { useApi } = await import('@/composables/useApi')
      const api = useApi()
      const u = await api.getSelfUser()
      if (u) user.value = u
    } catch {
      token.value = ''
      localStorage.removeItem(TOKEN_KEY)
    }
  }

  function setSession(t: string, u: Author) {
    token.value = t
    user.value = u
    localStorage.setItem(TOKEN_KEY, t)
  }

  function clearSession() {
    token.value = ''
    user.value = null
    localStorage.removeItem(TOKEN_KEY)
    window.dispatchEvent(new CustomEvent("auth:logout"))
  }

  return { token, user, isLogin, profilePath, hydrateFromStorage, fetchSelfUser, setSession, clearSession }
})
