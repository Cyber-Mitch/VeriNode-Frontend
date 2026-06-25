import { test, expect } from '@playwright/test'

test('10,000 node topology keeps p95 frame time below 33ms', async ({ page }) => {
  await page.goto('/network')
  await page.getByLabel('High-density validator topology canvas').waitFor()

  const p95 = await page.evaluate(async () => {
    const samples: number[] = []
    let last = performance.now()
    const deadline = performance.now() + 30_000
    return await new Promise<number>((resolve) => {
      const sample = (now: number) => {
        samples.push(now - last)
        last = now
        window.dispatchEvent(new WheelEvent('wheel', { deltaY: Math.sin(now / 500) * 12 }))
        if (now >= deadline) {
          samples.sort((a, b) => a - b)
          resolve(samples[Math.floor(samples.length * 0.95)] ?? 0)
          return
        }
        requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
    })
  })

  expect(p95).toBeLessThan(33)
})
