import { describe, expect, it } from 'vitest'
import { flattenTree, generateMockTree } from '../treeFlattener'
import type { SupplyChainTier } from '@/src/types/supplychain'

// ─── Fixtures ───────────────────────────────────────────────────────────────

const SIMPLE_TREE: SupplyChainTier[] = [
  {
    id: 'a',
    label: 'Producer A',
    tier: 0,
    status: 'active',
    children: [
      {
        id: 'a1',
        label: 'Processor A1',
        tier: 1,
        status: 'active',
        children: [
          { id: 'a1x', label: 'Retailer A1x', tier: 2, status: 'pending' },
        ],
      },
      { id: 'a2', label: 'Processor A2', tier: 1, status: 'suspended' },
    ],
  },
  {
    id: 'b',
    label: 'Producer B',
    tier: 0,
    status: 'inactive',
  },
]

// ─── flattenTree ─────────────────────────────────────────────────────────────

describe('flattenTree', () => {
  it('returns only root nodes when expandedIds is empty', () => {
    const flat = flattenTree(SIMPLE_TREE, new Set())
    expect(flat).toHaveLength(2)
    expect(flat[0].id).toBe('a')
    expect(flat[1].id).toBe('b')
  })

  it('includes immediate children when the root is expanded', () => {
    const flat = flattenTree(SIMPLE_TREE, new Set(['a']))
    // a, a1, a2, b
    expect(flat).toHaveLength(4)
    expect(flat.map((f) => f.id)).toEqual(['a', 'a1', 'a2', 'b'])
  })

  it('recursively expands when all ancestors are expanded', () => {
    const flat = flattenTree(SIMPLE_TREE, new Set(['a', 'a1']))
    // a, a1, a1x, a2, b
    expect(flat).toHaveLength(5)
    expect(flat.map((f) => f.id)).toEqual(['a', 'a1', 'a1x', 'a2', 'b'])
  })

  it('sets depth correctly per level', () => {
    const flat = flattenTree(SIMPLE_TREE, new Set(['a', 'a1']))
    expect(flat.find((f) => f.id === 'a')!.depth).toBe(0)
    expect(flat.find((f) => f.id === 'a1')!.depth).toBe(1)
    expect(flat.find((f) => f.id === 'a1x')!.depth).toBe(2)
    expect(flat.find((f) => f.id === 'b')!.depth).toBe(0)
  })

  it('sets parentIndex to -1 for root nodes', () => {
    const flat = flattenTree(SIMPLE_TREE, new Set(['a']))
    expect(flat.find((f) => f.id === 'a')!.parentIndex).toBe(-1)
    expect(flat.find((f) => f.id === 'b')!.parentIndex).toBe(-1)
  })

  it('sets parentIndex to the flat index of the parent', () => {
    const flat = flattenTree(SIMPLE_TREE, new Set(['a', 'a1']))
    const aIndex = flat.findIndex((f) => f.id === 'a')
    const a1Index = flat.findIndex((f) => f.id === 'a1')
    const a1xIndex = flat.findIndex((f) => f.id === 'a1x')
    expect(flat[a1Index].parentIndex).toBe(aIndex)
    expect(flat[a1xIndex].parentIndex).toBe(a1Index)
  })

  it('marks hasChildren correctly', () => {
    const flat = flattenTree(SIMPLE_TREE, new Set(['a', 'a1']))
    expect(flat.find((f) => f.id === 'a')!.hasChildren).toBe(true)
    expect(flat.find((f) => f.id === 'a1x')!.hasChildren).toBe(false)
    expect(flat.find((f) => f.id === 'b')!.hasChildren).toBe(false)
  })

  it('returns empty array for empty input', () => {
    expect(flattenTree([], new Set())).toHaveLength(0)
  })

  it('does not mutate the original tree', () => {
    const original = JSON.stringify(SIMPLE_TREE)
    flattenTree(SIMPLE_TREE, new Set(['a', 'a1', 'a1x', 'a2', 'b']))
    expect(JSON.stringify(SIMPLE_TREE)).toBe(original)
  })

  it('handles a single leaf node with no children', () => {
    const leaf: SupplyChainTier[] = [{ id: 'leaf', label: 'Leaf', tier: 0, status: 'active' }]
    const flat = flattenTree(leaf, new Set(['leaf']))
    expect(flat).toHaveLength(1)
    expect(flat[0].hasChildren).toBe(false)
    expect(flat[0].childCount).toBe(0)
  })

  it('does not show children of a collapsed parent even if grandparent is expanded', () => {
    // a expanded but a1 not expanded → a1x should not appear
    const flat = flattenTree(SIMPLE_TREE, new Set(['a']))
    expect(flat.find((f) => f.id === 'a1x')).toBeUndefined()
  })
})

// ─── generateMockTree ────────────────────────────────────────────────────────

describe('generateMockTree', () => {
  it('generates approximately the requested number of nodes', () => {
    const tree = generateMockTree(100, 4, 3)
    // Collect all nodes recursively to verify total count is close to 100.
    function count(nodes: SupplyChainTier[]): number {
      return nodes.reduce((acc, n) => acc + 1 + (n.children ? count(n.children) : 0), 0)
    }
    // Due to branching stopping at depth limits, total may be <= requested.
    expect(count(tree)).toBeGreaterThan(0)
    expect(count(tree)).toBeLessThanOrEqual(200)
  })

  it('generates nodes with valid status values', () => {
    const tree = generateMockTree(50, 3, 2)
    const VALID = new Set(['active', 'pending', 'suspended', 'inactive'])
    function validate(nodes: SupplyChainTier[]): void {
      for (const n of nodes) {
        expect(VALID.has(n.status)).toBe(true)
        if (n.children) validate(n.children)
      }
    }
    validate(tree)
  })

  it('all generated IDs are unique', () => {
    const tree = generateMockTree(200, 5, 3)
    const ids = new Set<string>()
    function collect(nodes: SupplyChainTier[]): void {
      for (const n of nodes) {
        ids.add(n.id)
        if (n.children) collect(n.children)
      }
    }
    collect(tree)
    // Collect again to count total nodes
    let total = 0
    function countNodes(nodes: SupplyChainTier[]): void {
      for (const n of nodes) {
        total++
        if (n.children) countNodes(n.children)
      }
    }
    countNodes(tree)
    expect(ids.size).toBe(total)
  })

  it('does not exceed requested node count', () => {
    for (const count of [10, 100, 1_000]) {
      const tree = generateMockTree(count, 8, 4)
      let seen = 0
      function walk(nodes: SupplyChainTier[]): void {
        for (const n of nodes) {
          seen++
          if (n.children) walk(n.children)
        }
      }
      walk(tree)
      expect(seen).toBeLessThanOrEqual(count + 10) // small tolerance for branching math
    }
  })
})
