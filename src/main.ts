import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ZenlessUI from 'zenless-ui'
import 'zenless-ui/index.css'
import './assets/styles/theme.css'
import App from './App.vue'
import router from './router'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(ZenlessUI, { isBold: true, isItalic: true })
app.mount('#app')

// 移除 SPA 加载屏（避免生产环境下 JS 挂载早于 GIF 解码导致 loading 屏一闪而过）
const loadingScreen = document.getElementById('spa-loading-screen')
if (loadingScreen) {
  loadingScreen.style.opacity = '0'
  loadingScreen.style.transition = 'opacity 0.3s ease-out'
  setTimeout(() => loadingScreen.remove(), 350)
}
