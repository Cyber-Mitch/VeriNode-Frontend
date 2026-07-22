// Infrastructure metadata aggregation service.
//
// Sources (per issue spec):
//   1. Node self-reported config  – nodeConfig.ip, nodeConfig.cloudRegion
//   2. IP geolocation API         – lat/lng derived from IP
//   3. BGP ASN lookup             – ASN for the node's IP
//
// In demo mode all data is deterministically derived from the node ID so no
// real network calls are made. In production each method hits a real API.

export interface NodeConfig {
  /** Unique node identifier. */
  nodeId: string
  /** Self-reported IP address (IPv4). */
  ip: string | null
  /** Self-reported cloud region tag (e.g. "aws:us-east-1"). */
  cloudRegion: string | null
  /** Self-reported geographic coordinates (may be null). */
  lat: number | null
  lng: number | null
}

export interface NodeInfraMetadata {
  nodeId: string
  ip: string | null
  /** BGP Autonomous System Number, e.g. "AS15169". */
  asn: string | null
  cloudRegion: string | null
  lat: number
  lng: number
}

// ── Deterministic demo helpers ────────────────────────────────────────────────

function fnv32(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function demoFloat(seed: string, lo: number, hi: number): number {
  return lo + (fnv32(seed) / 0x1_0000_0000) * (hi - lo)
}

const DEMO_PROVIDERS = ['aws', 'gcp', 'azure', 'hetzner', 'ovh']
const DEMO_REGIONS: Record<string, string[]> = {
  aws: ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1'],
  gcp: ['us-central1', 'europe-west1', 'asia-east1'],
  azure: ['eastus', 'westeurope', 'southeastasia'],
  hetzner: ['nbg1', 'fsn1', 'hel1'],
  ovh: ['rbx', 'sbg', 'gra'],
}
const DEMO_ASNS: Record<string, string> = {
  aws: 'AS16509',
  gcp: 'AS15169',
  azure: 'AS8075',
  hetzner: 'AS24940',
  ovh: 'AS16276',
}

function demoMetadata(nodeId: string): NodeInfraMetadata {
  const providerIdx = fnv32(`prov:${nodeId}`) % DEMO_PROVIDERS.length
  const provider = DEMO_PROVIDERS[providerIdx]
  const regions = DEMO_REGIONS[provider]
  const regionIdx = fnv32(`reg:${nodeId}`) % regions.length
  const cloudRegion = `${provider}:${regions[regionIdx]}`
  const asn = DEMO_ASNS[provider]
  // Spread across major data-center latitudes.
  const lat = demoFloat(`lat:${nodeId}`, -55, 70)
  const lng = demoFloat(`lng:${nodeId}`, -120, 140)
  const ipA = (fnv32(`ipa:${nodeId}`) % 200) + 10
  const ipB = (fnv32(`ipb:${nodeId}`) % 255)
  const ipC = (fnv32(`ipc:${nodeId}`) % 255)
  const ipD = (fnv32(`ipd:${nodeId}`) % 254) + 1
  const ip = `${ipA}.${ipB}.${ipC}.${ipD}`
  return { nodeId, ip, asn, cloudRegion, lat, lng }
}

// ── HTTP service ──────────────────────────────────────────────────────────────

/**
 * Resolve lat/lng for an IP via an open geolocation JSON endpoint.
 * Falls back to [0, 0] on any error so we never block cluster analysis.
 */
async function fetchIpGeo(ip: string): Promise<{ lat: number; lng: number }> {
  try {
    const res = await fetch(`https://ipapi.co/${ip}/json/`)
    if (!res.ok) return { lat: 0, lng: 0 }
    const body = (await res.json()) as { latitude?: number; longitude?: number }
    return {
      lat: typeof body.latitude === 'number' ? body.latitude : 0,
      lng: typeof body.longitude === 'number' ? body.longitude : 0,
    }
  } catch {
    return { lat: 0, lng: 0 }
  }
}

/**
 * Resolve the BGP ASN for an IP via ipapi.co.
 * Returns null on any error.
 */
async function fetchAsn(ip: string): Promise<string | null> {
  try {
    const res = await fetch(`https://ipapi.co/${ip}/json/`)
    if (!res.ok) return null
    const body = (await res.json()) as { asn?: string }
    return body.asn ?? null
  } catch {
    return null
  }
}

/**
 * Build infrastructure metadata for a node from its self-reported config plus
 * optional API-enriched geo/ASN data.
 */
export async function resolveNodeMetadata(config: NodeConfig): Promise<NodeInfraMetadata> {
  let lat = config.lat ?? 0
  let lng = config.lng ?? 0
  let asn: string | null = null

  if (config.ip) {
    // Fetch geo and ASN in parallel.
    const [geo, resolvedAsn] = await Promise.all([
      config.lat == null || config.lng == null ? fetchIpGeo(config.ip) : Promise.resolve({ lat, lng }),
      fetchAsn(config.ip),
    ])
    lat = geo.lat
    lng = geo.lng
    asn = resolvedAsn
  }

  return {
    nodeId: config.nodeId,
    ip: config.ip,
    asn,
    cloudRegion: config.cloudRegion,
    lat,
    lng,
  }
}

// ── Service factory ────────────────────────────────────────────────────────────

export type InfrastructureProvider = {
  /**
   * Fetch infrastructure metadata for a set of node configs.
   * In demo mode returns deterministic synthetic data immediately.
   * In production issues real API calls for geo/ASN enrichment.
   */
  fetchNodeMetadata(configs: NodeConfig[]): Promise<NodeInfraMetadata[]>
}

/** Demo provider — fully deterministic, zero network calls. */
export function createDemoInfrastructureService(): InfrastructureProvider {
  return {
    async fetchNodeMetadata(configs) {
      return configs.map((c) => {
        if (c.ip && c.lat != null && c.lng != null) {
          return {
            nodeId: c.nodeId,
            ip: c.ip,
            asn: null,
            cloudRegion: c.cloudRegion,
            lat: c.lat,
            lng: c.lng,
          }
        }
        return demoMetadata(c.nodeId)
      })
    },
  }
}

/** Production provider — enriches configs with real geo/ASN API calls. */
export function createInfrastructureService(): InfrastructureProvider {
  return {
    async fetchNodeMetadata(configs) {
      return Promise.all(configs.map(resolveNodeMetadata))
    },
  }
}
