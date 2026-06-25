import React, { useState } from 'react';
import { useGasEstimate } from '../../hooks/useGasEstimate';

export function WithdrawalForm() {
  const [amount, setAmount] = useState('0');
  const { gasEstimate, loading } = useGasEstimate('withdraw', { amount });

  return (
    <div className="p-6 max-w-md mx-auto bg-gray-50 rounded-lg shadow-md">
      <h2 className="text-xl font-bold mb-4">Withdraw Tokens</h2>
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
      <button className="w-full bg-red-600 text-white p-2 rounded hover:bg-red-700">
        Confirm Withdrawal
      </button>
    </div>
  );
}
