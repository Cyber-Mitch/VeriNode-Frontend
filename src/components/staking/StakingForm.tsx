import React, { useState } from 'react';
import { useGasEstimate } from '../../hooks/useGasEstimate';
import { CacheStatsPanel } from '../network/CacheStatsPanel';

export function StakingForm() {
  const [amount, setAmount] = useState('0');
  const { gasEstimate, loading } = useGasEstimate('stake', { amount });

  return (
    <div className="p-6 max-w-md mx-auto bg-gray-50 rounded-lg shadow-md">
      <h2 className="text-xl font-bold mb-4">Stake Tokens</h2>
      <div className="mb-4">
        <label className="block mb-1">Amount</label>
        <input 
          type="number" 
          value={amount} 
          onChange={(e) => setAmount(e.target.value)}
          className="w-full border p-2 rounded"
        />
      </div>
      <div className="mb-4 text-sm text-gray-600">
        Estimated Gas: {loading ? 'Estimating...' : (gasEstimate ? gasEstimate.toString() : 'N/A')}
      </div>
      <button className="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700">
        Confirm Stake
      </button>
      
      <div className="mt-8">
        <CacheStatsPanel />
      </div>
    </div>
  );
}
