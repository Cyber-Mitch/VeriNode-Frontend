import { DisasterRecoveryDashboard } from '@/components/disaster-recovery/DisasterRecoveryDashboard'

export default function DisasterRecoveryPage() {
  return (
    <main className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="mx-auto max-w-6xl">
        <DisasterRecoveryDashboard />
      </div>
    </main>
  )
}
