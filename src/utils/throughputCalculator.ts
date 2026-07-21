export class ThroughputCalculator {
  private advances: { timestamp: number; slots: number }[] = [];
  private readonly MAX_SAMPLES = 50;

  addSample(slotsAdvanced: number) {
    const now = Date.now();
    this.advances.push({ timestamp: now, slots: slotsAdvanced });
    if (this.advances.length > this.MAX_SAMPLES) {
      this.advances.shift();
    }
  }

  getSlotsPerSecond(): number {
    if (this.advances.length < 2) return 0;
    
    const oldest = this.advances[0];
    const newest = this.advances[this.advances.length - 1];
    
    const timeDiffSeconds = (newest.timestamp - oldest.timestamp) / 1000;
    if (timeDiffSeconds <= 0) return 0;
    
    // Sum all slots advanced in the window
    const totalSlots = this.advances.reduce((acc, val) => acc + val.slots, 0);
    
    return totalSlots / timeDiffSeconds;
  }
}
