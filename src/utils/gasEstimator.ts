export interface GasSavingsInput {
  currentValidatorCount: number
  mergedValidatorCount: number
  avgGasPerValidatorPerEpoch: number
  epochsPerDay?: number
}

export const DEFAULT_AVG_GAS_PER_VALIDATOR_PER_EPOCH = 21_000
export const DEFAULT_EPOCHS_PER_DAY = 225
export const DAYS_PER_YEAR = 365.25

export function estimateAnnualGasSavings({
  currentValidatorCount,
  mergedValidatorCount,
  avgGasPerValidatorPerEpoch,
  epochsPerDay = DEFAULT_EPOCHS_PER_DAY,
}: GasSavingsInput): number {
  const removedValidators = Math.max(0, currentValidatorCount - mergedValidatorCount)
  return Math.round(removedValidators * avgGasPerValidatorPerEpoch * epochsPerDay * DAYS_PER_YEAR)
}

export function estimatePerValidatorEpochGas({
  attestationGas = 14_000,
  proposalGas = 5_000,
  withdrawalGas = 2_000,
}: Partial<Record<'attestationGas' | 'proposalGas' | 'withdrawalGas', number>> = {}): number {
  return attestationGas + proposalGas + withdrawalGas
}
