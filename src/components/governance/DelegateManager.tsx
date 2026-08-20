'use client'

import React, { useState } from 'react'
import { useGovernanceStore } from '@/src/store/governanceStore'
import type { Delegate } from '@/src/types/governance'

function truncateAddress(addr: string) {
  if (!addr || addr.length <= 12) return addr
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

export function DelegateManager() {
  const {
    delegates,
    currentDelegation,
    userVotingPower,
    userTokenBalance,
    delegateVotes,
    revokeDelegation,
  } = useGovernanceStore()

  const [searchQuery, setSearchQuery] = useState('')
  const [customAddress, setCustomAddress] = useState('')
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const activeDelegateObj = delegates.find((d) => d.address === currentDelegation)

  const filteredDelegates = delegates.filter((d) => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      d.name.toLowerCase().includes(q) ||
      d.address.toLowerCase().includes(q) ||
      (d.statement && d.statement.toLowerCase().includes(q))
    )
  })

  const handleDelegate = (address: string) => {
    setFeedback(null)
    const res = delegateVotes(address)
    if (res.success) {
      setFeedback({
        type: 'success',
        message: `Successfully delegated ${userTokenBalance.toLocaleString()} VN voting power to ${truncateAddress(address)}!`,
      })
      setCustomAddress('')
    } else {
      setFeedback({
        type: 'error',
        message: res.error || 'Failed to delegate voting power',
      })
    }
  }

  const handleRevoke = () => {
    setFeedback(null)
    const res = revokeDelegation()
    if (res.success) {
      setFeedback({
        type: 'success',
        message: `Successfully revoked delegation! ${userTokenBalance.toLocaleString()} VN voting power returned to your wallet.`,
      })
    } else {
      setFeedback({
        type: 'error',
        message: res.error || 'Failed to revoke delegation',
      })
    }
  }

  const handleCustomDelegateSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!customAddress.trim()) {
      setFeedback({ type: 'error', message: 'Please enter a valid Stellar address' })
      return
    }
    handleDelegate(customAddress.trim())
  }

  return (
    <div className="space-y-6" data-testid="delegate-manager-container">
      {/* Top Banner: Current Delegation Status */}
      <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">Delegation Hub</h2>
            <p className="mt-1 text-xs text-slate-400">
              Delegate your voting weight to active community stewards without transferring token ownership.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs">
            <div className="rounded-xl border border-white/5 bg-slate-950/60 px-4 py-2">
              <span className="text-slate-500">Your Token Balance:</span>
              <p className="font-bold text-white">{userTokenBalance.toLocaleString()} VN</p>
            </div>

            <div className="rounded-xl border border-white/5 bg-slate-950/60 px-4 py-2">
              <span className="text-slate-500">Active Direct Power:</span>
              <p className="font-bold text-indigo-400">{userVotingPower.toLocaleString()} VN</p>
            </div>
          </div>
        </div>

        {/* Current status banner */}
        <div className="mt-6 rounded-xl border border-white/5 bg-slate-950/80 p-4">
          {currentDelegation ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-300 font-bold text-sm">
                  ✓
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-400">Currently Delegating to:</span>
                    <span className="text-sm font-bold text-white">
                      {activeDelegateObj ? activeDelegateObj.name : truncateAddress(currentDelegation)}
                    </span>
                  </div>
                  <p className="font-mono text-xs text-indigo-400">{currentDelegation}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleRevoke}
                className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-xs font-bold text-rose-300 hover:bg-rose-500/20 transition"
              >
                Revoke Delegation
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300 text-sm">
                  🛡️
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Self-Voting Mode</p>
                  <p className="text-xs text-slate-400">
                    You hold 100% of your voting power and cast votes directly on proposals.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Feedback alert */}
        {feedback && (
          <div
            className={`mt-4 rounded-xl border p-3 text-xs ${
              feedback.type === 'success'
                ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-300'
                : 'border-rose-500/40 bg-rose-950/40 text-rose-300'
            }`}
          >
            {feedback.message}
          </div>
        )}
      </div>

      {/* Manual Delegate Custom Address */}
      <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-5">
        <h3 className="text-sm font-bold text-white">Delegate to Custom Address</h3>
        <p className="mt-0.5 text-xs text-slate-400">
          Enter any Stellar public address to delegate your voting power.
        </p>

        <form onSubmit={handleCustomDelegateSubmit} className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={customAddress}
            onChange={(e) => setCustomAddress(e.target.value)}
            placeholder="e.g. GD7BX8M31NP4450KLS9921VZTTTR43100981A"
            aria-label="Custom delegate address"
            className="flex-1 rounded-xl border border-white/10 bg-slate-950/90 px-4 py-2 text-xs font-mono text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!customAddress.trim()}
            className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-50 transition"
          >
            Delegate
          </button>
        </form>
      </div>

      {/* Verified Delegates Directory */}
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-bold text-white">Verified Community Stewards</h3>
            <p className="text-xs text-slate-400">Recognized delegates with proven governance participation</p>
          </div>

          {/* Search Delegates */}
          <div className="w-full sm:w-72">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search delegates by name or address..."
              aria-label="Search delegates"
              className="w-full rounded-xl border border-white/10 bg-slate-900/90 px-3.5 py-2 text-xs text-slate-100 placeholder-slate-400 focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        {filteredDelegates.length === 0 ? (
          <div className="rounded-2xl border border-white/5 bg-slate-900/50 p-8 text-center text-xs text-slate-400">
            No delegates match your search query.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {filteredDelegates.map((delegate) => {
              const isSelected = currentDelegation === delegate.address

              return (
                <div
                  key={delegate.address}
                  data-testid={`delegate-card-${delegate.address}`}
                  className={`rounded-2xl border p-5 transition ${
                    isSelected
                      ? 'border-indigo-500/60 bg-slate-900 shadow-lg shadow-indigo-500/10'
                      : 'border-white/10 bg-slate-900/80 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-bold text-white">{delegate.name}</h4>
                      <p className="mt-0.5 font-mono text-xs text-indigo-400" title={delegate.address}>
                        {truncateAddress(delegate.address)}
                      </p>
                    </div>

                    {isSelected ? (
                      <span className="rounded-full border border-indigo-500/40 bg-indigo-500/20 px-2.5 py-0.5 text-xs font-semibold text-indigo-300">
                        Active Delegate
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleDelegate(delegate.address)}
                        className="rounded-xl border border-white/10 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-indigo-500 hover:bg-indigo-600 hover:text-white transition"
                      >
                        Delegate Power
                      </button>
                    )}
                  </div>

                  {delegate.statement && (
                    <p className="mt-3 text-xs leading-relaxed text-slate-400">
                      {delegate.statement}
                    </p>
                  )}

                  {/* Delegate metrics grid */}
                  <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl border border-white/5 bg-slate-950/60 p-3 text-center text-[11px]">
                    <div>
                      <span className="text-slate-500">Voting Power</span>
                      <p className="mt-0.5 font-bold text-slate-200">
                        {delegate.votingPower.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-500">Delegators</span>
                      <p className="mt-0.5 font-bold text-slate-200">{delegate.delegatorsCount}</p>
                    </div>
                    <div>
                      <span className="text-slate-500">Participation</span>
                      <p className="mt-0.5 font-bold text-emerald-400">{delegate.participationRate}%</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
