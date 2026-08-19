<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useMessage } from 'zenless-ui'
import { useApi } from '@/composables/useApi'
import { useAuthStore } from '@/stores/auth'
import { resolveErrorMessage } from '@/utils/api-error'

const props = defineProps<{
  currentName?: string
  currentBio?: string
  currentHidden?: boolean
  initialSub?: string
}>()

const emit = defineEmits<{
  close: []
  nameUpdated: [name: string]
  bioUpdated: [bio: string]
  hiddenUpdated: [hidden: boolean]
}>()

const api = useApi()
const auth = useAuthStore()
const router = useRouter()
const message = useMessage()

const sub = ref(props.initialSub || '')
const editName = ref(props.currentName || '')
const editBio = ref(props.currentBio || '')
const isHidden = ref(props.currentHidden || false)
const saving = ref(false)

function onKeydown(e: KeyboardEvent) { if (e.key === 'Escape') emit('close') }
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

async function saveName() {
  if (!editName.value.trim() || editName.value === props.currentName) return
  saving.value = true
  try { await api.updateMyName(editName.value.trim()); emit('nameUpdated', editName.value.trim()); sub.value = ''; message.success('昵称已更新') }
  catch (err) { message.error(resolveErrorMessage(err, '保存失败')) }
  finally { saving.value = false }
}

async function saveBio() {
  if (editBio.value === (props.currentBio || '')) return
  saving.value = true
  try { await api.updateMyBio(editBio.value); emit('bioUpdated', editBio.value); sub.value = ''; message.success('简介已更新') }
  catch (err) { message.error(resolveErrorMessage(err, '保存失败')) }
  finally { saving.value = false }
}

async function toggleVisibility() {
  const next = !isHidden.value
  isHidden.value = next
  try { await api.updateMyVisibility(next); emit('hiddenUpdated', next) }
  catch (err) { isHidden.value = !next; message.error(resolveErrorMessage(err, '设置失败')) }
}

async function logout() {
  auth.clearSession()
  emit('close')
  router.push('/')
  message.success('已退出登录')
}
</script>

<template>
  <Transition name="ik-overlay" appear>
    <div v-if="true" class="ik-overlay" @mousedown.self="emit('close')">
      <div class="ik-overlay__stripe" />
      <div class="ik-dialog" @click.stop>
        <div class="ik-dialog__outer">
          <div class="ik-dialog__inner">
            <div class="ik-dialog__header">
              <span class="ik-dialog__title">{{ sub === 'edit-name' ? '修改昵称' : sub === 'edit-bio' ? '修改简介' : sub === 'social' ? '隐私设置' : sub === 'avatar' ? '修改头像' : sub === 'banner' ? '修改名片' : '更多操作' }}</span>
              <button class="ik-dialog__close" @click="sub = sub ? '' : emit('close')"><img src="/images/close-btn.webp" alt="关闭" class="ik-dialog__close-img" /></button>
            </div>
            <div class="ik-dialog__body">
              <!-- Menu -->
              <div v-if="!sub" class="ik-settings-grid">
                <z-button @click="sub = 'edit-name'">修改昵称</z-button>
                <z-button @click="sub = 'edit-bio'">修改简介</z-button>
                <z-button @click="sub = 'social'">隐私设置</z-button>
                <z-button type="danger" @click="logout">退出登录</z-button>
              </div>
              <!-- Edit name -->
              <div v-else-if="sub === 'edit-name'" class="ik-settings-form">
                <z-input v-model="editName" placeholder="新昵称" maxlength="20" />
                <div class="ik-settings-form__btns">
                  <z-button @click="sub = ''">取消</z-button>
                  <z-button :loading="saving" @click="saveName">保存</z-button>
                </div>
              </div>
              <!-- Edit bio -->
              <div v-else-if="sub === 'edit-bio'" class="ik-settings-form">
                <div class="ik-settings-bio-wrap">
                  <z-input v-model="editBio" type="textarea" placeholder="个人简介" maxlength="200" />
                  <span class="ik-settings-bio-count">{{ editBio.length }}/200</span>
                </div>
                <div class="ik-settings-form__btns">
                  <z-button @click="sub = ''">取消</z-button>
                  <z-button :loading="saving" @click="saveBio">保存</z-button>
                </div>
              </div>
              <!-- Social / Privacy -->
              <div v-else-if="sub === 'social'" class="ik-settings-form">
                <div class="ik-settings-switch-row">
                  <span>公开个人资料</span>
                  <z-button :type="isHidden ? 'default' : 'primary'" @click="toggleVisibility">{{ isHidden ? '已隐藏' : '已公开' }}</z-button>
                </div>
              </div>
              <!-- Avatar / Banner placeholder -->
              <div v-else-if="sub === 'avatar' || sub === 'banner'" class="ik-settings-form">
                <p style="color:#888;text-align:center">该功能即将上线</p>
                <div class="ik-settings-form__btns">
                  <z-button @click="sub = ''">返回</z-button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.ik-overlay { position: fixed; inset: 0; z-index: 9100; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.7); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
.ik-overlay__stripe { position: absolute; inset: 0; pointer-events: none; background: repeating-linear-gradient(40deg, transparent, transparent 3.5px, rgba(255,255,255,0.09) 4.5px, rgba(255,255,255,0.09) 7.5px, transparent 8.5px); }
.ik-dialog { position: relative; width: 450px; max-width: 90%; }
.ik-dialog__outer { width: 100%; padding: 4px; background: #2D2C2D; border-radius: 24px 0 24px 24px; overflow: hidden; }
.ik-dialog__inner { width: 100%; padding: 4px; background: #000; border-radius: 22px 0 22px 22px; overflow: hidden; }
.ik-dialog__header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px 12px 24px; background: url("/images/tab-bg-point.webp") repeat, linear-gradient(180deg, #161616 0%, #080808 100%); border-radius: 18px 0 0 0; }
.ik-dialog__title { font-size: 18px; font-weight: 700; color: #fff; }
.ik-dialog__close { display: flex; align-items: center; justify-content: center; padding: 0; border: none; background: transparent; cursor: pointer; }
.ik-dialog__close-img { height: 32px; }
.ik-dialog__body { padding: 24px; background: #121212; border-radius: 0 0 18px 18px; }
.ik-settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.ik-settings-form { display: flex; flex-direction: column; gap: 16px; }
.ik-settings-form__btns { display: flex; justify-content: flex-end; gap: 12px; }
.ik-settings-bio-wrap { position: relative; }
.ik-settings-bio-count { position: absolute; right: 8px; bottom: 8px; font-size: 11px; font-weight: 700; color: #888; }
.ik-settings-switch-row { display: flex; align-items: center; justify-content: space-between; color: #e0e0e0; font-size: 15px; }
.ik-overlay-enter-active { transition: background 80ms ease-out; }
.ik-overlay-enter-active .ik-dialog { transition: transform 250ms cubic-bezier(0.165, 0.84, 0.44, 1), opacity 200ms ease; }
.ik-overlay-enter-from .ik-dialog { opacity: 0; transform: translateX(5%); }
.ik-overlay-leave-active { transition: background 160ms ease-out; }
.ik-overlay-leave-active .ik-dialog { transition: transform 200ms cubic-bezier(0.55, 0, 1, 0.45), opacity 180ms ease-in; }
.ik-overlay-leave-to .ik-dialog { opacity: 0; transform: translateX(-5%); }
</style>
