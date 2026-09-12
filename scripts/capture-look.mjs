// Tuning aid: capture the level-0 scene at a fixed camera for side-by-side
// comparisons. Usage (preview server on 4173):
//   node scripts/capture-look.mjs out/agx.png "tone=agx&exposure=0.85"
//   node scripts/capture-look.mjs out/neutral.png "tone=neutral&exposure=1.0"
// A third argument "zoom" dollies to the closest allowed distance first.
import { chromium } from '@playwright/test'

const [, , out = 'look.png', params = '', pose = ''] = process.argv
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
await page.route('https://api.github.com/**', (route) => route.fulfill({ json: [] }))
await page.goto(`http://localhost:4173/?level=0&${params}`, { waitUntil: 'networkidle' })
await page.waitForTimeout(6000)
if (pose === 'zoom') {
  for (let i = 0; i < 12; i++) {
    await page.mouse.wheel(0, -400)
    await page.waitForTimeout(80)
  }
  await page.waitForTimeout(2500)
}
await page.screenshot({ path: out })
await browser.close()
console.log(`wrote ${out}`)
