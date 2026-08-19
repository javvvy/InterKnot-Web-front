<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useMessage } from 'zenless-ui'
import { useApi } from '@/composables/useApi'
import { useAuthStore } from '@/stores/auth'
import { resolveErrorMessage } from '@/utils/api-error'
import type { Avatar } from '@/types/entities'

const api = useApi()
const auth = useAuthStore()
const message = useMessage()

const emit = defineEmits<{
  close: []
  equipped: [avatar: Avatar | null]
  customUploaded: [avatarUrl: string]
}>()

const avatars = ref<Avatar[]>([])
const equippedId = ref<string | null>(null)
const selectedAvatar = ref<Avatar | null>(null)
const loading = ref(true)
const equipping = ref(false)
const activeTab = ref<string>('all')

const tabs = [
  { key: 'all', label: '全部' },
  { key: 'custom', label: '自定义' },
]

const DEFAULT_AVATAR: Avatar = {
  documentId: '__default__',
  name: '默认头像',
  type: 'default',
  url: '/images/default-avatar.webp',
}

const filteredAvatars = computed(() => {
  const list = activeTab.value === 'all' ? avatars.value : avatars.value.filter(a => a.type === activeTab.value)
  return activeTab.value === 'all' || activeTab.value === 'default' ? [DEFAULT_AVATAR, ...list] : list
})

const previewAvatarImage = computed(() =>
  selectedAvatar.value?.url || auth.user?.avatar || '/images/default-avatar.webp'
)

const isSelectionEquipped = computed(() => {
  if (!selectedAvatar.value) return true
  return selectedAvatar.value.documentId === equippedId.value
})

function handleTabChange(key: string) {
  activeTab.value = key
  selectedAvatar.value = null
}

function selectAvatar(avatar: Avatar) {
  selectedAvatar.value = avatar
}

async function handleConfirm() {
  if (equipping.value || !selectedAvatar.value) return
  if (selectedAvatar.value.documentId === equippedId.value) {
    message.warning('什么都没改呢！')
    return
  }
  equipping.value = true
  try {
    await api.equipAvatar(selectedAvatar.value.documentId)
    equippedId.value = selectedAvatar.value.documentId
    emit('equipped', selectedAvatar.value)
    message.success('头像修改成功')
  } catch (err) {
    message.error(resolveErrorMessage(err, '修改头像失败'))
  } finally {
    equipping.value = false
  }
}

// Custom upload
const fileInputRef = ref<HTMLInputElement | null>(null)
const uploading = ref(false)

function triggerFileInput() { fileInputRef.value?.click() }

async function onFileSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!file.type.startsWith('image/')) { message.warning('请选择图片文件'); return }
  if (file.size > 10 * 1024 * 1024) { message.warning('图片大小不能超过 10MB'); return }
  uploading.value = true
  try {
    const result = await api.uploadCustomAvatar(file)
    // Auto-equip the newly uploaded avatar
    await api.equipAvatar(result.documentId)
    emit('customUploaded', result.url)
    message.success('自定义头像上传成功')
    await loadAvatars()
  } catch (err) {
    message.error(resolveErrorMessage(err, '上传头像失败'))
  } finally {
    uploading.value = false
  }
}

async function loadAvatars() {
  loading.value = true
  try {
    avatars.value = await api.getMyAvatars()
    if (auth.user?.avatar) {
      const eq = avatars.value.find(a => a.url === auth.user?.avatar)
      equippedId.value = eq?.documentId || null
    }
    // If no custom avatar equipped, default is equipped
    if (!equippedId.value) equippedId.value = '__default__'
  } catch (err) {
    message.error(resolveErrorMessage(err, '获取头像列表失败'))
  } finally {
    loading.value = false
  }
}

function handleClose() { emit('close') }
function handleOverlayClick(e: MouseEvent) {
  if ((e.target as HTMLElement).classList.contains('ik-overlay')) handleClose()
}
function onKeydown(e: KeyboardEvent) { if (e.key === 'Escape') handleClose() }

