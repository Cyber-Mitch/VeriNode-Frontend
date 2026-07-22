// Supply chain tier types for multi-tier hierarchy virtualization (#43)

export type TierStatus = 'active' | 'pending' | 'suspended' | 'inactive'

export interface SupplyChainTier {
  id: string
  label: string
  tier: number
  status: TierStatus
  /**
   * Freeform metadata displayed inside the tier row. Variable content means
   * rows can have dynamic heights.
   */
  metadata?: Record<string, string | number>
  /** Nested children — this is what drives multi-tier (8+) depth. */
  children?: SupplyChainTier[]
}

/** A flattened representation of SupplyChainTier used by the virtualizer. */
export interface FlatTier {
  id: string
  label: string
  tier: number
  status: TierStatus
  metadata?: Record<string, string | number>
  /** Depth in the tree (0 = root). */
  depth: number
  /** Index of the parent item in the flat array, or -1 for root nodes. */
  parentIndex: number
  /** Whether this node has children. */
  hasChildren: boolean
  /** Original child count (0 if leaf). */
  childCount: number
}
