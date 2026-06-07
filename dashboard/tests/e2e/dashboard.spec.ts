import { expect, test } from '@playwright/test'

async function openSettings(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Open settings' }).click()
  await expect(page.getByText('YEAR')).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await page.goto(process.env.PLAYWRIGHT_BASE_URL ?? '/')
  await page.waitForLoadState('load')
  await page.waitForSelector('[aria-label="Lap scrubber"]', { timeout: 15_000 })
})

test.describe('Scrollytelling dashboard shell', () => {
  test('renders default hero chapter for 2025 Silverstone', async ({ page }) => {
    await expect(page.getByText('McLaren · Silverstone · 2025')).toBeVisible()
    await expect(page.getByText(/Following NOR in the 2025 British Grand Prix/)).toBeVisible()
    await expect(page.getByText('Race date: July 6, 2025')).toBeVisible()
    await expect(page.getByText('What is this?')).toBeVisible()
  })

  test('settings popover changes year and keeps hero race copy in sync', async ({ page }) => {
    await openSettings(page)
    await page.getByRole('button', { name: '2024' }).click()

    await expect(page.getByText('McLaren · Silverstone · 2024')).toBeVisible()
    await expect(page.getByText(/Following NOR in the 2024 British Grand Prix/)).toBeVisible()
    await expect(page.getByText('Race date: July 7, 2024')).toBeVisible()
    await expect(page.getByText(/2025 British Grand Prix/)).not.toBeVisible()
  })

  test('settings popover exposes year and driver buttons', async ({ page }) => {
    await openSettings(page)

    for (const year of ['2021', '2022', '2023', '2024', '2025']) {
      await expect(page.getByRole('button', { name: year })).toBeVisible()
    }

    await expect(page.getByRole('button', { name: 'NOR' })).toBeVisible()
    await expect(page.getByRole('button', { name: /PIA|RIC/ })).toBeVisible()
  })

  test('fixed lap scrubber has controls and advances lap by keyboard', async ({ page }) => {
    const scrubber = page.locator('[aria-label="Lap scrubber"]')
    await expect(scrubber).toBeVisible()
    await expect(scrubber.getByText(/LAP \d+ \/ \d+/)).toBeVisible()

    const slider = scrubber.locator('input[type="range"]')
    const before = Number(await slider.inputValue())
    await slider.focus()
    await page.keyboard.press('ArrowRight')
    const after = Number(await slider.inputValue())
    expect(after).toBeGreaterThanOrEqual(before)
  })

  test('chapter dots navigate to severity chapter', async ({ page }) => {
    const severityDot = page.getByRole('button', { name: 'Chapter 2 of 5: Severity' })
    await severityDot.click()
    await expect(severityDot).toHaveAttribute('aria-current', 'true')
    await expect(page.getByText('Tire Severity')).toBeVisible()
    await expect(page.getByText(/Scale: 0 = healthy/)).toBeVisible()
  })

  test('Vercel preview toolbar elements are hidden and non-interactive', async ({ page }) => {
    await page.evaluate(() => {
      const liveFeedback = document.createElement('vercel-live-feedback')
      const toolbar = document.createElement('vercel-toolbar')
      liveFeedback.textContent = 'Preview feedback'
      toolbar.textContent = 'Preview toolbar'
      document.body.append(liveFeedback, toolbar)
    })

    for (const selector of ['vercel-live-feedback', 'vercel-toolbar']) {
      const styles = await page.locator(selector).evaluate((el) => {
        const computed = window.getComputedStyle(el)
        return {
          display: computed.display,
          pointerEvents: computed.pointerEvents,
        }
      })
      expect(styles).toEqual({ display: 'none', pointerEvents: 'none' })
    }
  })
})

