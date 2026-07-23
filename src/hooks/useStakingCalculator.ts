'use client'

import { useMemo } from 'react'
import { compound, formatGwei, pct, parseGwei } from '../utils/gweiMath'

export interface StakingCalculatorInput {
  principalGwei: bigint | string
  annualRatePct: number
  compoundingPeriods: number
}

export function useStakingCalculator({ principalGwei, annualRatePct, compoundingPeriods }: StakingCalculatorInput) {
  return useMemo(() => {
    const principal = parseGwei(principalGwei)
    const annualReward = pct(principal, annualRatePct)
    const projected = compound(principal, annualRatePct, compoundingPeriods)
    const compoundedReward = projected - principal

    return {
      principalGwei: principal,
      annualRewardGwei: annualReward,
      projectedGwei: projected,
      compoundedRewardGwei: compoundedReward,
      format: formatGwei,
    }
  }, [annualRatePct, compoundingPeriods, principalGwei])
}
