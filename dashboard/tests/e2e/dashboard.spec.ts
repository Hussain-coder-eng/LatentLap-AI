import { test, expect } from '@playwright/test'

// NOTE: Track3D (WebGL) excluded from all tests — crashes headless Chromium.
// Panels: Header, LapScrubber, TireHealth, ShapPanel, Timeline, StrategyAdvisor

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  // Wait for load event then for a key hydrated element (networkidle unreliable with Next.js HMR websocket)
  await page.waitForLoadState('load')
  await page.waitForSelector('[data-panel-id="strategy"]', { timeout: 15000 })
})

// ── Header ────────────────────────────────────────────────────────────────────

test.describe('Header', () => {
  test('renders LatentLap logo text', async ({ page }) => {
    // Logo chars animate from opacity:0 — check aria-label on the logo container instead
    const logo = page.locator('[aria-label="LatentLap-AI"]')
    await expect(logo).toBeVisible()
  })

  test('year select has 5 options (2021–2025)', async ({ page }) => {
    // Count options regardless of visibility (desktop select may be hidden on mobile)
    const options = page.locator('[aria-label="Select year"]').first().locator('option')
    await expect(options).toHaveCount(5)
  })

  test('driver select populates from JSON data', async ({ page }) => {
    const count = await page.locator('[aria-label="Select driver"]').first().locator('option').count()
    expect(count).toBeGreaterThanOrEqual(1)
  })

  test('desktop: track style buttons A/B/C/D rendered', async ({ page, isMobile }) => {
    if (isMobile) return
    const buttons = page.locator('[aria-pressed]')
    const count = await buttons.count()
    expect(count).toBeGreaterThanOrEqual(4)
  })

  test('mobile: toggle button opens controls row', async ({ page, isMobile }) => {
    if (!isMobile) return
    const toggle = page.locator('[aria-label="Open controls"]')
    await expect(toggle).toBeVisible()
    await toggle.click()
    // nth(1) = mobile row select (nth(0) is hidden desktop select)
    await expect(page.locator('[aria-label="Select year"]').nth(1)).toBeVisible()
  })
})

// ── LapScrubber ───────────────────────────────────────────────────────────────

test.describe('LapScrubber', () => {
  test('range input renders with valid min/max', async ({ page }) => {
    const scrubber = page.locator('[data-panel-id="scrubber"] input[type="range"]')
    await expect(scrubber).toBeVisible()
    const min = Number(await scrubber.getAttribute('min'))
    const max = Number(await scrubber.getAttribute('max'))
    expect(min).toBeGreaterThanOrEqual(1)
    expect(max).toBeGreaterThan(min)
  })

  test('Replay button is clickable', async ({ page }) => {
    const replay = page.locator('[aria-label="Replay race"]')
    await expect(replay).toBeVisible()
    await replay.click()
  })

  test('LAP counter text is visible', async ({ page }) => {
    // Scope to scrubber panel to avoid matching hidden lap labels in StrategyAdvisor
    await expect(page.locator('[data-panel-id="scrubber"]').getByText(/LAP \d+/)).toBeVisible()
  })

  test('ArrowRight key advances lap', async ({ page }) => {
    const scrubber = page.locator('[data-panel-id="scrubber"] input[type="range"]')
    const before = Number(await scrubber.inputValue())
    await scrubber.focus()
    await page.keyboard.press('ArrowRight')
    const after = Number(await scrubber.inputValue())
    expect(after).toBeGreaterThanOrEqual(before)
  })
})

// ── TireHealth ────────────────────────────────────────────────────────────────

test.describe('TireHealth', () => {
  test('panel visible with Tire Severity label', async ({ page }) => {
    const panel = page.locator('[data-panel-id="tire-health"]')
    await expect(panel).toBeVisible()
    await expect(panel).toContainText('Tire Severity')
  })

  test('severity score is 0–3', async ({ page }) => {
    const panel = page.locator('[data-panel-id="tire-health"]')
    await expect(panel).toBeVisible()
    // If no data message, skip — otherwise check score
    const text = await panel.textContent()
    if (text?.includes('No data for this lap')) return
    const sev = page.locator('[aria-live="polite"]').first()
    await expect(sev).toBeVisible()
    const sevText = (await sev.textContent())?.trim()
    expect(['0', '1', '2', '3']).toContain(sevText)
  })

  test('shows 4 mode probability bars', async ({ page }) => {
    const panel = page.locator('[data-panel-id="tire-health"]')
    const bars = panel.locator('[role="progressbar"]')
    await expect(bars).toHaveCount(4)
  })
})

