const SOROBAN_DECIMALS = 7;
const SCALE_FACTOR = BigInt(10) ** BigInt(SOROBAN_DECIMALS);

export class SorobanBalance {
  private readonly raw: bigint;

  private constructor(raw: bigint) {
    this.raw = raw;
  }

  static ZERO = new SorobanBalance(BigInt(0));
  static MAX = new SorobanBalance(BigInt(10) ** BigInt(18) * SCALE_FACTOR);

  static fromAtomicUnits(units: bigint | string, decimals: number = SOROBAN_DECIMALS): SorobanBalance {
    const u = typeof units === "string" ? BigInt(units) : units;
    const scaleDiff = decimals - SOROBAN_DECIMALS;
    if (scaleDiff > 0) return new SorobanBalance(u / (BigInt(10) ** BigInt(scaleDiff)));
    if (scaleDiff < 0) return new SorobanBalance(u * (BigInt(10) ** BigInt(-scaleDiff)));
    return new SorobanBalance(u);
  }

  static fromString(input: string): SorobanBalance | null {
    const cleaned = input.trim().replace(/,/g, "").replace(/^0+/, "0");
    if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
    const [intPart, fracPart = ""] = cleaned.split(".");
    if (fracPart.length > SOROBAN_DECIMALS) return null;
    const paddedFrac = fracPart.padEnd(SOROBAN_DECIMALS, "0");
    const raw = BigInt(`${intPart}${paddedFrac}`);
    if (raw > SorobanBalance.MAX.raw) return null;
    return new SorobanBalance(raw);
  }

  toDisplay(locale: string = "en-US"): string {
    const ZERO = BigInt(0);
    const sign = this.raw < ZERO ? "-" : "";
    const abs = this.raw < ZERO ? -this.raw : this.raw;
    const intPart = abs / SCALE_FACTOR;
    const fracPart = abs % SCALE_FACTOR;
    const fracStr = fracPart.toString().padStart(SOROBAN_DECIMALS, "0").replace(/0+$/, "");
    const formattedInt = new Intl.NumberFormat(locale).format(Number(intPart));
    if (fracStr.length === 0) return `${sign}${formattedInt}`;
    return `${sign}${formattedInt}.${fracStr}`;
  }

  toAtomicUnits(): bigint {
    return this.raw;
  }

  toSorobanInt128(): string {
    return this.raw.toString();
  }

  gt(other: SorobanBalance): boolean {
    return this.raw > other.raw;
  }

  lt(other: SorobanBalance): boolean {
    return this.raw < other.raw;
  }

  eq(other: SorobanBalance): boolean {
    return this.raw === other.raw;
  }

  add(other: SorobanBalance): SorobanBalance {
    return new SorobanBalance(this.raw + other.raw);
  }

  sub(other: SorobanBalance): SorobanBalance {
    return new SorobanBalance(this.raw - other.raw);
  }

  mul(n: number): SorobanBalance {
    const scaled = BigInt(Math.round(n * Number(SCALE_FACTOR)));
    return new SorobanBalance((this.raw * scaled) / SCALE_FACTOR);
  }

  div(n: number): SorobanBalance {
    const scaled = BigInt(Math.round(n * Number(SCALE_FACTOR)));
    return new SorobanBalance((this.raw * SCALE_FACTOR) / scaled);
  }

  toJSON(): string {
    return this.toDisplay("en-US");
  }

  toString(): string {
    return this.toDisplay("en-US");
  }
}
