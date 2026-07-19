// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import type { ReactNode } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useBridgeTx } from '@/src/hooks/useBridgeTx'
import { BridgeTransactionList } from '@/src/components/bridge/BridgeTransactionList'
import { makeBridgeTx } from '@/src/components/bridge/tests/fixtures'
import type { UseBridgeTxResult } from '@/src/hooks/useBridgeTx'

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
  usePathname: vi.fn(),
  useSearchParams: vi.fn(),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('@/src/hooks/useBridgeTx', () => ({
  useBridgeTx: vi.fn(),
}))

const replaceMock = vi.fn()

function mockSearchParams(query: string) {
  vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams(query) as unknown as ReturnType<typeof useSearchParams>)
}

function mockBridgeTxResult(overrides: Partial<UseBridgeTxResult>) {
  vi.mocked(useBridgeTx).mockReturnValue({
    transactions: [],
    total: 0,
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    refresh: vi.fn(),
    hasActive: false,
    ...overrides,
  })
}

afterEach(() => cleanup())

describe('BridgeTransactionList', () => {
  beforeEach(() => {
    vi.mocked(useRouter).mockReturnValue({ replace: replaceMock } as unknown as ReturnType<typeof useRouter>)
    vi.mocked(usePathname).mockReturnValue('/bridge')
    mockSearchParams('')
    replaceMock.mockClear()
  })

  it('renders a row per transaction with route, amount, status, and initiated date', () => {
    mockBridgeTxResult({
      transactions: [makeBridgeTx({ id: 'tx-1', sourceChain: 'ethereum', destChain: 'base', amount: '42' })],
      total: 1,
    })

    render(<BridgeTransactionList />)

    expect(screen.getByText(/Ethereum.*Base/)).toBeTruthy()
    expect(screen.getByText('42 USDC')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'View' }).getAttribute('href')).toBe('/bridge/tx-1')
  })

  it('shows a loading skeleton only on first load, not once data has arrived', () => {
    mockBridgeTxResult({ transactions: [], total: 0, isLoading: true })
    const { container, rerender } = render(<BridgeTransactionList />)
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)

    mockBridgeTxResult({
      transactions: [makeBridgeTx()],
      total: 1,
      isFetching: true, // background poll refresh, not first load
    })
    rerender(<BridgeTransactionList />)
    expect(container.querySelectorAll('.animate-pulse').length).toBe(0)
    expect(screen.getByText(/Updating…/)).toBeTruthy()
  })

  it('distinguishes "no transactions at all" from "no rows match the filters"', () => {
    mockBridgeTxResult({ transactions: [], total: 0 })
    const { rerender } = render(<BridgeTransactionList />)
    expect(screen.getByText('No bridge transactions yet.')).toBeTruthy()

    mockSearchParams('chain=ethereum')
    rerender(<BridgeTransactionList />)
    expect(screen.getByText('No transactions match the current filters.')).toBeTruthy()
  })

  it('changing the chain filter updates the URL and resets the page to 1', () => {
    mockSearchParams('page=3')
    mockBridgeTxResult({ transactions: [makeBridgeTx()], total: 1 })

    render(<BridgeTransactionList />)
    fireEvent.change(screen.getByLabelText('Chain'), { target: { value: 'polygon' } })

    expect(replaceMock).toHaveBeenCalledTimes(1)
    const [url] = replaceMock.mock.calls[0]
    expect(url).toContain('chain=polygon')
    expect(url).not.toContain('page=')
  })

  it('changing the status filter also resets the page to 1', () => {
    mockSearchParams('page=2')
    mockBridgeTxResult({ transactions: [makeBridgeTx()], total: 1 })

    render(<BridgeTransactionList />)
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'complete' } })

    const [url] = replaceMock.mock.calls[0]
    expect(url).toContain('status=complete')
    expect(url).not.toContain('page=')
  })

  it('paginates forward and back without touching the active filters', () => {
    mockSearchParams('chain=ethereum&page=2')
    mockBridgeTxResult({ transactions: [makeBridgeTx()], total: 100 })

    render(<BridgeTransactionList />)
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))

    const [url] = replaceMock.mock.calls[0]
    expect(url).toContain('chain=ethereum')
    expect(url).toContain('page=3')
  })

  it('disables Previous on the first page', () => {
    mockSearchParams('')
    mockBridgeTxResult({ transactions: [makeBridgeTx()], total: 1 })

    render(<BridgeTransactionList />)
    expect((screen.getByRole('button', { name: 'Previous page' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('surfaces the hook error state to the user', () => {
    mockBridgeTxResult({ isError: true, error: new Error('backend unreachable') })
    render(<BridgeTransactionList />)
    expect(screen.getByRole('alert').textContent).toContain('backend unreachable')
  })
})
