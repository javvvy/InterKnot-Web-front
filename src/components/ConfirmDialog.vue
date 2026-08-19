<script setup lang="ts">
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import { onMounted, onBeforeUnmount } from 'vue'

const { state, confirm, cancel } = useConfirmDialog()

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') cancel()
}

onMounted(() => { window.addEventListener('keydown', onKeydown) })
onBeforeUnmount(() => { window.removeEventListener('keydown', onKeydown) })
</script>

<template>
  <Teleport to="body">
    <Transition name="ik-overlay">
      <div v-if="state.visible" class="ik-overlay" @mousedown.self="cancel">
        <div class="ik-overlay__stripe" />
        <div class="ik-dialog" @click.stop>
          <div class="ik-dialog__outer">
            <div class="ik-dialog__inner">
              <div class="ik-dialog__header">
                <span class="ik-dialog__title">{{ state.title }}</span>
                <button class="ik-dialog__close" @click="cancel">
                  <img src="/images/close-btn.webp" alt="关闭" class="ik-dialog__close-img" />
                </button>
              </div>
              <div class="ik-dialog__body">
                <p class="ik-confirm-msg">{{ state.message }}</p>
              </div>
              <div class="ik-dialog__footer">
                <z-button @click="cancel">{{ state.cancelText }}</z-button>
                <z-button :type="state.danger ? 'danger' : 'primary'" @click="confirm">{{ state.confirmText }}</z-button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ik-overlay { position: fixed; inset: 0; z-index: 9100; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.7); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
.ik-overlay__stripe { position: absolute; inset: 0; pointer-events: none; background: repeating-linear-gradient(40deg, transparent, transparent 3.5px, rgba(255,255,255,0.09) 4.5px, rgba(255,255,255,0.09) 7.5px, transparent 8.5px); }
.ik-dialog { position: relative; width: 400px; max-width: 90%; }
.ik-dialog__outer { width: 100%; padding: 4px; background: #2D2C2D; border-radius: 24px 0 24px 24px; overflow: hidden; }
.ik-dialog__inner { width: 100%; padding: 4px; background: #000; border-radius: 22px 0 22px 22px; overflow: hidden; }
.ik-dialog__header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px 12px 24px; background: url("/images/tab-bg-point.webp") repeat, linear-gradient(180deg, #161616 0%, #080808 100%); border-radius: 18px 0 0 0; }
.ik-dialog__title { font-size: 18px; font-weight: 700; color: #fff; }
.ik-dialog__close { display: flex; align-items: center; justify-content: center; padding: 0; border: none; background: transparent; cursor: pointer; }
.ik-dialog__close-img { height: 32px; width: auto; display: block; }
.ik-dialog__body { padding: 24px; background: #121212; }
.ik-confirm-msg { margin: 0; font-size: 15px; color: #e0e0e0; line-height: 1.6; }
.ik-dialog__footer { display: flex; justify-content: flex-end; gap: 12px; padding: 0 24px 20px; background: #121212; border-radius: 0 0 18px 18px; }
.ik-overlay-enter-active { transition: background 80ms ease-out; }
.ik-overlay-enter-active .ik-dialog { transition: transform 250ms cubic-bezier(0.165, 0.84, 0.44, 1), opacity 200ms ease; }
.ik-overlay-enter-from .ik-dialog { opacity: 0; transform: translateX(5%); }
.ik-overlay-leave-active { transition: background 160ms ease-out; }
.ik-overlay-leave-active .ik-dialog { transition: transform 200ms cubic-bezier(0.55, 0, 1, 0.45), opacity 180ms ease-in; }
.ik-overlay-leave-to .ik-dialog { opacity: 0; transform: translateX(-5%); }
</style>
