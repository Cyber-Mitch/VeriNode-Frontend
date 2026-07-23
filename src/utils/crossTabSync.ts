import type { FinalityHealthSnapshot } from '@/src/utils/compositeScore'

const CHANNEL_NAME = 'verinode-finality-health'

export function createFinalityHealthChannel(onSnapshot: (snapshot: FinalityHealthSnapshot) => void) {
  if (typeof BroadcastChannel === 'undefined') return { publish: () => undefined, close: () => undefined }
  const channel = new BroadcastChannel(CHANNEL_NAME)
  channel.onmessage = (event: MessageEvent<FinalityHealthSnapshot>) => onSnapshot(event.data)
  return {
    publish: (snapshot: FinalityHealthSnapshot) => channel.postMessage(snapshot),
    close: () => channel.close(),
  }
}
