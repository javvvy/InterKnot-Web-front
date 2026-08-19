<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useDebounceFn } from '@vueuse/core'
import { useMessage } from 'zenless-ui'
import { useApi } from '@/composables/useApi'
import { useAuthStore } from '@/stores/auth'
import { useLoginDialog } from '@/composables/useLoginDialog'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import { resolveErrorMessage } from '@/utils/api-error'
import type { DraftArticle, UploadTask, UploadStatus } from '@/types/entities'

const MAX_IMAGES = 9
const MAX_IMAGE_BYTES = 30 * 1024 * 1024
const AUTO_SAVE_DELAY = 800

const api = useApi()
const auth = useAuthStore()
const router = useRouter()
const loginDialog = useLoginDialog()
const confirmDialog = useConfirmDialog()
const message = useMessage()

// Redirect if not logged in — navigate to home so user can log in first
if (!auth.isLogin) { router.replace('/'); loginDialog.open() }

const title = ref('')
const body = ref('')
const uploadTasks = ref<UploadTask[]>([])
const documentId = ref<string | null>(null)
const isSavingDraft = ref(false)
const isPublishing = ref(false)
const hasUnsavedChanges = ref(false)
let lastSavedSnapshot = ''
const suppressTracking = ref(false)

// Drafts
const drafts = ref<DraftArticle[]>([])
const draftsCursor = ref('')
const draftsHasNext = ref(true)
const draftsLoading = ref(false)

const uploadedImages = computed(() =>
  uploadTasks.value.filter(t => t.status === 'done' && t.serverId).map(t => ({ id: t.serverId!, url: t.serverUrl! }))
)

const hasAnyContent = computed(() => title.value.trim() || body.value.trim() || uploadedImages.value.length > 0)

const canPublish = computed(() => !isSavingDraft.value && !isPublishing.value && title.value.trim().length > 0)

function buildSnapshot(): string {
  return JSON.stringify({ title: title.value.trim(), text: body.value.trim(), cover: uploadedImages.value.map(i => i.id) })
}

function syncSnapshot() { lastSavedSnapshot = buildSnapshot(); hasUnsavedChanges.value = false }

function markDirty() {
  if (suppressTracking.value) return
  hasUnsavedChanges.value = true
  debouncedSave()
}

async function performSaveDraft(force = false) {
  if (!auth.isLogin || isSavingDraft.value) return
  if (!documentId.value && !hasAnyContent.value) return
  const snapshot = buildSnapshot()
  if (!force && snapshot === lastSavedSnapshot) return
  isSavingDraft.value = true
  try {
    const authorId = auth.user?.authorId || auth.user?.documentId
    const payload: any = { title: title.value.trim(), text: body.value.trim(), coverId: uploadedImages.value.length ? uploadedImages.value.map(i => i.id) : undefined, authorId }
    let result: DraftArticle
    if (!documentId.value) result = await api.createArticleDraft(payload)
    else result = await api.updateArticleDraft(documentId.value, payload)
    if (result.documentId) {
      documentId.value = result.documentId
      const idx = drafts.value.findIndex(d => d.documentId === result.documentId)
      if (idx === -1) drafts.value.unshift(result)
      else drafts.value[idx] = { ...drafts.value[idx], ...result }
    }
    syncSnapshot()
  } catch (err) { hasUnsavedChanges.value = true; if (force) throw err }
  finally { isSavingDraft.value = false }
}

const debouncedSave = useDebounceFn(() => performSaveDraft().catch(() => {}), AUTO_SAVE_DELAY)

function handleFileSelect(files: FileList | File[]) {
  const fileArray = Array.from(files)
  const remaining = MAX_IMAGES - uploadTasks.value.length
  if (remaining <= 0) { message.error(`最多上传 ${MAX_IMAGES} 张图片`); return }
  const valid = fileArray.filter(f => {
    const ext = f.name.split('.').pop()?.toLowerCase() || ''
    if (!['jpg','jpeg','png','gif','webp'].includes(ext)) { message.error('仅支持 JPG、PNG、GIF、WEBP'); return false }
    if (f.size > MAX_IMAGE_BYTES) { message.error(`图片 ${f.name} 超过 30MB`); return false }
    return true
  })
  const toUpload = valid.slice(0, remaining)
  for (const file of toUpload) {
    const task: UploadTask = { localId: `${Date.now()}_${Math.random().toString(36).slice(2,8)}`, filename: file.name, file, status: 'pending' as UploadStatus, progress: 0, previewUrl: URL.createObjectURL(file) }
    uploadTasks.value.push(task)
    const reactiveTask = uploadTasks.value[uploadTasks.value.length - 1]!
    executeUpload(reactiveTask)
  }
}

