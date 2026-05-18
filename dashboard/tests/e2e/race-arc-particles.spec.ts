import { expect, test } from '@playwright/test'

async function openDashboard(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/')
  await page.waitForLoadState('load')
  await page.waitForSelector('svg[aria-label^="F1 tire"]', { timeout: 15_000 })
}

async function scrollToRaceArc(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight
    window.scrollTo(0, maxScroll * 0.66)
  })
  await expect(page.getByTestId('race-arc-timeline')).toBeVisible()
}

function centerOf(rect: DOMRect | { x: number; y: number; width: number; height: number }): { x: number; y: number } {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  }
}

async function viewportRect(
  locator: import('@playwright/test').Locator
): Promise<{ x: number; y: number; width: number; height: number }> {
  return locator.evaluate((el) => {
    const rect = el.getBoundingClientRect()
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  })
}

test.describe('Race Arc and tire particles', () => {
  test.beforeEach(async ({ page }) => {
    await openDashboard(page)
  })

  test('Race Arc renders as compact bottom timeline', async ({ page }) => {
    await scrollToRaceArc(page)

    const timeline = page.getByTestId('race-arc-timeline')
    const timelineBox = await viewportRect(timeline)
    const timelineStyle = await timeline.evaluate((el) => {
      const style = window.getComputedStyle(el)
      return {
        bottom: Number.parseFloat(style.bottom),
        flexDirection: style.flexDirection,
        inset: style.inset,
        position: style.position,
      }
    })

    expect(timelineBox.height).toBeLessThanOrEqual(24)
    expect(timelineBox.width).toBeGreaterThan(200)
    expect(timelineStyle.position).toBe('absolute')
    expect(timelineStyle.flexDirection).toBe('row')
    expect(timelineStyle.bottom).toBeGreaterThanOrEqual(56)
    expect(timelineStyle.inset).not.toBe('0px')
  })

  test('particles keep orbiting and remain inside tire SVG bounds', async ({ page }) => {
    const particles = page.getByTestId('tire-particle')
    await expect(particles.first()).toBeVisible()

    const firstParticle = particles.first()
    const before = await firstParticle.boundingBox()
    expect(before).not.toBeNull()

    await page.waitForTimeout(700)

    const after = await firstParticle.boundingBox()
    expect(after).not.toBeNull()

    const beforeCenter = centerOf(before!)
    const afterCenter = centerOf(after!)
    const moved = Math.hypot(afterCenter.x - beforeCenter.x, afterCenter.y - beforeCenter.y)
    expect(moved).toBeGreaterThan(1)

    const scrubber = page.locator('[aria-label="Lap scrubber"] input[type="range"]')
    await scrubber.evaluate((el) => {
      const input = el as HTMLInputElement
      input.value = String(Math.min(Number(input.max), Number(input.value) + 5))
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await page.waitForTimeout(700)

    const tireBox = await page.locator('svg[aria-label^="F1 tire"]').boundingBox()
    expect(tireBox).not.toBeNull()

    const visibleParticleBoxes = await particles.evaluateAll((els) =>
      els
        .map((el) => {
          const rect = el.getBoundingClientRect()
          const opacity = Number(window.getComputedStyle(el).opacity)
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, opacity }
        })
        .filter((rect) => rect.opacity > 0.05 && rect.width > 0 && rect.height > 0)
    )

    expect(visibleParticleBoxes.length).toBeGreaterThan(0)
    for (const rect of visibleParticleBoxes) {
      const particleCenter = centerOf(rect)
      expect(particleCenter.x).toBeGreaterThanOrEqual(tireBox!.x)
      expect(particleCenter.x).toBeLessThanOrEqual(tireBox!.x + tireBox!.width)
      expect(particleCenter.y).toBeGreaterThanOrEqual(tireBox!.y)
      expect(particleCenter.y).toBeLessThanOrEqual(tireBox!.y + tireBox!.height)
    }
  })
})
