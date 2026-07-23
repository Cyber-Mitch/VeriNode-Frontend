// Shard → color mapping using golden-ratio hue spacing.
//
// Stepping the hue by φ × 360° (≈222.49°) per shard index spreads adjacent
// shard colors maximally around the wheel, so neighbouring shard indices stay
// visually distinct even across all 64 shards.

const PHI = 0.618_033_988_749_895
const HUE_STEP = PHI * 360 // ≈222.4922° per shard
const SATURATION = 70
const LIGHTNESS = 55

/** Hue in degrees [0, 360) for a shard index. */
export function shardHue(shard: number): number {
  return ((shard * HUE_STEP) % 360 + 360) % 360
}

/** CSS HSL color string for a shard index. */
export function shardColor(shard: number, saturation = SATURATION, lightness = LIGHTNESS): string {
  return `hsl(${shardHue(shard).toFixed(1)}, ${saturation}%, ${lightness}%)`
}

/** Translucent variant for fills/backgrounds. */
export function shardColorAlpha(shard: number, alpha: number): string {
  return `hsla(${shardHue(shard).toFixed(1)}, ${SATURATION}%, ${LIGHTNESS}%, ${alpha})`
}