let ensureDraftPromise: Promise<string> | null = null

async function ensureDraft(): Promise<string> {
  if (documentId.value) return documentId.value
  if (ensureDraftPromise) return ensureDraftPromise
  const authorId = auth.user?.authorId || auth.user?.documentId
  ensureDraftPromise = api.createArticleDraft({ title: '', text: '', authorId })
    .then(result => { documentId.value = result.documentId; return result.documentId })
    .finally(() => { ensureDraftPromise = null })
  return ensureDraftPromise
}

async function executeUpload(task: UploadTask) {
  try {
    task.status = 'uploading'; task.progress = 0
    const draftId = await ensureDraft()
    const uploaded = await api.uploadImage(task.file, draftId, 'article_cover', (p) => task.progress = p)
    task.serverId = uploaded.documentId; task.serverUrl = uploaded.url; task.status = 'done'; task.progress = 100
    markDirty()
  } catch (err) { task.status = 'error'; task.error = resolveErrorMessage(err) }
}

async function removeUpload(idx: number) {
  const task = uploadTasks.value[idx]
  if (!task) return
  // 已上传到服务器的封面需同步删除后端 cover 记录，避免下次打开草稿时封面残留
  if (task.status === 'done' && task.serverId && documentId.value) {
    try {
      await api.deleteDraftCover(documentId.value, task.serverId)
    } catch (err) {
      message.error(resolveErrorMessage(err, '删除封面失败'))
      return
    }
  }
  URL.revokeObjectURL(task.previewUrl)
  uploadTasks.value.splice(idx, 1)
  markDirty()
}

async function publish() {
  if (!canPublish.value) return
  isPublishing.value = true
  try {
    await performSaveDraft(true)
    if (!documentId.value) throw new Error('草稿保存后仍缺少 documentId')
    await api.publishArticleDraft(documentId.value)
    router.replace('/')
  } catch (err) { message.error(resolveErrorMessage(err, '发布失败')) }
  finally { isPublishing.value = false }
}

async function deleteDraft() {
  if (!documentId.value) return
  const ok = await confirmDialog.open({ title: '删除草稿', message: '确定删除草稿？', confirmText: '删除', danger: true })
  if (!ok) return
  try { await api.deleteDraft(documentId.value); resetEditor(); await refreshDrafts() }
  catch (err) { message.error(resolveErrorMessage(err, '删除失败')) }
}

function resetEditor() {
  suppressTracking.value = true
  try {
    documentId.value = null; title.value = ''; body.value = ''
    for (const t of uploadTasks.value) URL.revokeObjectURL(t.previewUrl)
    uploadTasks.value = []; lastSavedSnapshot = ''; hasUnsavedChanges.value = false
  } finally { suppressTracking.value = false }
}

async function loadDrafts() {
  if (!auth.isLogin || draftsLoading.value || !draftsHasNext.value) return
  draftsLoading.value = true
  try { const page = await api.getMyDrafts(draftsCursor.value); drafts.value.push(...page.nodes); draftsCursor.value = page.endCursor; draftsHasNext.value = page.hasNextPage }
  catch (err) { message.error(resolveErrorMessage(err, '加载草稿失败')) }
  finally { draftsLoading.value = false }
}

async function refreshDrafts() {
  if (!auth.isLogin || draftsLoading.value) return
  draftsLoading.value = true
  try {
    drafts.value = []
    draftsCursor.value = ''
    draftsHasNext.value = true
    const page = await api.getMyDrafts(draftsCursor.value)
    drafts.value = page.nodes
    draftsCursor.value = page.endCursor
    draftsHasNext.value = page.hasNextPage
  } catch (err) { message.error(resolveErrorMessage(err, '刷新草稿失败')) }
  finally { draftsLoading.value = false }
}

