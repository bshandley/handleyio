import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('https://api.github.com/**', (route) => route.fulfill({ json: [] }))
})

test('tapping a beacon opens its panel', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#app canvas')).toBeVisible()
  const pos = await page.evaluate(() =>
    (window as unknown as Record<string, (id: string) => { x: number; y: number }>)
      .__nodeScreen('github'),
  )
  await page.touchscreen.tap(pos.x, pos.y)
  await expect(page.locator('.hud-panel')).toHaveClass(/open/)
  await expect(page.locator('.hud-title')).toHaveText('GITHUB')
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
