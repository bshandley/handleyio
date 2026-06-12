import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    port: 4173,
    reuseExistingServer: !process.env.CI,
  },
  use: { baseURL: 'http://localhost:4173' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: /mobile/ },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        launchOptions: {
          // GPU-less CI runners blocklist WebGL; force software GL (mesa).
          firefoxUserPrefs: { 'webgl.force-enabled': true },
        },
      },
      testIgnore: /mobile/,
    },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] }, testMatch: /mobile/ },
    { name: 'mobile-webkit', use: { ...devices['iPhone 13'] }, testMatch: /mobile/ },
  ],
})
