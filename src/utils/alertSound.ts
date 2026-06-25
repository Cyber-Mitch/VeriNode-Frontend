// Audible alert for high-severity ledger events.
//
// Uses the Web Audio API with a short, synthesized buffer generated in-memory
// at first use — no network request, no asset to preload over HTTP. Browser
// autoplay policies require a prior user gesture; `playAlertTone` resumes a
// suspended context and silently no-ops if playback is still blocked.

let audioContext: AudioContext | null = null
let toneBuffer: AudioBuffer | null = null

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!audioContext) audioContext = new Ctor()
  return audioContext
}

/** Build a ~150ms decaying two-tone "alert" buffer once, then reuse it. */
function getToneBuffer(ctx: AudioContext): AudioBuffer {
  if (toneBuffer) return toneBuffer
  const duration = 0.15
  const sampleRate = ctx.sampleRate
  const length = Math.floor(duration * sampleRate)
  const buffer = ctx.createBuffer(1, length, sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate
    // Blend 880Hz + 660Hz with an exponential decay envelope.
    const envelope = Math.exp(-18 * t)
    data[i] =
      0.5 * envelope * (Math.sin(2 * Math.PI * 880 * t) + Math.sin(2 * Math.PI * 660 * t))
  }
  toneBuffer = buffer
  return buffer
}

/**
 * Play the alert tone. Safe to call from anywhere — returns `false` (without
 * throwing) when audio is unavailable or still blocked by autoplay policy.
 */
export function playAlertTone(): boolean {
  const ctx = getContext()
  if (!ctx) return false
  try {
    if (ctx.state === 'suspended') void ctx.resume()
    const source = ctx.createBufferSource()
    source.buffer = getToneBuffer(ctx)
    const gain = ctx.createGain()
    gain.gain.value = 0.4
    source.connect(gain).connect(ctx.destination)
    source.start()
    return true
  } catch {
    return false
  }
}

/** Eagerly warm up the audio context/buffer from within a user gesture. */
export function primeAlertAudio(): void {
  const ctx = getContext()
  if (ctx) getToneBuffer(ctx)
}