test.describe('SIM drawer', () => {
  test('opens, exposes pit slider, and closes', async ({ page }) => {
    await page.getByTestId('sim-fab').click()

    const drawer = page.getByTestId('sim-drawer')
    await expect(drawer).toBeVisible()
    await expect(drawer).toContainText('LATENTLAP SIM')
    await expect(page.getByLabel('Sim pit lap')).toBeVisible()

    await page.getByRole('button', { name: 'Close simulator' }).click()
    await expect(drawer).not.toBeAttached()
  })
})

test.describe('Mobile layout', () => {
  test('Pixel 5 hero viewport has no horizontal overflow and keeps controls reachable', async ({ page, isMobile }) => {
    if (!isMobile) return

    await expect(page.getByText('McLaren · Silverstone · 2025')).toBeVisible()
    await expect(page.getByText(/Following NOR in the 2025 British Grand Prix/)).toBeVisible()
    await expect(page.getByText('What is this?')).toBeVisible()

    const metrics = await page.evaluate(() => {
      const body = document.body
      const doc = document.documentElement
      const visibleText = Array.from(document.querySelectorAll('body *'))
        .filter((el) => {
          const rect = el.getBoundingClientRect()
          const style = window.getComputedStyle(el)
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
        })
        .map((el) => {
          const rect = el.getBoundingClientRect()
          return {
            text: el.textContent?.trim() ?? '',
            left: rect.left,
            right: rect.right,
          }
        })
      return {
        viewportWidth: window.innerWidth,
        scrollWidth: Math.max(body.scrollWidth, doc.scrollWidth),
        offscreenText: visibleText.filter(item =>
          item.text.length > 0 && (item.left < -1 || item.right > window.innerWidth + 1)
        ),
      }
    })

    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1)
    expect(metrics.offscreenText).toEqual([])

    const heroTitleBox = await page.getByText('McLaren · Silverstone · 2025').boundingBox()
    const heroCopyBox = await page.getByText(/Following NOR in the 2025 British Grand Prix/).boundingBox()
    const rightCalloutBox = await page.getByText('XGBoost model trained on FastF1 telemetry.').boundingBox()
    expect(heroTitleBox?.width ?? 0).toBeGreaterThan(240)
    expect(heroCopyBox?.width ?? 0).toBeGreaterThan(240)
    expect(rightCalloutBox?.width ?? 0).toBeGreaterThan(240)

    await expect(page.getByRole('button', { name: 'Open settings' })).toBeVisible()
    await expect(page.getByTestId('sim-fab')).toBeVisible()
    await expect(page.locator('[aria-label="Lap scrubber"]')).toBeVisible()
  })

  test('Pixel 5 callouts stay within viewport during entrance animation', async ({ page, isMobile }) => {
    if (!isMobile) return

    await page.goto(process.env.PLAYWRIGHT_BASE_URL ?? '/', { waitUntil: 'commit' })
    await page.waitForSelector('.stage-callout-right', { state: 'attached', timeout: 15_000 })
    await expect(page.getByTestId('stage-callout-left')).toHaveAttribute('data-motion', 'fade')
    await expect(page.getByTestId('stage-callout-right')).toHaveAttribute('data-motion', 'fade')

    const samples = await page.evaluate(async () => {
      const frames: Array<{ left: number; right: number; text: string }> = []
      for (let i = 0; i < 12; i++) {
        await new Promise<void>(requestAnimationFrame)
        const items = Array.from(document.querySelectorAll('.stage-callout *'))
          .filter((el) => {
            const rect = el.getBoundingClientRect()
            const text = el.textContent?.trim() ?? ''
            return text.length > 0 && rect.width > 0 && rect.height > 0
          })
          .map((el) => {
            const rect = el.getBoundingClientRect()
            return {
              left: rect.left,
              right: rect.right,
              text: el.textContent?.trim() ?? '',
            }
          })
        frames.push(...items)
      }
      return {
        viewportWidth: window.innerWidth,
        offscreen: frames.filter(item => item.left < -1 || item.right > window.innerWidth + 1),
      }
    })

    expect(samples.offscreen, `viewport width ${samples.viewportWidth}`).toEqual([])
  })
})
