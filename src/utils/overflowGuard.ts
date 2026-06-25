export const UINT256_MAX = (BigInt(1) << BigInt(256)) - BigInt(1)

export class PrecisionOverflowError extends Error {
  constructor(message = 'Precision arithmetic result exceeds uint256 bounds') {
    super(message)
    this.name = 'PrecisionOverflowError'
  }
}

export function assertUint256(value: bigint): bigint {
  if (value > UINT256_MAX || value < -UINT256_MAX) {
    throw new PrecisionOverflowError()
  }
  return value
}

export function guarded(operation: () => bigint): bigint {
  return assertUint256(operation())
}
