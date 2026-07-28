# Runbook: Service Mesh mTLS

## Canary Deployment

1. Apply `deploy/istio/service-mesh-mtls.yaml` to staging.
2. Verify all pods have sidecars and are ready.
3. Shift 10% traffic to canary.
4. Watch the Service Mesh mTLS dashboard for at least 30 minutes.
5. Promote only when the gate in `evaluateMeshPromotionGate` passes.

## Rollback

1. Set `VirtualService` weights back to `blue: 100`, `green: 0`, and `canary: 0`.
2. Confirm P99 latency returns below 100 ms.
3. Confirm availability recovers to at least 99.99%.
4. Capture Envoy sidecar logs for the failed green/canary deployment.
5. Open a security review if any mTLS failure or unexpected authorization deny occurred.

## Alerts

- **VeriNodeMeshP99LatencyHigh:** investigate Envoy retries, upstream saturation, and recent policy changes.
- **VeriNodeMeshAvailabilityLow:** freeze promotion and roll back if the burn continues for five minutes.
- **VeriNodeMeshMtlsHandshakeFailure:** treat as a security incident until certificate and identity scope are verified.
- **VeriNodeMeshCertificateExpirySoon:** restart or recycle affected workloads if SDS rotation does not recover automatically.
