/**
 * 全局 body 滚动锁引用计数管理器。
 * 多个 overlay（敲敲、帖子、登录弹窗）共享同一套锁，解决冲突。
 */

let lockCount = 0
let savedOverflow = ""

export function useBodyScrollLock() {
  const acquire = (_token?: unknown) => {
    if (lockCount === 0) {
      savedOverflow = document.body.style.overflow
      document.body.style.overflow = "hidden"
    }
    lockCount++
  }

  const release = (_token?: unknown) => {
    lockCount = Math.max(0, lockCount - 1)
    if (lockCount === 0) {
      document.body.style.overflow = savedOverflow
    }
  }

  return { acquire, release }
}
