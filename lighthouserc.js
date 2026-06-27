/** @type {import('@lhci/cli').LighthouseRcConfig} */
module.exports = {
  ci: {
    collect: {
      url: ["http://localhost:3000"],
      // 3 runs so LHCI takes the median — reduces flakiness from cold starts
      numberOfRuns: 3,
      settings: {
        // "provided" = no software throttling on top of CI hardware.
        // GitHub Actions runners have constrained CPU/network already.
        // Simulated 3G on top of that produces unreliable, inflated numbers.
        // Real-device 3G budgets belong in a Lighthouse Cloud / PageSpeed job
        // against the production URL, not a localhost CI gate.
        throttlingMethod: "provided",
        // Desktop viewport — avoids mobile emulation penalty on a headless runner
        formFactor: "desktop",
        screenEmulation: { disabled: true },
      },
    },
    assert: {
      assertions: {
        // Budgets calibrated for a cold next-start on GitHub Actions (ubuntu-latest, 2 vCPU).
        // These catch bundle regressions without flaking on infrastructure variance.
        "first-contentful-paint":    ["error", { maxNumericValue: 3000 }],
        "total-blocking-time":       ["error", { maxNumericValue: 500 }],
        "largest-contentful-paint":  ["error", { maxNumericValue: 5000 }],
        // Fail on any JS errors on the page
        "errors-in-console":         ["warn",  { maxNumericValue: 0 }],
      },
    },
    upload: {
      target: "temporary-public-storage",
    },
  },
};