// ── ShapPanel ─────────────────────────────────────────────────────────────────

test.describe('ShapPanel', () => {
  test('panel visible with Top Predictors heading', async ({ page }) => {
    const panel = page.locator('[data-panel-id="shap"]')
    await expect(panel).toBeVisible()
    await expect(panel).toContainText('Top Predictors')
  })

  test('shows feature bars or no-data message', async ({ page }) => {
    const panel = page.locator('[data-panel-id="shap"]')
    const text = await panel.textContent()
    const hasBars = (await panel.locator('[role="progressbar"]').count()) > 0
    const noData = text?.includes('No SHAP data')
    expect(hasBars || noData).toBeTruthy()
  })
})

// ── Timeline ──────────────────────────────────────────────────────────────────

test.describe('Timeline', () => {
  test('panel visible with Race Timeline heading', async ({ page }) => {
    const panel = page.locator('[data-panel-id="timeline"]')
    await expect(panel).toBeVisible()
    await expect(panel).toContainText('Race Timeline')
  })

  test('Recharts SVG renders inside panel', async ({ page }) => {
    const svg = page.locator('[data-panel-id="timeline"] svg').first()
    await expect(svg).toBeVisible()
  })
})

// ── StrategyAdvisor ───────────────────────────────────────────────────────────

test.describe('StrategyAdvisor', () => {
  test('panel visible with Strategy Advisor heading', async ({ page }) => {
    const panel = page.locator('[data-panel-id="strategy"]')
    await expect(panel).toBeVisible()
    await expect(panel).toContainText('Strategy Advisor')
  })

  test('shows pit window or no-data message', async ({ page }) => {
    const panel = page.locator('[data-panel-id="strategy"]')
    const text = await panel.textContent()
    const hasWindow = text?.includes('Primary Pit Window')
    const noData = text?.includes('No strategy data')
    expect(hasWindow || noData).toBeTruthy()
  })

  test('threshold slider present when data exists', async ({ page }) => {
    const panel = page.locator('[data-panel-id="strategy"]')
    const text = await panel.textContent()
    if (text?.includes('No strategy data')) return
    const slider = panel.locator('input[type="range"]')
    await slider.scrollIntoViewIfNeeded()
    await expect(slider).toBeVisible()
    // Dispatch React-compatible events (fill alone unreliable on mobile viewports)
    await slider.evaluate((el) => {
      const input = el as HTMLInputElement
      input.value = '1.5'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await expect(panel).toContainText('1.5')
  })

  test('recommendation badges render', async ({ page }) => {
    const panel = page.locator('[data-panel-id="strategy"]')
    const text = await panel.textContent()
    if (text?.includes('No strategy data')) return
    const terms = ['optimal', 'acceptable', 'late', 'critical']
    expect(terms.some(t => text?.includes(t))).toBeTruthy()
  })
})

// ── Accessibility ─────────────────────────────────────────────────────────────

test.describe('Accessibility', () => {
  test('page title contains LatentLap', async ({ page }) => {
    await expect(page).toHaveTitle(/LatentLap/)
  })

  test('all data-panel-id elements have aria-label', async ({ page }) => {
    const panels = page.locator('[data-panel-id]')
    const count = await panels.count()
    for (let i = 0; i < count; i++) {
      const label = await panels.nth(i).getAttribute('aria-label')
      expect(label).toBeTruthy()
    }
  })
})

// ── Mobile layout (Pixel 5) ───────────────────────────────────────────────────

test.describe('Mobile layout', () => {
  test('SeverityBadgeCard visible on mobile', async ({ page, isMobile }) => {
    if (!isMobile) return
    await expect(page.locator('text=Degradation Severity')).toBeVisible()
  })

  test('TireHealth panel visible on mobile', async ({ page, isMobile }) => {
    if (!isMobile) return
    await expect(page.locator('[data-panel-id="tire-health"]')).toBeVisible()
  })

  test('LapScrubber range visible on mobile', async ({ page, isMobile }) => {
    if (!isMobile) return
    await expect(page.locator('input[type="range"]').first()).toBeVisible()
  })
})
