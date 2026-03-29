import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // 關鍵：這會強制將 PWA 功能注入你的網站
      includeAssets: ['favicon.ico', 'pwa-192x192.png', 'pwa-512x512.png'],
      manifest: {
        name: '移工母語急救指引',
        short_name: '母語急救',
        description: '即時母語急救指引與 CPR 節奏器',
        theme_color: '#ff4444',
        background_color: '#ffffff',
        display: 'standalone', // 這是讓網址列消失的關鍵！
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable' // 讓圖標在 Android 上能適應圓形或方形
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ]
})