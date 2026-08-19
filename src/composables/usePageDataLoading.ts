import { ref } from 'vue'

const isActive = ref(false)
const progress = ref(0)
const isClaimed = ref(false)
let timer: ReturnType<typeof setInterval> | null = null

export function usePageDataLoading() {
  function start() {
    isActive.value = true
    progress.value = 10
    isClaimed.value = false
    timer = setInterval(() => {
      if (progress.value < 90) progress.value += 3
    }, 200)
  }

  function claim() {
    isClaimed.value = true
  }

  function finish() {
    if (timer) clearInterval(timer)
    progress.value = 100
    setTimeout(() => {
      isActive.value = false
      progress.value = 0
      isClaimed.value = false
    }, 350)
  }

  return { isActive, progress, isClaimed, start, claim, finish }
}
