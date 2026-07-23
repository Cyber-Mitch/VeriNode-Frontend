export class GasVolatilityTracker {
  private buffer: number[] = [];
  private readonly MAX_SAMPLES = 50;

  addSample(baseFeeGwei: number) {
    this.buffer.push(baseFeeGwei);
    if (this.buffer.length > this.MAX_SAMPLES) {
      this.buffer.shift();
    }
  }

  getVolatilityMultiplier(): number {
    if (this.buffer.length < 2) return 1.0;
    
    const mean = this.buffer.reduce((a, b) => a + b, 0) / this.buffer.length;
    const variance = this.buffer.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / (this.buffer.length - 1);
    const stddev = Math.sqrt(variance);
    const volatility = mean === 0 ? 0 : stddev / mean;
    
    return Math.max(0.25, Math.min(2.0, 1.0 - volatility));
  }
}

export const gasVolatilityTracker = new GasVolatilityTracker();
