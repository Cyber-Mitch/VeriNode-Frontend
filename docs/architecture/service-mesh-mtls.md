# Service Mesh Integration with Mutual TLS

## Goals

VeriNode services run inside an Istio-compatible service mesh with mutual TLS enforced for every in-mesh hop. The implementation targets:

- **Security:** `STRICT` PeerAuthentication for all workloads and request-scoped AuthorizationPolicy allow lists.
- **Performance:** critical frontend-to-API paths stay below **100 ms P99**.
- **Availability:** rollout gates preserve **99.99%** service availability.
- **Operability:** Prometheus alerts and Grafana dashboards expose mTLS health, latency, error budget burn, and certificate expiry.

## Architecture

1. The `verinode` namespace is labeled for sidecar injection.
2. Namespace-level `PeerAuthentication` enforces strict mTLS.
3. `DestinationRule` configures Istio clients to originate ISTIO_MUTUAL TLS.
4. `AuthorizationPolicy` denies unapproved service accounts by default and allows only the frontend workload to call the API workload.
5. `VirtualService` supports blue, green, and canary subsets for controlled production rollout.
6. Promotion gates use the policy helpers in `src/services/serviceMeshPolicy.ts` so application tests validate the same SLOs used by operations.

## Rollout Strategy

| Phase | Traffic | Gate |
| --- | ---: | --- |
| Baseline | 100% blue | Confirm telemetry, mTLS success, and no policy denies. |
| Canary | 90% blue / 10% canary | P99 < 100 ms, availability >= 99.99%, mTLS success 100%, burn rate <= 1. |
| Green | 100% green | Same canary gates for 30 minutes. |
| Promote | 100% green | Update stable service labels and keep blue warm for rollback. |

## Security Review Checklist

- Confirm no workload uses `PERMISSIVE` or `DISABLE` mTLS in production.
- Confirm every AuthorizationPolicy uses service-account principals rather than namespace wildcards.
- Confirm certificates rotate before the two-hour alert threshold.
- Confirm dashboards include failed handshakes and policy-deny spikes.
- Confirm runbook rollback steps have been rehearsed in staging.
