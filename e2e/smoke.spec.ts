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

test('identity and meta are present', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle('Bradley Handley · handley.io')
  await expect(page.locator('#wordmark .id-name')).toHaveText('Bradley Handley')
  await expect(page.locator('#wordmark .id-line')).toContainText('Perpetually tired')
  expect(await page.locator('meta[property="og:image"]').getAttribute('content')).toBe(
    'https://handley.io/og.png',
  )
  const ld = JSON.parse(await page.locator('script[type="application/ld+json"]').innerText())
  expect(ld['@type']).toBe('Person')
  expect(ld.name).toBe('Bradley Handley')
})

test('first-visit hint shows once and never returns', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.hud-hint')).toHaveClass(/open/, { timeout: 5000 })
  await expect(page.locator('.hud-hint')).toContainText('MANUAL CONTROL', { timeout: 5000 })
  // a real drag dismisses it
  await page.mouse.move(600, 300)
  await page.mouse.down()
  await page.mouse.move(680, 300, { steps: 5 })
  await page.mouse.up()
  await expect(page.locator('.hud-hint')).not.toBeAttached({ timeout: 2000 })
  // reload: flag set, hint stays away
  await page.reload()
  await page.waitForTimeout(3500)
  await expect(page.locator('.hud-hint')).not.toBeAttached()
})

test('renders through the direct path when float targets are unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    const original = WebGL2RenderingContext.prototype.getExtension
    WebGL2RenderingContext.prototype.getExtension = function (name: string) {
      if (name === 'EXT_color_buffer_float' || name === 'EXT_color_buffer_half_float') return null
      return original.call(this, name)
    }
  })
  await page.goto('/')
  await expect(page.locator('#fallback')).toBeHidden()
  expect(await page.evaluate(() => window.__renderPath)).toBe('direct')
  const frames = async () => page.evaluate(() => window.__frameCount ?? 0)
  const before = await frames()
  await expect.poll(frames, { timeout: 5000 }).toBeGreaterThan(before)
})

test('telemetry draw count covers the whole frame on the hdr path', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#app canvas')).toBeVisible()
  const path = await page.evaluate(() => window.__renderPath)
  test.skip(path !== 'hdr', 'software GL without float color buffers')
  const drawCount = async () => {
    const text = await page.locator('.hud-tele-tr .hud-tele-line').nth(2).textContent()
    return Number((text ?? '').replace(/\D/g, ''))
  }
  // floor scene: background, deep field, two star halves, one beacon mesh = 5
  // draw calls; the composer's output and finish passes push the full-frame
  // count to 7, which a per-pass reset would not show.
  await expect.poll(drawCount, { timeout: 5000 }).toBeGreaterThanOrEqual(7)
})

test('beacon tags label every node on desktop', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#app canvas')).toBeVisible()
  await expect(page.locator('.hud-tag')).toHaveCount(5)
  await expect(page.locator('.hud-tag', { hasText: 'GH-01' })).toBeVisible()
})

test('the first-visit hint sits in the lower third', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.hud-hint')).toHaveClass(/open/, { timeout: 5000 })
  const box = await page.locator('.hud-hint').boundingBox()
  const height = await page.evaluate(() => innerHeight)
  expect(box!.y).toBeGreaterThan(height * 0.66)
})

test('the camera stays at least 12 degrees off the galactic plane', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#app canvas')).toBeVisible()
  const inclination = async () => {
    const text = await page.locator('.hud-tele-br .hud-tele-line').nth(1).textContent()
    return Number((text ?? '').replace(/\D/g, ''))
  }
  // drag far downward: the camera rises toward the pole; then far upward: it dives under the plane
  await page.mouse.move(800, 200)
  await page.mouse.down()
  await page.mouse.move(800, 900, { steps: 30 })
  await page.mouse.up()
  await page.waitForTimeout(800)
  expect(await inclination()).toBeGreaterThanOrEqual(12)
  await page.mouse.move(800, 800)
  await page.mouse.down()
  await page.mouse.move(800, 0, { steps: 40 })
  await page.mouse.up()
  await page.waitForTimeout(800)
  const inc = await inclination()
  expect(inc).toBeGreaterThanOrEqual(12)
  expect(inc).toBeLessThanOrEqual(168)
})
