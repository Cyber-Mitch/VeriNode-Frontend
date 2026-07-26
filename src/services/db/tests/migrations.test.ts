import { describe, expect, it, vi } from 'vitest'
import {
  DatabaseMigrationManager,
  InMemoryMigrationStateStore,
  MIGRATION_P99_TARGET_MS,
  type DatabaseMigration,
  type MigrationMetric,
} from '@/src/services/db/migrations'

interface FakeDb {
  fields: string[]
}

const migrations: DatabaseMigration<FakeDb>[] = [
  {
    version: 1,
    name: 'create-validator-index',
    description: 'Creates the validator index used by offline storage lookups.',
    criticalPath: true,
    up: ({ db }) => {
      db.fields.push('validatorIndex')
    },
    down: ({ db }) => {
      db.fields = db.fields.filter((field) => field !== 'validatorIndex')
    },
  },
  {
    version: 2,
    name: 'add-migration-audit-log',
    description: 'Adds an append-only audit log for database migration records.',
    up: ({ db }) => {
      db.fields.push('migrationAuditLog')
    },
    down: ({ db }) => {
      db.fields = db.fields.filter((field) => field !== 'migrationAuditLog')
    },
  },
]

function makeClock(stepMs = 3): () => number {
  let current = 1_800_000_000_000
  return () => {
    current += stepMs
    return current
  }
}

describe('DatabaseMigrationManager', () => {
  it('creates deterministic forward migration plans', async () => {
    const manager = new DatabaseMigrationManager(migrations, new InMemoryMigrationStateStore())

    await expect(manager.createPlan()).resolves.toMatchObject({
      direction: 'up',
      fromVersion: 0,
      toVersion: 2,
      migrations: [
        { version: 1, name: 'create-validator-index', criticalPath: true },
        { version: 2, name: 'add-migration-audit-log' },
      ],
    })
  })

  it('applies migrations, records versions, and emits duration metrics under the P99 target', async () => {
    const db: FakeDb = { fields: [] }
    const metrics: MigrationMetric[] = []
    const store = new InMemoryMigrationStateStore()
    const manager = new DatabaseMigrationManager(migrations, store)

    await manager.migrate({ db, now: makeClock(), emitMetric: (metric) => metrics.push(metric) })

    expect(db.fields).toEqual(['validatorIndex', 'migrationAuditLog'])
    await expect(manager.getCurrentVersion()).resolves.toBe(2)
    expect(metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'database_migration_duration_ms', value: 3 }),
      ]),
    )
    expect(Math.max(...metrics.map((metric) => metric.value))).toBeLessThan(MIGRATION_P99_TARGET_MS)
  })

  it('rolls migrations back in reverse order and removes applied records', async () => {
    const db: FakeDb = { fields: [] }
    const store = new InMemoryMigrationStateStore()
    const manager = new DatabaseMigrationManager(migrations, store)

    await manager.migrate({ db, now: makeClock() })
    const rollbackPlan = await manager.migrate({ db, now: makeClock() }, 0)

    expect(rollbackPlan).toMatchObject({ direction: 'down', fromVersion: 2, toVersion: 0 })
    expect(rollbackPlan.migrations.map((migration) => migration.version)).toEqual([2, 1])
    expect(db.fields).toEqual([])
    await expect(manager.getCurrentVersion()).resolves.toBe(0)
  })

  it('rejects non-contiguous migration versions', () => {
    expect(() => new DatabaseMigrationManager([migrations[1]], new InMemoryMigrationStateStore())).toThrow(
      'Migration versions must be contiguous',
    )
  })

  it('emits failure metrics and preserves the original failure message', async () => {
    const metrics: MigrationMetric[] = []
    const manager = new DatabaseMigrationManager<FakeDb>([
      {
        version: 1,
        name: 'broken-migration',
        description: 'Exercises migration failure reporting.',
        up: () => {
          throw new Error('DDL rejected')
        },
        down: vi.fn(),
      },
    ], new InMemoryMigrationStateStore())

    await expect(manager.migrate({ db: { fields: [] }, now: makeClock(), emitMetric: (metric) => metrics.push(metric) })).rejects.toThrow(
      'Migration 1 up failed: DDL rejected',
    )
    expect(metrics).toEqual([
      expect.objectContaining({ name: 'database_migration_failure_total', value: 1 }),
    ])
  })
})
