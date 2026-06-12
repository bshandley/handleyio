// One-off: capture public/og.png (1200x630) from the local preview build.
// Usage: npm run build && npm run preview -- --port 4173 --strictPort &
//        node scripts/capture-og.mjs
import { chromium } from '@playwright/test'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' })
// let the galaxy render and the pre-sheared arms settle visually
await page.waitForTimeout(4000)
await page.screenshot({ path: 'public/og.png' })
await browser.close()
console.log('wrote public/og.png')
