import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('https://api.github.com/**', (route) => {
    // Slim payload shape, matching the unauthenticated public events API
    const events = [
      {
        type: 'PushEvent',
        created_at: new Date(Date.now() - 3_600_000).toISOString(),
        payload: { push_id: 1, ref: 'refs/heads/main' },
      },
      {
        type: 'PushEvent',
        created_at: new Date(Date.now() - 7_200_000).toISOString(),
        payload: { push_id: 2, ref: 'refs/heads/main' },
      },
    ]
    return route.fulfill({ json: events })
  })
})

test('renders the galaxy and hides the fallback', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#app canvas')).toBeVisible()
  await expect(page.locator('#fallback')).toBeHidden()
  const frames = async () => page.evaluate(() => window.__frameCount ?? 0)
  const before = await frames()
  await expect.poll(frames, { timeout: 5000 }).toBeGreaterThan(before)
})

test('keyboard opens each node panel', async ({ page }) => {
  await page.goto('/')
  for (const label of ['GITHUB', 'EMAIL', 'LINKEDIN', 'PLINY', 'GATEHOUSE']) {
    await page.getByRole('button', { name: label }).focus()
    await expect(page.locator('.hud-panel')).toHaveClass(/open/)
    await expect(page.locator('.hud-title')).toHaveText(label)
  }
  await page.keyboard.press('Escape')
  await expect(page.locator('.hud-panel')).not.toHaveClass(/open/)
})

test('github panel shows live push data', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'GITHUB' }).focus()
  await expect(page.locator('.hud-panel')).toContainText('2 pushes')
  await expect(page.locator('.hud-panel')).toContainText('last push: 1h ago')
})

test('chevron navigation closes the open panel, then opens the target', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'GITHUB' }).focus()
  await expect(page.locator('.hud-panel')).toHaveClass(/open/)
  await page.getByRole('button', { name: 'Next node' }).click()
  await expect(page.locator('.hud-panel')).not.toHaveClass(/open/)
  await expect(page.locator('.hud-panel')).toHaveClass(/open/, { timeout: 8000 })
})

test('no panel opens without user interaction', async ({ page }) => {
  // Wide viewport puts pliny inside the focus zone at load (BRA-62);
  // focus auto-open must stay quiet while camera motion is not user-driven.
  await page.setViewportSize({ width: 2200, height: 1000 })
  await page.goto('/')
  await expect(page.locator('#app canvas')).toBeVisible()
  await page.waitForTimeout(3000)
  await expect(page.locator('.hud-panel')).not.toHaveClass(/open/)
})

test('a stationary press does not open a panel', async ({ page }) => {
  // Pointerdown alone fires OrbitControls "start"; without pointer travel
  // it must not count as camera rotation, or the first click pops the
  // centered node's panel open on mousedown (BRA-63).
  await page.setViewportSize({ width: 2200, height: 1000 })
  await page.goto('/')
  await expect(page.locator('#app canvas')).toBeVisible()
  await page.mouse.move(200, 200)
  await page.mouse.down()
  await page.waitForTimeout(500)
  await expect(page.locator('.hud-panel')).not.toHaveClass(/open/)
  await page.mouse.up()
  await page.waitForTimeout(500)
  await expect(page.locator('.hud-panel')).not.toHaveClass(/open/)
})

test('clicking a beacon opens its panel', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#app canvas')).toBeVisible()
  const pos = await page.evaluate(() => window.__nodeScreen!('github'))
  await page.mouse.click(pos.x, pos.y)
  await expect(page.locator('.hud-panel')).toHaveClass(/open/)
  await expect(page.locator('.hud-title')).toHaveText('GITHUB')
})

test('fallback shows when webgl is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    // @ts-expect-error override for test
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (type === 'webgl' || type === 'webgl2') return null
      return original.call(this, type, ...args)
    }
  })
  await page.goto('/')
  await expect(page.locator('#fallback')).toBeVisible()
  await expect(page.locator('#fallback .glass-card').first()).toHaveAttribute(
    'href',
    'https://github.com/bshandley',
  )
})
