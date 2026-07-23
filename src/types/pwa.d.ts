interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

interface Window {
  BeforeInstallPromptEvent: typeof BeforeInstallPromptEvent
}
