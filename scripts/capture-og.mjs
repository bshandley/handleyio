// One-off: capture public/og.png (1200x630) from the local preview build.
// Usage: npm run build && npm run preview -- --port 4173 --strictPort &
//        node scripts/capture-og.mjs
import { chromium } from '@playwright/test'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
// The capture never depends on the network: stub the live GitHub data so a
// rate limit or an offline run can't change the card.
await page.route('https://api.github.com/**', (route) => route.fulfill({ json: [] }))
// The first-visit hint must not appear on the social card.
await page.addInitScript(() => localStorage.setItem('handleyio:hint-seen', '1'))
// Pin level 0: headless Chromium otherwise starts at a lower quality level
// and the governor steps it down further within seconds, since software GL
// is slow, so an unpinned capture would show a degraded scene.
await page.goto('http://localhost:4173/?level=0', { waitUntil: 'networkidle' })
// let the first frames render
await page.waitForTimeout(4000)
await page.screenshot({ path: 'public/og.png' })
await browser.close()
console.log('wrote public/og.png')
