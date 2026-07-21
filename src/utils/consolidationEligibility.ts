import { CONSOLIDATED_VALIDATOR_EFFECTIVE_BALANCE_CAP_ETH, STANDARD_VALIDATOR_EFFECTIVE_BALANCE_ETH, clamp } from '@/src/utils/ethMath'
import { DEFAULT_AVG_GAS_PER_VALIDATOR_PER_EPOCH, estimateAnnualGasSavings } from '@/src/utils/gasEstimator'

export interface ConsolidationValidator {
  validatorIndex: number
  effectiveBalanceEth: number
  activationEpoch: number
  withdrawalCredentials: string
}

export interface ConsolidationRecommendation {
  groupId: string
  withdrawalCredentials: string
  validatorIndices: number[]
  currentCount: number
  mergedCount: number
  totalEffectiveBalanceEth: number
  estimatedAnnualGasSavings: number
  readinessScore: number
  matchingWithdrawalCredsRatio: number
}

export type ConsolidationSortKey = 'savings' | 'validator_count' | 'readiness_score'

function readinessScore(validators: ConsolidationValidator[], groupSize: number): number {
  const matchingWithdrawalCredsRatio = validators.length === 0 ? 0 : groupSize / validators.length
  const balanceProximityTo32 = validators.length === 0
    ? 0
    : validators.reduce((sum, v) => sum + clamp(1 - Math.abs(v.effectiveBalanceEth - STANDARD_VALIDATOR_EFFECTIVE_BALANCE_ETH) / STANDARD_VALIDATOR_EFFECTIVE_BALANCE_ETH), 0) / validators.length
  const latestActivation = Math.max(...validators.map((v) => v.activationEpoch), 0)
  const activationEpochProximity = validators.length === 0 || latestActivation === 0
    ? 1
    : validators.reduce((sum, v) => sum + clamp(v.activationEpoch / latestActivation), 0) / validators.length

  return Number((0.5 * matchingWithdrawalCredsRatio + 0.3 * balanceProximityTo32 + 0.2 * activationEpochProximity).toFixed(4))
}

export function findConsolidationRecommendations(
  validators: ConsolidationValidator[],
  avgGasPerValidatorPerEpoch = DEFAULT_AVG_GAS_PER_VALIDATOR_PER_EPOCH,
): ConsolidationRecommendation[] {
  const byCreds = new Map<string, ConsolidationValidator[]>()
  for (const validator of validators) {
    const list = byCreds.get(validator.withdrawalCredentials) ?? []
    list.push(validator)
    byCreds.set(validator.withdrawalCredentials, list)
  }

  const recommendations: ConsolidationRecommendation[] = []
  for (const [withdrawalCredentials, group] of byCreds) {
    if (group.length < 2) continue
    const sorted = [...group].sort((a, b) => b.effectiveBalanceEth - a.effectiveBalanceEth)
    const bins: number[] = []
    for (const validator of sorted) {
      const fitIndex = bins.findIndex((balance) => balance + validator.effectiveBalanceEth <= CONSOLIDATED_VALIDATOR_EFFECTIVE_BALANCE_CAP_ETH)
      if (fitIndex === -1) bins.push(validator.effectiveBalanceEth)
      else bins[fitIndex] += validator.effectiveBalanceEth
    }

    const mergedCount = bins.length
    if (mergedCount >= group.length) continue
    const totalEffectiveBalanceEth = group.reduce((sum, v) => sum + v.effectiveBalanceEth, 0)
    recommendations.push({
      groupId: `wc-${withdrawalCredentials.slice(-8)}`,
      withdrawalCredentials,
      validatorIndices: group.map((v) => v.validatorIndex),
      currentCount: group.length,
      mergedCount,
      totalEffectiveBalanceEth,
      estimatedAnnualGasSavings: estimateAnnualGasSavings({ currentValidatorCount: group.length, mergedValidatorCount: mergedCount, avgGasPerValidatorPerEpoch }),
      readinessScore: readinessScore(group, group.length),
      matchingWithdrawalCredsRatio: 1,
    })
  }

  return sortConsolidationRecommendations(recommendations, 'savings')
}

export function sortConsolidationRecommendations(
  recommendations: ConsolidationRecommendation[],
  sortBy: ConsolidationSortKey,
): ConsolidationRecommendation[] {
  return [...recommendations].sort((a, b) => {
    if (sortBy === 'validator_count') return b.currentCount - a.currentCount
    if (sortBy === 'readiness_score') return b.readinessScore - a.readinessScore
    return b.estimatedAnnualGasSavings - a.estimatedAnnualGasSavings
  })
}
