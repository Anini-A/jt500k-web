import type { CapacitorConfig } from '@capacitor/cli'

// The native shell loads the LIVE deployed site (so the app is always up to date and
// nothing about the web app changes). Swap `server.url` for your custom domain if you have one.
const config: CapacitorConfig = {
  appId: 'com.journey500k.app',
  appName: 'Journey 500K',
  webDir: 'capacitor-www',
  server: {
    url: 'https://jt500k-web.vercel.app',
    // allow the WKWebView to load our own https origin
    allowNavigation: ['jt500k-web.vercel.app', '*.vercel.app'],
  },
  ios: {
    contentInset: 'never',       // we handle safe areas in CSS (env(safe-area-inset-*))
    backgroundColor: '#f9f9f7',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,      // we hide it from JS once the app is ready
      backgroundColor: '#f9f9f7',
    },
  },
}

export default config
