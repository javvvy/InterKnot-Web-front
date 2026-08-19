<script setup lang="ts">
import { ref, reactive, computed, nextTick, onUnmounted } from 'vue'
import { useMessage } from 'zenless-ui'
import { useApi } from '@/composables/useApi'
import { useAuthStore } from '@/stores/auth'
import { useLoginDialog } from '@/composables/useLoginDialog'
import { resolveErrorMessage } from '@/utils/api-error'

const api = useApi()
const auth = useAuthStore()
const { visible, close } = useLoginDialog()
const message = useMessage()

const isRegister = ref(false)
const isLoading = ref(false)
const isCodeSent = ref(false)
const isSendingCode = ref(false)
const cooldown = ref(0)
let cooldownTimer: ReturnType<typeof setInterval> | null = null

const form = reactive({ email: '', code: '', password: '', confirmPassword: '' })

const modeTitle = computed(() => isRegister.value ? '注册' : '登录')

function stopCooldown() {
  if (cooldownTimer) { clearInterval(cooldownTimer); cooldownTimer = null }
}

function startCooldown(s: number) {
  stopCooldown()
  cooldown.value = Math.max(0, Math.floor(s))
  if (cooldown.value <= 0) return
  cooldownTimer = setInterval(() => {
    cooldown.value = Math.max(0, cooldown.value - 1)
    if (cooldown.value <= 0) stopCooldown()
  }, 1000)
}

function resetForm() {
  form.email = ''; form.code = ''; form.password = ''; form.confirmPassword = ''
  isRegister.value = false; isLoading.value = false; isCodeSent.value = false
  cooldown.value = 0; stopCooldown()
}

async function onLoginSuccess(token: string, user: any) {
  auth.setSession(token, user)
  resetForm()
  close()
  message.success(`登录成功，${user.nickName || user.userName || user.username || '欢迎回来'}`)
  try {
    const fullUser = await api.getSelfUser()
    auth.setSession(token, fullUser)
  } catch { /* 静默忽略，基本信息已存储 */ }
}

function validateRegisterBase() {
  if (!form.email.trim() || !form.password.trim()) throw new Error('请输入邮箱和密码')
  if (form.password !== form.confirmPassword) throw new Error('两次输入的密码不一致')
}

async function sendCode() {
  if (!form.email.trim()) { message.error('请先输入邮箱'); return }
  isSendingCode.value = true
  try {
    const res = await api.sendRegisterCode(form.email.trim())
    isCodeSent.value = true
    form.email = res.email
    startCooldown(res.cooldown)
    message.success('验证码已发送，请查收邮箱')
  } catch (err) { message.error(resolveErrorMessage(err, '发送验证码失败')) }
  finally { isSendingCode.value = false }
}

async function submit() {
  isLoading.value = true
  try {
    if (!isRegister.value) {
      if (!form.email.trim() || !form.password.trim()) throw new Error('请输入邮箱和密码')
      const res = await api.login(form.email.trim(), form.password.trim())
      if (!res.token) throw new Error('登录失败：未获取到 Token')
      await onLoginSuccess(res.token, res.user)
      return
    }
    validateRegisterBase()
    if (!form.code.trim()) throw new Error('请输入验证码')
    const res = await api.registerWithCode(form.email.trim(), form.code.trim(), form.password.trim())
    if (!res.token) throw new Error('注册失败：未获取到 Token')
    await onLoginSuccess(res.token, res.user)
  } catch (err) {
    message.error(resolveErrorMessage(err, isRegister.value ? '注册失败' : '登录失败'))
  } finally { isLoading.value = false }
}

function toggleMode() {
  isRegister.value = !isRegister.value
  isCodeSent.value = false
  form.code = ''
  form.password = ''
  form.confirmPassword = ''
  cooldown.value = 0
  stopCooldown()
}

function handleClose() { if (!isLoading.value) { resetForm(); close() } }

