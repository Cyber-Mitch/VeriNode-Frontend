import React, { useState } from 'react';
import Head from 'next/head';
import DelegationFlowGraph from '@/src/components/canvas/DelegationFlowGraph';

type TabType = 'overview' | 'flow' | 'validators';

export default function StakingDashboard() {
  const [activeTab, setActiveTab] = useState<TabType>('flow');

  return (
    <>
      <Head>
        <title>Staking Dashboard | VeriNode</title>
        <meta name="description" content="Manage liquid staking delegations, monitor validator performance, and view staking flow analytics." />
      </Head>

      <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100 font-sans">
        {/* Top Navbar */}
        <header className="border-b border-white/10 bg-slate-900/80 px-6 py-4 backdrop-blur-md">
          <div className="mx-auto flex max-w-7xl items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-tr from-purple-600 to-blue-500 font-bold text-white shadow-md">
                V
              </div>
              <span className="text-lg font-bold tracking-tight text-white">
                VeriNode <span className="text-purple-400 font-medium">Staking</span>
              </span>
            </div>

            {/* Navigation Tabs */}
            <nav className="flex gap-1 rounded-xl bg-slate-950 p-1 border border-white/5">
              {(['overview', 'flow', 'validators'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`rounded-lg px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition ${
                    activeTab === tab
                      ? 'bg-gradient-to-r from-purple-600 to-blue-500 text-white shadow-md'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {tab === 'flow' ? 'Delegation Flow' : tab}
                </button>
              ))}
            </nav>

            {/* Right-side Wallet Status placeholder */}
            <div className="flex items-center gap-2 rounded-xl bg-slate-800/50 px-3 py-1.5 border border-white/5 text-xs font-semibold text-slate-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Soroban Connected</span>
            </div>
          </div>
        </header>

        {/* Dashboard Content */}
        <main className="flex-1 flex flex-col min-h-0">
          {activeTab === 'flow' && (
            <div className="flex-1 relative min-h-[600px] h-[calc(100vh-80px)]">
              <DelegationFlowGraph />
            </div>
          )}

          {activeTab === 'overview' && (
            <div className="mx-auto w-full max-w-7xl p-6 space-y-6">
              {/* Staking Summary Cards */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-6 backdrop-blur-sm">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Value Locked</span>
                  <p className="mt-2 text-3xl font-extrabold text-white">270,701.5 ETH</p>
                  <span className="mt-1 block text-xs text-emerald-400 font-semibold">▲ +4.2% (24h)</span>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-6 backdrop-blur-sm">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Average Staking APR</span>
                  <p className="mt-2 text-3xl font-extrabold text-amber-400">3.93%</p>
                  <span className="mt-1 block text-xs text-slate-400">Net protocol average</span>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-6 backdrop-blur-sm">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Active Validators</span>
                  <p className="mt-2 text-3xl font-extrabold text-white">3 / 5</p>
                  <span className="mt-1 block text-xs text-slate-400">1 Exiting • 1 Slashed</span>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-6 backdrop-blur-sm">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Connected Holders</span>
                  <p className="mt-2 text-3xl font-extrabold text-white">7,465</p>
                  <span className="mt-1 block text-xs text-emerald-400 font-semibold">▲ +12 today</span>
                </div>
              </div>

              {/* Protocol breakdown table */}
              <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-6">
                <h3 className="text-base font-bold text-white mb-4">Supported Liquid Staking Protocols</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-slate-300">
                    <thead>
                      <tr className="border-b border-white/10 text-xs font-bold uppercase text-slate-400">
                        <th className="py-3 px-4">Protocol</th>
                        <th className="py-3 px-4">Total Deposited</th>
                        <th className="py-3 px-4">Staking APR</th>
                        <th className="py-3 px-4">Depositors</th>
                        <th className="py-3 px-4">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      <tr>
                        <td className="py-4 px-4 font-bold text-white">Lido Finance (stETH)</td>
                        <td className="py-4 px-4">154,200.5 ETH</td>
                        <td className="py-4 px-4 text-amber-400 font-semibold">3.8%</td>
                        <td className="py-4 px-4">4,210</td>
                        <td className="py-4 px-4">
                          <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">Active</span>
                        </td>
                      </tr>
                      <tr>
                        <td className="py-4 px-4 font-bold text-white">Rocket Pool (rETH)</td>
                        <td className="py-4 px-4">82,400.2 ETH</td>
                        <td className="py-4 px-4 text-amber-400 font-semibold">4.1%</td>
                        <td className="py-4 px-4">2,315</td>
                        <td className="py-4 px-4">
                          <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">Active</span>
                        </td>
                      </tr>
                      <tr>
                        <td className="py-4 px-4 font-bold text-white">Swell Network (swETH)</td>
                        <td className="py-4 px-4">34,100.8 ETH</td>
                        <td className="py-4 px-4 text-amber-400 font-semibold">3.9%</td>
                        <td className="py-4 px-4">940</td>
                        <td className="py-4 px-4">
                          <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">Active</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'validators' && (
            <div className="mx-auto w-full max-w-7xl p-6 space-y-6">
              {/* Validator Node Performance list */}
              <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-base font-bold text-white">Node Operators & Validators</h3>
                  <span className="text-xs text-slate-400 font-semibold">Monitoring 5 nodes</span>
                </div>
                <div className="space-y-3">
                  {[
                    { name: 'P2P Validator', status: 'active', stake: '95,000 ETH', apr: '4.2%', color: 'border-emerald-500/20 text-emerald-400 bg-emerald-500/10' },
                    { name: 'Chorus One', status: 'active', stake: '72,000 ETH', apr: '4.0%', color: 'border-emerald-500/20 text-emerald-400 bg-emerald-500/10' },
                    { name: 'Figment', status: 'active', stake: '88,000 ETH', apr: '3.9%', color: 'border-emerald-500/20 text-emerald-400 bg-emerald-500/10' },
                    { name: 'Sigma Operator', status: 'exiting', stake: '12,000 ETH', apr: '1.5%', color: 'border-orange-500/20 text-orange-400 bg-orange-500/10' },
                    { name: 'Alpha Node', status: 'slashed', stake: '3,700 ETH', apr: '0.0%', color: 'border-red-500/20 text-red-400 bg-red-500/10' },
                  ].map((val) => (
                    <div
                      key={val.name}
                      className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/5 bg-slate-900/50 p-4 transition hover:bg-slate-800/40"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-850 font-bold text-slate-400">
                          {val.name[0]}
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-white">{val.name}</h4>
                          <span className="text-xs text-slate-400">Managed stake: {val.stake}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <span className="block text-[10px] uppercase font-bold text-slate-500">APR</span>
                          <span className="text-sm font-bold text-amber-400">{val.apr}</span>
                        </div>
                        <div className="text-right">
                          <span className="block text-[10px] uppercase font-bold text-slate-500">Status</span>
                          <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${val.color}`}>
                            {val.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </>
  );
}