onMounted(async () => {
  window.addEventListener('keydown', onKeydown)
  await loadAvatars()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="ik-overlay" @click="handleOverlayClick">
    <div class="ik-overlay__stripe" />
    <div class="ik-av-dialog">
      <div class="ik-av-frame">
        <div class="ik-av-frame__inner">
          <div class="ik-av-frame__body">
            <!-- Tab Bar (tabs LEFT, close RIGHT) -->
            <div class="ik-av-tab-bar">
              <div class="ik-av-tabs" role="tablist">
                <button
                  v-for="(tab, idx) in tabs"
                  :key="tab.key"
                  type="button"
                  role="tab"
                  class="ik-av-tab"
                  :class="[
                    idx === 0 ? 'ik-av-tab--first' : idx === tabs.length - 1 ? 'ik-av-tab--last' : 'ik-av-tab--middle',
                    { 'is-active': activeTab === tab.key },
                  ]"
                  :aria-selected="activeTab === tab.key"
                  @click="handleTabChange(tab.key)"
                >
                  <svg v-if="idx === 0" class="ik-av-tab__highlight ik-av-tab__highlight--first" viewBox="0 0 110.7 42" aria-hidden="true">
                    <path d="M 21 0 L 94.38 0 A 10 10 0 0 1 103.29 14.54 L 93.75 33.26 A 16 16 0 0 1 79.5 42 L 21 42 A 21 21 0 0 1 21 0 Z" fill="currentColor" />
                  </svg>
                  <svg v-else-if="idx === tabs.length - 1" class="ik-av-tab__highlight ik-av-tab__highlight--last" viewBox="0 0 110.7 42" aria-hidden="true">
                    <path d="M 89.7 0 A 21 21 0 0 1 89.7 42 L 13.05 42 A 8 8 0 0 1 5.93 30.37 L 16.95 8.74 A 16 16 0 0 1 31.2 0 Z" fill="currentColor" />
                  </svg>
                  <svg v-else class="ik-av-tab__highlight ik-av-tab__highlight--middle" viewBox="0 0 121.4 42" aria-hidden="true">
                    <path d="M 105.08 0 A 10 10 0 0 1 113.99 14.54 L 104.45 33.26 A 16 16 0 0 1 90.2 42 L 16.32 42 A 10 10 0 0 1 7.41 27.46 L 16.95 8.74 A 16 16 0 0 1 31.2 0 Z" fill="currentColor" />
                  </svg>
                  <span class="ik-av-tab__content">{{ tab.label }}</span>
                </button>
              </div>
              <button class="ik-av-close" aria-label="关闭" @click="handleClose">
                <img src="/images/close-btn.webp" alt="关闭" class="ik-av-close__img" draggable="false" />
              </button>
            </div>

            <!-- Main -->
            <div class="ik-av-main">
              <!-- Preview -->
              <div class="ik-av-preview">
                <div class="ik-av-preview__banner-card">
                  <div class="ik-av-preview__banner">
                    <div class="ik-av-preview__user">
                      <div class="ik-av-preview__avatar">
                        <img :src="previewAvatarImage" @error="(e: Event) => (e.target as HTMLImageElement).src = '/images/default-avatar.webp'" />
                      </div>
                      <div class="ik-av-preview__info">
                        <h2 class="ik-av-preview__name">{{ auth.user?.nickName || auth.user?.userName || '匿名用户' }}</h2>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Avatar grid -->
              <div class="ik-av-grid-wrap">
                <div v-if="loading" class="ik-av-grid-status">加载中...</div>
                <div v-else class="ik-av-grid-scroll">
                  <div class="ik-av-grid">
                    <!-- Upload button (always visible) -->
                    <button class="ik-av-grid__item ik-av-grid__item--upload" :disabled="uploading" @click="triggerFileInput">
                      <div class="ik-av-grid__thumb ik-av-grid__thumb--upload">
                        <svg v-if="!uploading" class="ik-av-grid__upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        <span v-else class="ik-av-grid__upload-text">上传中</span>
                      </div>
                    </button>
                    <input ref="fileInputRef" type="file" accept="image/*" hidden @change="onFileSelected" />
                    <!-- Avatars (including default) -->
                    <button
                      v-for="avatar in filteredAvatars" :key="avatar.documentId"
                      class="ik-av-grid__item"
                      :class="{
                        'is-selected': selectedAvatar?.documentId === avatar.documentId,
                        'is-equipped': equippedId === avatar.documentId,
                      }"
                      @click="selectAvatar(avatar)"
                    >
                      <div class="ik-av-grid__thumb">
                        <img v-if="avatar.url" :src="avatar.url" class="ik-av-grid__img" />
                        <div v-else class="ik-av-grid__placeholder">{{ avatar.name?.charAt(0) || '?' }}</div>
                      </div>
                      <i v-if="equippedId === avatar.documentId" class="z-icon-success ik-av-grid__badge-icon" />
                    </button>
                  </div>
                </div>
              </div>

              <!-- Confirm -->
              <div class="ik-av-submit-wrap">
                <z-button
                  class="ik-av-submit"
                  :disabled="loading || equipping || isSelectionEquipped"
                  @click="handleConfirm"
                >
                  {{ equipping ? '保存中...' : '确定' }}
                </z-button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ik-overlay { position: fixed; inset: 0; z-index: 9000; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.7); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
