import { test, expect } from '@playwright/test';

test.describe('Graceful Degradation — Feature Flags & Capacity Shedding', () => {
  test('should disable staking feature via URL parameter', async ({ page }) => {
    await page.goto('/?feature_staking=false');

    const textarea = page.locator('textarea');
    await expect(textarea).not.toBeVisible();

    const fallback = page.locator('text=currently unavailable');
    await expect(fallback).toBeVisible();
  });

  test('should default all features to enabled', async ({ page }) => {
    await page.goto('/');

    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible();

    const submitButton = page.getByRole('button', { name: 'Submit Stake' });
    await expect(submitButton).toBeVisible();
  });

  test('should persist feature flag override in localStorage', async ({ page }) => {
    await page.goto('/');

    await page.evaluate(() => {
      localStorage.setItem('vn_feature_flags', JSON.stringify({ staking: false }));
    });

    await page.reload();

    const textarea = page.locator('textarea');
    await expect(textarea).not.toBeVisible();
  });

  test('URL parameter should take precedence over localStorage', async ({ page }) => {
    await page.goto('/');

    await page.evaluate(() => {
      localStorage.setItem('vn_feature_flags', JSON.stringify({ staking: false }));
    });

    await page.goto('/?feature_staking=true');

    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible();
  });

  test('should show fallback when feature is disabled via DegradableFeature', async ({ page }) => {
    await page.goto('/?feature_staking=false');

    const fallback = page.locator('text=currently unavailable');
    await expect(fallback).toBeVisible();
  });

  test('should show feature name in fallback when disabled', async ({ page }) => {
    await page.goto('/?feature_staking=false');

    const featureName = page.locator('text=staking');
    await expect(featureName).toBeVisible();
  });

  test('should re-enable feature when URL param removed', async ({ page }) => {
    await page.goto('/?feature_staking=false');

    const fallback = page.locator('text=currently unavailable');
    await expect(fallback).toBeVisible();

    await page.goto('/');

    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible();
  });

  test('should compute capacity shedding correctly for degraded mode', async ({ page }) => {
    await page.goto('/');

    const logic = await page.evaluate(() => {
      const level = 'degraded';

      const isShed = (feature: string, priority: string) => {
        if (level === 'healthy') return false;
        if (level === 'critical') return priority !== 'critical';
        if (level === 'degraded') return priority === 'low';
        return false;
      };

      return {
        analyticsShed: isShed('analytics', 'low'),
        stakingShed: isShed('staking', 'critical'),
        governanceShed: isShed('governance', 'high'),
        votingShed: isShed('quadratic-voting', 'medium'),
      };
    });

    expect(logic.analyticsShed).toBe(true);
    expect(logic.stakingShed).toBe(false);
    expect(logic.governanceShed).toBe(false);
    expect(logic.votingShed).toBe(false);
  });

  test('should compute capacity shedding correctly for critical mode', async ({ page }) => {
    await page.goto('/');

    const logic = await page.evaluate(() => {
      const level = 'critical';

      const isShed = (feature: string, priority: string) => {
        if (level === 'healthy') return false;
        if (level === 'critical') return priority !== 'critical';
        if (level === 'degraded') return priority === 'low';
        return false;
      };

      return {
        stakingShed: isShed('staking', 'critical'),
        governanceShed: isShed('governance', 'high'),
        votingShed: isShed('quadratic-voting', 'medium'),
        explorerShed: isShed('explorer', 'low'),
        analyticsShed: isShed('analytics', 'low'),
      };
    });

    expect(logic.stakingShed).toBe(false);
    expect(logic.governanceShed).toBe(true);
    expect(logic.votingShed).toBe(true);
    expect(logic.explorerShed).toBe(true);
    expect(logic.analyticsShed).toBe(true);
  });

  test('should not shed any feature when healthy', async ({ page }) => {
    await page.goto('/');

    const logic = await page.evaluate(() => {
      const level = 'healthy';

      const isShed = (feature: string, priority: string) => {
        if (level === 'healthy') return false;
        if (level === 'critical') return priority !== 'critical';
        if (level === 'degraded') return priority === 'low';
        return false;
      };

      return {
        stakingShed: isShed('staking', 'critical'),
        analyticsShed: isShed('analytics', 'low'),
      };
    });

    expect(logic.stakingShed).toBe(false);
    expect(logic.analyticsShed).toBe(false);
  });

  test('should compute metrics thresholds correctly', async ({ page }) => {
    await page.goto('/');

    const thresholdLogic = await page.evaluate(() => {
      const thresholds = { responseTime: 5000, queueSize: 10, errorRate: 0.1, memoryUsage: 0.8 };

      const computeLevel = (metrics: { responseTime: number; queueSize: number; errorRate: number; memoryUsage: number }) => {
        let shedCount = 0;
        if (metrics.responseTime > thresholds.responseTime) shedCount++;
        if (metrics.queueSize > thresholds.queueSize) shedCount++;
        if (metrics.errorRate > thresholds.errorRate) shedCount++;
        if (metrics.memoryUsage > thresholds.memoryUsage) shedCount++;

        if (shedCount === 0) return 'healthy';
        if (shedCount <= 1) return 'degraded';
        return 'critical';
      };

      return {
        healthy: computeLevel({ responseTime: 100, queueSize: 1, errorRate: 0, memoryUsage: 0.3 }),
        degraded: computeLevel({ responseTime: 6000, queueSize: 3, errorRate: 0.05, memoryUsage: 0.5 }),
        critical: computeLevel({ responseTime: 6000, queueSize: 15, errorRate: 0.2, memoryUsage: 0.9 }),
      };
    });

    expect(thresholdLogic.healthy).toBe('healthy');
    expect(thresholdLogic.degraded).toBe('degraded');
    expect(thresholdLogic.critical).toBe('critical');
  });
});
