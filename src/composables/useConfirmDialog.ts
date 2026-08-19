import { reactive } from 'vue'

interface ConfirmState {
  visible: boolean
  title: string
  message: string
  confirmText: string
  cancelText: string
  danger: boolean
  resolve: ((value: boolean) => void) | null
}

const state = reactive<ConfirmState>({
  visible: false,
  title: '',
  message: '',
  confirmText: '确定',
  cancelText: '取消',
  danger: false,
  resolve: null,
})

interface ConfirmOptions {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
}

export function useConfirmDialog() {
  function open(options: ConfirmOptions): Promise<boolean> {
    state.title = options.title
    state.message = options.message
    state.confirmText = options.confirmText || '确定'
    state.cancelText = options.cancelText || '取消'
    state.danger = options.danger || false
    state.visible = true
    return new Promise((resolve) => {
      state.resolve = resolve
    })
  }

  function confirm() {
    state.resolve?.(true)
    state.visible = false
  }

  function cancel() {
    state.resolve?.(false)
    state.visible = false
  }

  return { state, open, confirm, cancel }
}