// -- Keyboard navigation --
const emailRef = ref<{ $el: HTMLElement } | null>(null)
const passwordRef = ref<{ $el: HTMLElement } | null>(null)
const confirmPasswordRef = ref<{ $el: HTMLElement } | null>(null)
const codeRef = ref<{ $el: HTMLElement } | null>(null)

function focusInput(ref: typeof emailRef) {
  nextTick(() => ref.value?.$el?.querySelector('input')?.focus())
}

function handleEnterEmail() { focusInput(passwordRef) }
function handleEnterPassword() { if (isRegister.value) focusInput(confirmPasswordRef); else submit() }
function handleEnterConfirmPassword() { focusInput(codeRef) }
function handleEnterCode() { submit() }

onUnmounted(() => stopCooldown())
</script>

<template>
  <Teleport to="body">
    <Transition name="ik-overlay">
      <div v-if="visible" class="ik-overlay" @mousedown.self="handleClose">
        <div class="ik-overlay__stripe" aria-hidden="true" />
        <div class="ik-dialog" @click.stop>
          <div class="ik-dialog__outer">
            <div class="ik-dialog__inner">
              <div class="ik-dialog__header">
                <span class="ik-dialog__title">{{ modeTitle }}</span>
                <button class="ik-dialog__close" aria-label="关闭" @click="handleClose">
                  <img src="/images/close-btn.webp" alt="关闭" class="ik-dialog__close-img" />
                </button>
              </div>
              <div class="ik-dialog__body">
                <div class="ik-login-form">
                  <z-input
                    ref="emailRef"
                    v-model="form.email"
                    :placeholder="isRegister ? '邮箱' : '用户名/邮箱'"
                    @keydown.enter="handleEnterEmail"
                  />

                  <z-input
                    ref="passwordRef"
                    v-model="form.password"
                    type="password"
                    placeholder="密码"
                    @keydown.enter="handleEnterPassword"
                  />

                  <div class="ik-login-field-grid" :class="{ 'is-open': isRegister }">
                    <div class="ik-login-field-grid__inner">
                      <z-input
                        ref="confirmPasswordRef"
                        v-model="form.confirmPassword"
                        type="password"
                        placeholder="确认密码"
                        @keydown.enter="handleEnterConfirmPassword"
                      />
                    </div>
                  </div>

                  <div class="ik-login-field-grid" :class="{ 'is-open': isRegister }">
                    <div class="ik-login-field-grid__inner">
                      <z-input
                        ref="codeRef"
                        v-model="form.code"
                        placeholder="验证码"
                        @keydown.enter="handleEnterCode"
                      >
                        <template #suffix>
                          <span class="ik-code-divider" />
                          <button
                            class="ik-code-send-btn"
                            :disabled="cooldown > 0 || isSendingCode"
                            @click.stop="sendCode"
                          >
                            {{ isSendingCode ? '发送中' : cooldown > 0 ? `${cooldown}s` : (isCodeSent ? '重新发送' : '发送') }}
                          </button>
                        </template>
                      </z-input>
                    </div>
                  </div>
                </div>

                <div class="ik-login-footer">
                  <z-button @click="toggleMode">{{ isRegister ? '返回登录' : '注册账号' }}</z-button>
                  <z-button
                    v-if="!isLoading"
                    :icon="{ success: '#00cc0d' }"
                    @click="submit"
                  >
                    {{ isRegister ? '注册' : '登录' }}
                  </z-button>
                  <z-button v-else loading>{{ isRegister ? '正在注册' : '正在登录' }}</z-button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ik-overlay {
  position: fixed; inset: 0; z-index: 9000;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

.ik-overlay__stripe {
  position: absolute; inset: 0; pointer-events: none;
  background: repeating-linear-gradient(
    40deg,
    transparent, transparent 3.5px,
    rgba(255, 255, 255, 0.09) 4.5px,
    rgba(255, 255, 255, 0.09) 7.5px,
    transparent 8.5px
  );
}

.ik-dialog { position: relative; width: 440px; max-width: 90%; }

.ik-dialog__outer {
  width: 100%; padding: 4px; background: #2D2C2D;
  border-radius: 24px 0 24px 24px; overflow: hidden;
}

.ik-dialog__inner {
  width: 100%; padding: 4px; background: #000;
  border-radius: 22px 0 22px 22px; overflow: hidden;
  display: flex; flex-direction: column;
}

.ik-dialog__header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px 12px 24px; flex-shrink: 0;
  border-radius: 18px 0 0 0;
  background: url("/images/tab-bg-point.webp") repeat,
    linear-gradient(180deg, #161616 0%, #080808 100%);
}

.ik-dialog__title { font-size: 18px; font-weight: 700; color: #fff; }

.ik-dialog__close {
  flex-shrink: 0; display: flex; align-items: center; justify-content: center;
  padding: 0; border: none; background: transparent; cursor: pointer;
  transition: opacity 140ms ease, transform 140ms ease;
}

.ik-dialog__close:hover { opacity: 0.85; transform: scale(1.08); }
.ik-dialog__close:active { transform: scale(0.95); }

.ik-dialog__close-img { height: 32px; width: auto; display: block; }

.ik-dialog__body { padding: 24px; background: #121212; border-radius: 0 0 18px 18px; }

.ik-login-form { display: flex; flex-direction: column; gap: 16px; }

.ik-login-form :deep(.z-input__inner:-webkit-autofill),
.ik-login-form :deep(.z-input__inner:-webkit-autofill:hover),
.ik-login-form :deep(.z-input__inner:-webkit-autofill:focus),
.ik-login-form :deep(.z-input__inner:-webkit-autofill:active) {
  -webkit-box-shadow: 0 0 0 1000px #1c1c1c inset !important;
  -webkit-text-fill-color: #fff !important;
  transition: background-color 5000s ease-in-out 0s;
  caret-color: #fff;
}

.ik-login-footer { display: flex; justify-content: flex-end; gap: 12px; margin-top: 20px; }

.ik-code-divider {
  display: inline-block; width: 1px; height: 18px;
  background: rgba(255, 255, 255, 0.2); margin: 0 8px; flex-shrink: 0;
}

.ik-code-send-btn {
  flex-shrink: 0; padding: 0; border: none; background: transparent;
  color: #d7ff00; font-size: 13px; font-weight: 700; white-space: nowrap;
  cursor: pointer; transition: opacity 140ms ease;
}

.ik-code-send-btn:hover:not(:disabled) { opacity: 0.8; }
.ik-code-send-btn:disabled { color: rgba(255, 255, 255, 0.3); cursor: not-allowed; }

/* Grid animation for register fields */
.ik-login-field-grid {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 300ms cubic-bezier(0.4, 0, 0.2, 1),
              opacity 300ms cubic-bezier(0.4, 0, 0.2, 1);
  opacity: 0;
}

.ik-login-field-grid.is-open { grid-template-rows: 1fr; opacity: 1; }
.ik-login-field-grid__inner { overflow: hidden; }

/* Transition */
.ik-overlay-enter-active { transition: background 80ms ease-out; }
.ik-overlay-enter-active .ik-dialog {
  transition: transform 250ms cubic-bezier(0.165, 0.84, 0.44, 1), opacity 200ms ease;
}
.ik-overlay-enter-from .ik-dialog { opacity: 0; transform: translateX(5%); }
.ik-overlay-leave-active { transition: background 160ms ease-out; }
.ik-overlay-leave-active .ik-dialog {
  transition: transform 200ms cubic-bezier(0.55, 0, 1, 0.45), opacity 180ms ease-in;
}
.ik-overlay-leave-to .ik-dialog { opacity: 0; transform: translateX(-5%); }

@media (max-width: 500px) { .ik-dialog { max-width: 100%; } }
</style>