.ik-overlay__stripe { position: absolute; inset: 0; pointer-events: none; background: repeating-linear-gradient(40deg, transparent, transparent 3.5px, rgba(255,255,255,0.09) 4.5px, rgba(255,255,255,0.09) 7.5px, transparent 8.5px); }
.ik-av-dialog { position: relative; width: 50%; height: 60%; transform: scale(1.05); }
.ik-av-frame { width: 100%; height: 100%; padding: 4px; background: #2D2C2D; border-radius: 24px; }
.ik-av-frame__inner { width: 100%; height: 100%; padding: 4px; background: #000; border-radius: 22px; overflow: hidden; }
.ik-av-frame__body { width: 100%; height: 100%; display: flex; flex-direction: column; border-radius: 20px; overflow: hidden; }
.ik-av-tab-bar { display: flex; align-items: center; justify-content: space-between; padding: 10px 20px; min-height: 52px; flex-shrink: 0; background: url("/images/tab-bg-point.webp") repeat, linear-gradient(180deg, #161616 0%, #080808 100%); border-radius: 0 0 16px 16px; }
.ik-av-tabs { position: relative; display: flex; overflow: visible; border: 3px solid #313131; border-radius: 999px; background: #050505 url("/images/tab-bg-point.webp") repeat; }
.ik-av-tab { position: relative; z-index: 0; width: 90px; height: 38px; padding: 0; overflow: visible; border: 0; appearance: none; background: transparent; color: #fff; cursor: pointer; font-family: inherit; font-size: 16px; font-weight: 700; font-style: italic; line-height: 1; text-align: center; user-select: none; transition: color 140ms ease; }
.ik-av-tab:focus-visible { outline: 2px solid rgba(215, 255, 0, 0.7); outline-offset: 4px; }
.ik-av-tab:active { color: #b8b8b8; }
.ik-av-tab.is-active { color: #000; }
.ik-av-tab__content { position: relative; z-index: 2; display: inline-flex; align-items: center; justify-content: center; height: 100%; }
.ik-av-tab__highlight { position: absolute; top: 0; z-index: 1; height: 38px; color: #fbfe00; opacity: 0; pointer-events: none; transform: scale(1.1); transform-origin: center; }
.ik-av-tab__highlight--first { left: 0; width: 100px; }
.ik-av-tab__highlight--middle { left: -10px; width: 110px; }
.ik-av-tab__highlight--last { right: 0; width: 100px; }
.ik-av-tab.is-active .ik-av-tab__highlight { opacity: 1; animation: ik-av-tab-color 800ms linear infinite alternate, ik-av-tab-scale 700ms linear infinite; }
@keyframes ik-av-tab-color { from { color: #fbfe00; } to { color: #dcfe00; } }
@keyframes ik-av-tab-scale { 0% { transform: scale(1.1); animation-timing-function: cubic-bezier(0.55, 0.055, 0.675, 0.19); } 50% { transform: scale(1.25); animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1); } 100% { transform: scale(1.1); } }
.ik-av-close { flex-shrink: 0; display: flex; align-items: center; justify-content: center; padding: 0; border: none; background: transparent; cursor: pointer; transition: opacity 140ms ease, transform 140ms ease; }
.ik-av-close:hover { opacity: 0.85; transform: scale(1.08); }
.ik-av-close:active { transform: scale(0.95); }
.ik-av-close__img { height: 32px; width: auto; display: block; user-select: none; -webkit-user-drag: none; pointer-events: none; }
.ik-av-main { flex: 1; min-height: 0; display: flex; flex-direction: column; background: linear-gradient(180deg, #010101 0%, #161616 100%); }
.ik-av-preview { flex-shrink: 0; padding: 12px 16px 0; }
.ik-av-preview__banner { position: relative; border-radius: 14px; overflow: hidden; background: #2a2d33 url("/images/banner.png") center/cover no-repeat; min-height: 100px; display: flex; align-items: center; padding: 16px 24px; }
.ik-av-preview__user { display: flex; align-items: center; gap: 16px; z-index: 1; }
.ik-av-preview__avatar { width: 64px; height: 64px; border-radius: 999px; overflow: hidden; border: 3px solid #000; background: #000; flex-shrink: 0; }
.ik-av-preview__avatar img { width: 100%; height: 100%; object-fit: cover; }
.ik-av-preview__info { display: flex; flex-direction: column; gap: 4px; }
.ik-av-preview__name { margin: 0; font-size: 22px; font-weight: 900; color: #fff; text-shadow: 1px 1px 0 rgba(0,0,0,0.4); }
.ik-av-grid-wrap { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 12px 16px 0; overflow: hidden; }
.ik-av-grid-scroll { flex: 1; min-height: 0; max-height: 280px; overflow-y: auto; border-radius: 16px; background: rgba(0,0,0,0.4); }
.ik-av-grid-scroll::-webkit-scrollbar { width: 4px; }
.ik-av-grid-scroll::-webkit-scrollbar-thumb { background: #444; border-radius: 2px; }
.ik-av-grid-status { display: flex; align-items: center; justify-content: center; height: 100%; color: #666; font-size: 14px; }
.ik-av-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(70px, 1fr)); justify-items: center; gap: 10px; padding: 20px; }
.ik-av-grid__item { position: relative; width: 64px; aspect-ratio: 1; border-radius: 999px; background: #0f0f0f; border: 2px solid transparent; cursor: pointer; transition: border-color 0.15s, background 0.15s; display: flex; align-items: center; justify-content: center; padding: 2px; }
.ik-av-grid__item:hover { background: #1a1a1a; border-color: #333; }
.ik-av-grid__item.is-selected { border-color: #fbfe00; background: #1a1a0a; }
.ik-av-grid__item.is-equipped { border-color: #00cc0d; }
.ik-av-grid__item--upload { border: 2px dashed #444; }
.ik-av-grid__item--upload:hover { border-color: #fbfe00; }
.ik-av-grid__thumb { width: 100%; height: 100%; border-radius: 999px; overflow: hidden; background: #1a1a1a; }
.ik-av-grid__img { width: 100%; height: 100%; object-fit: cover; }
.ik-av-grid__placeholder { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 900; color: #444; }
.ik-av-grid__thumb--upload { display: flex; align-items: center; justify-content: center; background: transparent; }
.ik-av-grid__upload-icon { width: 28px; height: 28px; color: #666; transition: color 0.15s; }
.ik-av-grid__item--upload:hover .ik-av-grid__upload-icon { color: #fbfe00; }
.ik-av-grid__upload-text { font-size: 11px; color: #888; font-weight: 700; }
.ik-av-grid__badge-icon { position: absolute; top: -2px; right: -2px; font-size: 22px; color: #00cc0d; background: #000; border-radius: 999px; }
.ik-av-submit-wrap { position: relative; z-index: 2; flex-shrink: 0; display: flex; justify-content: center; margin-top: -18px; padding: 0 16px 18px; }
.ik-av-submit-wrap :deep(.z-button) { min-width: 130px; font-weight: 900; }
@media (max-width: 800px) { .ik-av-dialog { width: 92%; height: 80%; transform: scale(1); } .ik-av-grid { grid-template-columns: repeat(5, 1fr); } }
@media (max-width: 500px) { .ik-av-dialog { width: 100%; height: 95%; } .ik-av-grid { grid-template-columns: repeat(4, 1fr); } }
</style>
