// Tuning aid: capture the level-0 scene at a fixed camera for side-by-side
// comparisons. Usage (preview server on 4173):
//   node scripts/capture-look.mjs out/agx.png "tone=agx&exposure=0.85"
//   node scripts/capture-look.mjs out/neutral.png "tone=neutral&exposure=1.0"
// A third argument "zoom" dollies to the closest allowed distance first;
// "top" drags the camera up over the disc so the spiral can be judged from
// overhead. A fourth argument, seconds, waits that long after load (sim
// time keeps advancing) before the pose and screenshot, for stability
// checks well past the idle-drift settle window.
import { chromium } from '@playwright/test'

const [, , out = 'look.png', params = '', pose = '', waitSeconds = ''] = process.argv
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
await page.route('https://api.github.com/**', (route) => route.fulfill({ json: [] }))
await page.goto(`http://localhost:4173/?level=0&${params}`, { waitUntil: 'networkidle' })
await page.waitForTimeout(6000)
const extraMs = Number(waitSeconds) > 0 ? Number(waitSeconds) * 1000 : 0
if (extraMs > 0) await page.waitForTimeout(extraMs)
if (pose === 'zoom') {
  for (let i = 0; i < 12; i++) {
    await page.mouse.wheel(0, -400)
    await page.waitForTimeout(80)
  }
  await page.waitForTimeout(2500)
} else if (pose === 'top') {
  const steps = 25
  await page.mouse.move(800, 450)
  await page.mouse.down()
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(800, 450 - (350 * i) / steps)
  }
  await page.mouse.up()
  await page.waitForTimeout(2500)
}
await page.screenshot({ path: out })
await browser.close()
console.log(`wrote ${out}`)
