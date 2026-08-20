'use client'

import React, { useState } from 'react'
import { useGovernanceStore } from '@/src/store/governanceStore'
import { ProposalList } from '@/src/components/governance/ProposalList'
import { ProposalDetail } from '@/src/components/governance/ProposalDetail'
import { DelegateManager } from '@/src/components/governance/DelegateManager'
import { ProposalCreator } from '@/src/components/governance/ProposalCreator'
import { VoteHistoryTable } from '@/src/components/governance/VoteHistoryTable'

type MainTab = 'proposals' | 'delegates' | 'create' | 'history'

export default function GovernancePage() {
  const {
    selectedProposalId,
    selectProposal,
    getMetrics,
    currentDelegation,
    delegates,
  } = useGovernanceStore()

  const [activeTab, setActiveTab] = useState<MainTab>('proposals')
  const metrics = getMetrics()

  const activeDelegate = delegates.find((d) => d.address === currentDelegation)

  const handleSelectProposal = (id: string) => {
    selectProposal(id)
    setActiveTab('proposals')
  }

  const handleProposalCreated = (id: string) => {
    selectProposal(id)
    setActiveTab('proposals')
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <main className="mx-auto max-w-7xl space-y-8">
        {/* Page Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-500/20 text-xs text-indigo-400">
                🏛️
              </span>
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
                On-Chain Governance
              </span>
            </div>
            <h1 className="mt-1 text-2xl font-extrabold text-white sm:text-3xl">
              Governance Voting Dashboard
            </h1>
            <p className="mt-1 text-xs text-slate-400 sm:text-sm">
              Participate in VeriNode protocol decisions, cast quadratic/token-weighted votes, and delegate voting power.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                selectProposal(null)
                setActiveTab('create')
              }}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500 transition"
            >
              <span>+</span>
              <span>New Proposal</span>
            </button>

            <button
              type="button"
              onClick={() => {
                selectProposal(null)
                setActiveTab('delegates')
              }}
              className="rounded-xl border border-white/10 bg-slate-900 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-200 hover:border-white/20 hover:bg-slate-800 transition"
            >
              Delegate Power
            </button>
          </div>
        </div>

        {/* Top Protocol Metrics Bar */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {/* Total Proposals */}
          <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4">
            <span className="text-[11px] font-medium text-slate-400">Total Proposals</span>
            <p className="mt-1 text-xl font-extrabold text-white">{metrics.totalProposals}</p>
            <span className="text-[10px] text-slate-500">All-time proposals</span>
          </div>

          {/* Active Proposals */}
          <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4">
            <span className="text-[11px] font-medium text-slate-400">Active Proposals</span>
            <p className="mt-1 text-xl font-extrabold text-emerald-400">{metrics.activeProposals}</p>
            <span className="text-[10px] text-emerald-400/80">Open for voting</span>
          </div>

          {/* Average Turnout */}
          <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4">
            <span className="text-[11px] font-medium text-slate-400">Average Turnout</span>
            <p className="mt-1 text-xl font-extrabold text-indigo-400">{metrics.averageTurnout}%</p>
            <span className="text-[10px] text-indigo-400/80">Quorum benchmark</span>
          </div>

          {/* Your Voting Power */}
          <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4">
            <span className="text-[11px] font-medium text-slate-400">Your Voting Power</span>
            <p className="mt-1 text-xl font-extrabold text-white">{metrics.userVotingPower.toLocaleString()} VN</p>
            <span className="text-[10px] text-slate-500">
              Balance: {metrics.userTokenBalance.toLocaleString()} VN
            </span>
          </div>

          {/* Delegation Status */}
          <div className="col-span-2 rounded-2xl border border-white/10 bg-slate-900/80 p-4 sm:col-span-1">
            <span className="text-[11px] font-medium text-slate-400">Delegation Status</span>
            <p className="mt-1 text-sm font-bold text-slate-200 truncate">
              {currentDelegation
                ? activeDelegate
                  ? activeDelegate.name
                  : `${currentDelegation.slice(0, 6)}...`
                : 'Self-Voting'}
            </p>
            <span className="text-[10px] text-slate-500">
              {currentDelegation ? 'Power delegated' : 'Direct voting active'}
            </span>
          </div>
        </section>

        {/* Main Tab Navigation */}
        <div className="border-b border-white/10">
          <nav className="flex space-x-8" aria-label="Governance Navigation Tabs">
            {[
              { id: 'proposals', label: 'Proposals', icon: '📋' },
              { id: 'delegates', label: 'Delegate Hub', icon: '👥' },
              { id: 'create', label: 'Create Proposal', icon: '✍️' },
              { id: 'history', label: 'My Vote History', icon: '📜' },
            ].map((tab) => {
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    if (tab.id !== 'proposals') selectProposal(null)
                    setActiveTab(tab.id as MainTab)
                  }}
                  className={`flex items-center gap-2 border-b-2 py-3 text-xs font-semibold transition ${
                    isActive
                      ? 'border-indigo-500 text-indigo-400'
                      : 'border-transparent text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              )
            })}
          </nav>
        </div>

        {/* Tab Content Panels */}
        <div className="transition-all duration-200">
          {activeTab === 'proposals' && (
            selectedProposalId ? (
              <ProposalDetail
                proposalId={selectedProposalId}
                onBack={() => selectProposal(null)}
              />
            ) : (
              <ProposalList onSelectProposal={handleSelectProposal} />
            )
          )}

          {activeTab === 'delegates' && <DelegateManager />}

          {activeTab === 'create' && (
            <ProposalCreator onProposalCreated={handleProposalCreated} />
          )}

          {activeTab === 'history' && (
            <VoteHistoryTable onSelectProposal={handleSelectProposal} />
          )}
        </div>
      </main>
    </div>
  )
}
