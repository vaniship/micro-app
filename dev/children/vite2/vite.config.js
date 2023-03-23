import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
// import legacy from '@vitejs/plugin-legacy'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver, AntDesignVueResolver, NaiveUiResolver } from 'unplugin-vue-components/resolvers'
import ElementPlus from 'unplugin-element-plus/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    // legacy({
    //   targets: ['Chrome >= 59']
    // }),
    vue(),
    AutoImport({
      resolvers: [
        ElementPlusResolver(),
        // AntDesignVueResolver(), // need it?
      ],
      imports: [
        'vue',
        {
          'naive-ui': [
            'useDialog',
            'useMessage',
            'useNotification',
            'useLoadingBar'
          ]
        }
      ]
    }),
    Components({
      resolvers: [
        ElementPlusResolver(),
        AntDesignVueResolver(),
        NaiveUiResolver(),
      ],
    }),
    ElementPlus()
  ],
  server: {
    port: 7001,
    proxy: {
      '/sugrec': {
        target: 'https://www.baidu.com',
        secure: false,
        changeOrigin: true,
      }
    }
  },
  build: {
    outDir: 'vite2',
  },
  clearScreen: false,
  base: `${process.env.NODE_ENV === 'production' ? 'https://zeroing.jd.com' : ''}/micro-app/vite2/`,
})
