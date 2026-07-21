export interface OptimisticUpdateEvent {
  head_slot: number;
  latest_validated_slot: number;
  validated: boolean;
}

type Listener = (event: OptimisticUpdateEvent) => void;

class LightClientService {
  private listeners: Set<Listener> = new Set();
  private mockInterval: ReturnType<typeof setInterval> | null = null;

  // Max sync distance capped at 1,048,576 slots
  private headSlot = 1048576;
  private validatedSlot = 0;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    
    // Start mock if not started
    if (this.listeners.size === 1) {
      this.startMock();
    }

    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.stopMock();
      }
    };
  }

  private startMock() {
    this.mockInterval = setInterval(() => {
      // Simulate advancing slots at varying speeds
      // Speed up the simulation so it doesn't take 145 days
      const advance = Math.floor(Math.random() * 5000) + 1000;
      this.validatedSlot += advance;
      
      // Occasionally advance head
      if (Math.random() > 0.8) {
        this.headSlot += 1;
      }

      if (this.validatedSlot >= this.headSlot) {
        this.validatedSlot = this.headSlot;
      }

      const event: OptimisticUpdateEvent = {
        head_slot: this.headSlot,
        latest_validated_slot: this.validatedSlot,
        validated: this.validatedSlot >= this.headSlot,
      };

      this.listeners.forEach((l) => l(event));
    }, 500); // 500ms mock interval
  }

  private stopMock() {
    if (this.mockInterval) {
      clearInterval(this.mockInterval);
      this.mockInterval = null;
    }
  }
}

export const lightClientService = new LightClientService();
