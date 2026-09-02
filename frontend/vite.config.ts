import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

/** NestJS route prefixes — dev proxy sends these to the backend so a single
 * forwarded port (5173) is enough when previewing in Cursor/browser.
 * Prefixes that also exist as React Router pages must bypass the proxy for
 * browser navigations (Accept: text/html) so the SPA can render them. */
const API_PROXY_PREFIXES = [
  'auth',
  'search',
  'bookings',
  'manage-booking',
  'my',
  'agency-portal',
  'settings',
  'site-content',
  'blog',
  'contact',
  'careers',
  'survey',
  'flight-status',
  'club',
  'customers',
  'flights',
  'flightops',
  'reservation',
  'pricing',
  'refunds',
  'agencies',
  'ancillary-services',
  'cartable',
  'referrals',
  'manager-messages',
  'files',
  'reporting',
  'passenger-reports',
  'staff-reports',
  'panels',
  'admins',
  'audit',
  'it',
  'support-tickets',
  'notifications',
  'identity-verifications',
  'reconciliation',
  'webservice',
  'health',
  'docs',
] as const

/** SPA paths that share a prefix with NestJS APIs (e.g. `/careers` page vs
 * `/careers/jobs` API). HTML navigations for these must not be proxied. */
const SPA_OVERLAPPING_PREFIXES = new Set([
  'careers',
  'club',
  'blog',
  'contact',
  'flight-status',
  'manage-booking',
  'survey',
  'support',
])

function shouldBypassProxyForSpa(
  prefix: string,
  req: { headers: { accept?: string }; url?: string },
): string | undefined {
  if (!SPA_OVERLAPPING_PREFIXES.has(prefix)) return undefined
  const accept = req.headers.accept ?? ''
  if (accept.includes('text/html')) return req.url
  return undefined
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  /** Override when backend PORT ≠ 3000 (see frontend/.env.example). */
  const apiProxyTarget = env.VITE_DEV_API_PROXY || 'http://127.0.0.1:3000'

  const devProxy = Object.fromEntries(
    API_PROXY_PREFIXES.map((prefix) => [
      `/${prefix}`,
      {
        target: apiProxyTarget,
        changeOrigin: true,
        bypass: (req: { headers: { accept?: string }; url?: string }) =>
          shouldBypassProxyForSpa(prefix, req),
      },
    ]),
  )

  return {
    // Keep Vite's disposable dependency cache outside node_modules. On Windows
    // the package manager or an earlier preview can keep node_modules/.vite
    // files locked, which otherwise prevents the local frontend from starting.
    cacheDir: '.vite-cache',
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      // Cloudflare quick tunnels / Cursor port previews send a non-localhost Host.
      allowedHosts: true,
      proxy: devProxy,
    },
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'blujet',
        short_name: 'blujet',
        description: 'بلوجت — رزرو بلیط هواپیما',
        theme_color: '#1668c4',
        background_color: '#0d2640',
        display: 'standalone',
        start_url: '/',
        dir: 'rtl',
        lang: 'fa',
        icons: [
          { src: 'icon.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-maskable.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell only — API responses (availability, prices, bookings) must
        // always be fresh, never served from the service worker cache.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [],
        // The application shell currently exceeds Workbox's conservative
        // 2 MiB default; API responses remain excluded from runtime caching.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
      }),
    ],
  }
})