async function openDraft(draft: DraftArticle) {
  if (draft.documentId === documentId.value) return
  if (hasUnsavedChanges.value) { try { await performSaveDraft(true) } catch {} }
  try {
    const detail = await api.getMyDraftDetail(draft.documentId)
    suppressTracking.value = true
    try {
      documentId.value = detail.documentId; title.value = detail.title; body.value = detail.text
      for (const t of uploadTasks.value) URL.revokeObjectURL(t.previewUrl)
      uploadTasks.value = []
      if (detail.cover) {
        for (const c of detail.cover) uploadTasks.value.push({
          localId: `r_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
          filename: c.url.split('/').pop() || 'img', file: new File([], 'placeholder'),
          status: 'done', progress: 100, previewUrl: c.url, serverId: c.documentId || '', serverUrl: c.url
        })
      }
      syncSnapshot()
    } finally { suppressTracking.value = false }
  } catch (err) { message.error(resolveErrorMessage(err, '加载草稿失败')) }
}

const activeDraftId = ref<string | null>(null)

async function onDraftClick(draft: DraftArticle) {
  activeDraftId.value = draft.documentId
  await openDraft(draft)
}

watch(title, () => markDirty()); watch(body, () => markDirty())

onBeforeUnmount(() => {
  if (hasUnsavedChanges.value) performSaveDraft(true).catch(() => {})
  for (const t of uploadTasks.value) URL.revokeObjectURL(t.previewUrl)
})

if (auth.isLogin) loadDrafts()
</script>

<template>
  <section class="ik-create">
    <div class="ik-create__stripe" />
    <div class="ik-create__columns">
      <!-- Left: Drafts sidebar -->
      <aside class="ik-create__nav">
        <z-menu class="ik-create__menu" :model-value="documentId || '__editing__'">
          <z-menu-item name="__editing__" @click="resetEditor">
            <div class="ik-nav-item">{{ documentId ? '新建委托' : (title.trim() || '编辑委托') }}</div>
          </z-menu-item>
          <z-menu-item v-for="draft in drafts" :key="draft.documentId" :name="draft.documentId" @click="onDraftClick(draft)">
            <div class="ik-nav-item">
              <span class="ik-nav-item__title">{{ draft.title || '无标题' }}</span>
              <span class="ik-nav-item__meta">{{ (draft.text || '').slice(0, 40) || '无内容' }}</span>
            </div>
          </z-menu-item>
        </z-menu>
        <button v-if="draftsHasNext" class="ik-create__nav-loadmore" :disabled="draftsLoading" @click="loadDrafts">{{ draftsLoading ? '加载中' : '加载更多' }}</button>
      </aside>

      <!-- Right: Editor -->
      <main class="ik-create__panel">
        <div class="ik-create__panel-body">
          <!-- Title -->
          <div class="ik-create__title-row">
            <z-input v-model="title" class="ik-create__title-input" placeholder="请输入标题" maxlength="200" />
            <span class="ik-create__count">{{ title.length }}/200</span>
          </div>
          <!-- Body -->
          <div class="ik-create__section">
            <div class="ik-create__section-head">正文</div>
            <z-input v-model="body" type="textarea" class="ik-create__body-input" placeholder="请尽情发挥吧..." />
          </div>
          <!-- Images -->
          <div class="ik-create__section">
            <div class="ik-create__section-head">封面图片 {{ uploadTasks.length }}/{{ MAX_IMAGES }}</div>
            <div class="ik-cover-grid">
              <div v-for="(task, idx) in uploadTasks" :key="task.localId" class="ik-cover-thumb">
                <img :src="task.previewUrl" class="ik-cover-thumb__img" />
                <div v-if="task.status === 'uploading'" class="ik-cover-thumb__overlay">{{ task.progress }}%</div>
                <div v-if="idx === 0" class="ik-cover-thumb__primary">封面</div>
                <button class="ik-cover-thumb__remove" @click="removeUpload(idx)">✕</button>
              </div>
              <label v-if="uploadTasks.length < MAX_IMAGES" class="ik-cover-add">
                <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" multiple hidden @change="handleFileSelect(($event.target as HTMLInputElement).files!)" />
                <span>+</span>
              </label>
            </div>
          </div>
        </div>
      </main>
    </div>

    <!-- Footer -->
    <footer class="ik-create__footer">
      <div class="ik-create__footer-inner">
        <div />
        <div class="ik-create__footer-actions">
          <z-button v-if="documentId" type="danger" :disabled="isPublishing" @click="deleteDraft">删除草稿</z-button>
          <z-button :disabled="!canPublish" :loading="isPublishing" @click="publish">{{ isPublishing ? '发布中' : '发布委托' }}</z-button>
        </div>
      </div>
    </footer>
  </section>
</template>

<style scoped>
.ik-create { position: relative; width: min(1440px, calc(100% - 40px)); margin: 0 auto; padding: 20px 0 100px; min-height: calc(100vh - 80px); }
.ik-create__stripe { position: fixed; inset: 0; z-index: 0; pointer-events: none; background: repeating-linear-gradient(40deg, transparent, transparent 3.5px, rgba(255,255,255,0.09) 4.5px, rgba(255,255,255,0.09) 7.5px, transparent 8.5px); }
.ik-create__columns { position: relative; z-index: 1; display: grid; grid-template-columns: 230px 1fr; gap: 16px; }
.ik-create__nav { display: flex; flex-direction: column; gap: 8px; }
.ik-create__menu { flex: 1; min-height: 320px !important; }
.ik-create__menu :deep(.z-menu__item) { min-height: 56px; padding: 10px 16px; }
.ik-nav-item { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.ik-nav-item__title { font-size: 14px; font-weight: 900; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ik-nav-item__meta { font-size: 11px; font-weight: 700; color: #888; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ik-create__nav-loadmore { padding: 8px 10px; border: 1px dashed #2a2a2a; border-radius: 8px; background: transparent; color: #888; font-size: 12px; font-weight: 700; cursor: pointer; }
.ik-create__panel { padding: 4px; background: #2D2C2D; border-radius: 24px 0 24px 24px; overflow: hidden; }
.ik-create__panel-body { padding: 24px 26px 28px; background: url("/images/tab-bg-point.webp") repeat, linear-gradient(180deg, #0a0a0a 0%, #070707 100%); border: 4px solid #000; border-radius: 22px 0 22px 22px; display: flex; flex-direction: column; gap: 18px; }
.ik-create__title-row { display: flex; align-items: flex-end; gap: 12px; padding: 4px 2px 14px; border-bottom: 1px solid #1f1f1f; }
.ik-create__title-input { flex: 1; }
.ik-create__title-input :deep(.z-input) { border: none; background: transparent; }
.ik-create__title-input :deep(.z-input__inner) { color: #fff; font-size: 22px; font-weight: 900; height: auto; padding: 6px 0; border: none; }
.ik-create__title-input :deep(.z-input__inner::placeholder) { color: #4a4a4a; }
.ik-create__count { font-size: 11px; font-weight: 700; color: #888; }
.ik-create__section { display: flex; flex-direction: column; gap: 8px; }
.ik-create__section-head { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 900; color: #f0f0f0; }
.ik-create__body-input :deep(.z-textarea__inner) { color: #e0e0e0; min-height: 240px; border: 1px solid rgba(255,255,255,0.12); border-radius: 6px; background: #050505; padding: 16px; }
.ik-create__body-input :deep(.z-textarea__inner::placeholder) { color: #4a4a4a; }
.ik-cover-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 14px; }
.ik-cover-thumb { position: relative; aspect-ratio: 1/1; border-radius: 8px; overflow: hidden; border: 1px solid #2a2a2a; background: #1e1e1e; }
.ik-cover-thumb__img { width: 100%; height: 100%; object-fit: cover; }
.ik-cover-thumb__overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.6); color: #fff; font-size: 14px; font-weight: 900; }
.ik-cover-thumb__primary { position: absolute; left: 6px; top: 6px; padding: 2px 8px; border-radius: 999px; background: #d7ff00; color: #000; font-size: 10px; font-weight: 900; }
.ik-cover-thumb__remove { position: absolute; top: 6px; right: 6px; width: 24px; height: 24px; border: none; border-radius: 999px; background: rgba(0,0,0,0.7); color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; opacity: 0; transition: opacity 150ms; }
.ik-cover-thumb:hover .ik-cover-thumb__remove { opacity: 1; }
.ik-cover-add { display: flex; align-items: center; justify-content: center; aspect-ratio: 1/1; border-radius: 8px; border: 2px dashed #313132; background: #1e1e1e; cursor: pointer; color: #909090; font-size: 28px; transition: border-color 200ms, color 200ms; }
.ik-cover-add:hover { border-color: #d7ff00; color: #d7ff00; }
.ik-create__footer { position: fixed; bottom: 0; left: 0; right: 0; z-index: 50; background: #000; }
.ik-create__footer-inner { width: min(1440px, calc(100% - 40px)); margin: 0 auto; min-height: 78px; display: flex; align-items: center; justify-content: space-between; }
.ik-create__footer-actions { display: flex; gap: 12px; }
@media (max-width: 900px) { .ik-create__columns { grid-template-columns: 1fr; } .ik-create__nav { max-height: 200px; } }
@media (max-width: 500px) { .ik-create { width: 100%; padding: 0 0 100px; } .ik-create__columns { padding: 0 12px; } }
</style>
