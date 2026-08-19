import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'

const zzzuiPackages = fileURLToPath(new URL('../zenless-ui/packages', import.meta.url))
const zzzuiSrc = fileURLToPath(new URL('../zenless-ui/src', import.meta.url))

export default defineConfig({
  plugins: [vue()],
  server: {
    fs: {
      allow: [
        // 项目根目录
        fileURLToPath(new URL('.', import.meta.url)),
        // zenless-ui 外部依赖目录
        fileURLToPath(new URL('../zenless-ui', import.meta.url)),
      ],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
        ws: true,
      },
      '/dm/socket': {
        target: 'ws://localhost:8080',
        changeOrigin: true,
        ws: true,
      },
      '/cover': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/avatar': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'zenless-ui': zzzuiPackages,
      '@src': zzzuiSrc,
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: `@import 'zenless-ui/theme/var.scss';\n`,
        silenceDeprecations: ['import', 'global-builtin'],
      },
    },
  },
  optimizeDeps: {
    include: [
      '@vueuse/core',
      '@heroicons/vue/24/outline',
      '@heroicons/vue/24/solid',
      'isomorphic-dompurify',
      'markdown-it',
      'throttle-debounce',
    ],
  },
})
