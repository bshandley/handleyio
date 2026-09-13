import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('https://api.github.com/**', (route) => route.fulfill({ json: [] }))
})

test('tapping a beacon opens its panel', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#app canvas')).toBeVisible()
  const ids = ['github', 'email', 'linkedin', 'pliny', 'gatehouse']
  const target = await page.evaluate((ids) => {
    const nodeScreen = (
      window as unknown as Record<string, (id: string) => { x: number; y: number }>
    ).__nodeScreen
    const cx = innerWidth / 2
    const cy = innerHeight / 2
    let best: { id: string; x: number; y: number; d: number } | null = null
    for (const id of ids) {
      const { x, y } = nodeScreen(id)
      if (x <= 0 || x >= innerWidth || y <= 0 || y >= innerHeight) continue
      const d = Math.hypot(x - cx, y - cy)
      if (!best || d < best.d) best = { id, x, y, d }
    }
    return best
  }, ids)
  if (!target) throw new Error('no beacon projected on screen at load')
  await page.touchscreen.tap(target.x, target.y)
  await expect(page.locator('.hud-panel')).toHaveClass(/open/)
  await expect(page.locator('.hud-title')).toHaveText(target.id.toUpperCase())
})

test('chevron navigation works by touch', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#app canvas')).toBeVisible()
  await page.getByRole('button', { name: 'Next node' }).tap()
  await expect(page.locator('.hud-panel')).toHaveClass(/open/, { timeout: 8000 })
})

test('identity block and links are present on a small viewport', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#wordmark .id-name')).toBeVisible()
  // every node reachable: chevron through all five
  for (let i = 0; i < 5; i++) {
    await page.getByRole('button', { name: 'Next node' }).tap()
    await expect(page.locator('.hud-panel')).toHaveClass(/open/, { timeout: 8000 })
  }
})

test('beacon tags stay hidden on phones', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#app canvas')).toBeVisible()
  await expect(page.locator('.hud-tag').first()).toBeHidden()
})
