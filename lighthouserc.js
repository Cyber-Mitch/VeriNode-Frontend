/** @type {import('@lhci/cli').LighthouseRcConfig} */
module.exports = {
  ci: {
    collect: {
      url: ["http://localhost:3000"],
      numberOfRuns: 1,
      settings: {
        // Simulate slow 4G / fast 3G (400 kbps, 400 ms RTT)
        throttlingMethod: "simulate",
        throttling: {
          rttMs: 400,
          throughputKbps: 400,
          cpuSlowdownMultiplier: 4,
        },
        screenEmulation: {
          mobile: true,
          width: 375,
          height: 667,
          deviceScaleFactor: 2,
        },
        formFactor: "mobile",
      },
    },
    assert: {
      assertions: {
        "first-contentful-paint": ["error", { maxNumericValue: 2500 }],
        "total-blocking-time":    ["error", { maxNumericValue: 200 }],
        "largest-contentful-paint": ["error", { maxNumericValue: 4000 }],
      },
    },
    upload: {
      target: "temporary-public-storage",
    },
  },
};
