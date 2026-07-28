import { sha256 } from '@/src/lib/crypto'

export type MigrationDirection = 'up' | 'down'
export type MigrationStatus = 'pending' | 'running' | 'applied' | 'rolled_back' | 'failed'

export interface DatabaseMigrationContext<TDatabase = unknown> {
  db: TDatabase
  now: () => number
  emitMetric?: (metric: MigrationMetric) => void
  log?: (entry: MigrationLogEntry) => void
}

export interface DatabaseMigration<TDatabase = unknown> {
  version: number
  name: string
  description: string
  up: (context: DatabaseMigrationContext<TDatabase>) => Promise<void> | void
  down: (context: DatabaseMigrationContext<TDatabase>) => Promise<void> | void
  criticalPath?: boolean
}

export interface MigrationRecord {
  version: number
  name: string
  checksum: string
  appliedAt: number
  status: Exclude<MigrationStatus, 'pending' | 'running'>
  durationMs: number
  direction: MigrationDirection
  error?: string
}

export interface MigrationMetric {
  name: 'database_migration_duration_ms' | 'database_migration_failure_total' | 'database_migration_rollback_total'
  value: number
  tags: Record<string, string>
  timestamp: number
}

export interface MigrationLogEntry {
  level: 'info' | 'error'
  message: string
  migrationVersion: number
  migrationName: string
  direction: MigrationDirection
  durationMs?: number
  error?: string
}

export interface MigrationPlan {
  direction: MigrationDirection
  fromVersion: number
  toVersion: number
  migrations: Array<Pick<DatabaseMigration, 'version' | 'name' | 'description' | 'criticalPath'>>
}

export interface MigrationStateStore {
  getAppliedMigrations(): Promise<MigrationRecord[]>
  recordMigration(record: MigrationRecord): Promise<void>
  removeMigration(version: number): Promise<void>
}

export const MIGRATION_P99_TARGET_MS = 100

export class InMemoryMigrationStateStore implements MigrationStateStore {
  private records = new Map<number, MigrationRecord>()

  async getAppliedMigrations(): Promise<MigrationRecord[]> {
    return Array.from(this.records.values()).sort((a, b) => a.version - b.version)
  }

  async recordMigration(record: MigrationRecord): Promise<void> {
    this.records.set(record.version, record)
  }

  async removeMigration(version: number): Promise<void> {
    this.records.delete(version)
  }
}

export class DatabaseMigrationManager<TDatabase = unknown> {
  private migrations: DatabaseMigration<TDatabase>[]

  constructor(
    migrations: DatabaseMigration<TDatabase>[],
    private readonly stateStore: MigrationStateStore,
  ) {
    this.migrations = [...migrations].sort((a, b) => a.version - b.version)
    this.validateMigrations()
  }

  getAvailableMigrations(): DatabaseMigration<TDatabase>[] {
    return [...this.migrations]
  }

  async getCurrentVersion(): Promise<number> {
    const applied = await this.stateStore.getAppliedMigrations()
    return applied.reduce((max, record) => Math.max(max, record.version), 0)
  }

  async createPlan(targetVersion = this.latestVersion()): Promise<MigrationPlan> {
    const fromVersion = await this.getCurrentVersion()
    const direction: MigrationDirection = targetVersion >= fromVersion ? 'up' : 'down'
    const selected = direction === 'up'
      ? this.migrations.filter((migration) => migration.version > fromVersion && migration.version <= targetVersion)
      : this.migrations.filter((migration) => migration.version <= fromVersion && migration.version > targetVersion).reverse()

    return {
      direction,
      fromVersion,
      toVersion: targetVersion,
      migrations: selected.map(({ version, name, description, criticalPath }) => ({
        version,
        name,
        description,
        criticalPath,
      })),
    }
  }

  async migrate(context: Omit<DatabaseMigrationContext<TDatabase>, 'now'> & { now?: () => number }, targetVersion = this.latestVersion()): Promise<MigrationPlan> {
    const runtimeContext: DatabaseMigrationContext<TDatabase> = { ...context, now: context.now ?? Date.now }
    const plan = await this.createPlan(targetVersion)

    for (const planItem of plan.migrations) {
      const migration = this.migrations.find((candidate) => candidate.version === planItem.version)
      if (!migration) throw new Error(`Migration ${planItem.version} is not registered`)
      await this.runMigration(migration, plan.direction, runtimeContext)
    }

    return plan
  }

  private async runMigration(
    migration: DatabaseMigration<TDatabase>,
    direction: MigrationDirection,
    context: DatabaseMigrationContext<TDatabase>,
  ): Promise<void> {
    const start = context.now()
    const tags = { version: String(migration.version), name: migration.name, direction }

    try {
      context.log?.({
        level: 'info',
        message: `Starting database migration ${direction}`,
        migrationVersion: migration.version,
        migrationName: migration.name,
        direction,
      })

      await migration[direction](context)

      const durationMs = context.now() - start
      const checksum = await checksumMigration(migration)
      const record: MigrationRecord = {
        version: migration.version,
        name: migration.name,
        checksum,
        appliedAt: context.now(),
        status: direction === 'up' ? 'applied' : 'rolled_back',
        durationMs,
        direction,
      }

      if (direction === 'up') await this.stateStore.recordMigration(record)
      else await this.stateStore.removeMigration(migration.version)

      context.emitMetric?.({ name: 'database_migration_duration_ms', value: durationMs, tags, timestamp: context.now() })
      if (direction === 'down') {
        context.emitMetric?.({ name: 'database_migration_rollback_total', value: 1, tags, timestamp: context.now() })
      }
      context.log?.({
        level: 'info',
        message: `Completed database migration ${direction}`,
        migrationVersion: migration.version,
        migrationName: migration.name,
        direction,
        durationMs,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown migration failure'
      const durationMs = context.now() - start
      context.emitMetric?.({ name: 'database_migration_failure_total', value: 1, tags, timestamp: context.now() })
      context.log?.({
        level: 'error',
        message: `Failed database migration ${direction}`,
        migrationVersion: migration.version,
        migrationName: migration.name,
        direction,
        durationMs,
        error: message,
      })
      throw new Error(`Migration ${migration.version} ${direction} failed: ${message}`)
    }
  }

  private latestVersion(): number {
    return this.migrations.at(-1)?.version ?? 0
  }

  private validateMigrations(): void {
    const seen = new Set<number>()
    let previous = 0
    for (const migration of this.migrations) {
      if (!Number.isInteger(migration.version) || migration.version < 1) {
        throw new Error(`Migration ${migration.name} must use a positive integer version`)
      }
      if (seen.has(migration.version)) {
        throw new Error(`Duplicate migration version ${migration.version}`)
      }
      if (migration.version !== previous + 1) {
        throw new Error(`Migration versions must be contiguous; expected ${previous + 1} but received ${migration.version}`)
      }
      seen.add(migration.version)
      previous = migration.version
    }
  }
}

export async function checksumMigration(migration: Pick<DatabaseMigration, 'version' | 'name' | 'description'>): Promise<string> {
  return sha256(JSON.stringify({
    version: migration.version,
    name: migration.name,
    description: migration.description,
  }))
}
