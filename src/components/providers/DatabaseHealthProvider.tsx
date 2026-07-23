'use client'

import { useEffect } from 'react'
import { databaseHealthMonitor } from '@/src/services/db/databaseHealthMonitor'

export function DatabaseHealthProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    databaseHealthMonitor.start()
    return () => {
      databaseHealthMonitor.stop()
    }
  }, [])

  return <>{children}</>
}
