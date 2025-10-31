/**
 * Test Utilities
 * Shared utilities for all tests
 */

import { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react-native';

/**
 * Custom render function that wraps components with necessary providers
 */
export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return render(ui, { ...options });
}

/**
 * Wait for a condition to be true
 */
export async function waitForCondition(
  condition: () => boolean,
  timeout = 5000,
  interval = 100
): Promise<void> {
  const startTime = Date.now();

  while (!condition()) {
    if (Date.now() - startTime > timeout) {
      throw new Error('Timeout waiting for condition');
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
}

/**
 * Create a mock user object
 */
export function createMockUser(overrides?: Partial<any>) {
  return {
    id: 'test-user-id',
    email: 'test@example.com',
    displayName: 'Test User',
    balance: 1000,
    role: 'USER',
    trustScore: 100,
    totalBets: 0,
    totalWinnings: 0,
    winRate: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Create a mock bet object
 */
export function createMockBet(overrides?: Partial<any>) {
  return {
    id: 'test-bet-id',
    title: 'Test Bet',
    description: 'A test bet',
    betAmount: 50,
    sideAName: 'Team A',
    sideBName: 'Team B',
    status: 'ACTIVE',
    creatorId: 'test-creator-id',
    participantCount: 0,
    expiresAt: new Date(Date.now() + 86400000).toISOString(), // 24 hours from now
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Create a mock transaction object
 */
export function createMockTransaction(overrides?: Partial<any>) {
  return {
    id: 'test-transaction-id',
    userId: 'test-user-id',
    type: 'DEPOSIT',
    status: 'COMPLETED',
    amount: 100,
    balanceBefore: 900,
    balanceAfter: 1000,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Create a mock bet participant object
 */
export function createMockParticipant(overrides?: Partial<any>) {
  return {
    id: 'test-participant-id',
    betId: 'test-bet-id',
    userId: 'test-user-id',
    side: 'A',
    amount: 50,
    joinedAt: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Generate a random ID for testing
 */
export function generateTestId(prefix = 'test'): string {
  return `${prefix}-${Math.random().toString(36).substring(7)}`;
}

/**
 * Sleep for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Assert that a value is defined (TypeScript type guard)
 */
export function assertDefined<T>(value: T | null | undefined): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error('Value is not defined');
  }
}

/**
 * Parse test result summary from Jest output
 * Used by sub-agents to generate summaries
 */
export function parseTestResults(jestOutput: string): {
  passed: number;
  failed: number;
  total: number;
  summary: string;
} {
  const passMatch = jestOutput.match(/(\d+) passed/);
  const failMatch = jestOutput.match(/(\d+) failed/);
  const totalMatch = jestOutput.match(/(\d+) total/);

  const passed = passMatch ? parseInt(passMatch[1]) : 0;
  const failed = failMatch ? parseInt(failMatch[1]) : 0;
  const total = totalMatch ? parseInt(totalMatch[1]) : passed + failed;

  const summary = failed > 0
    ? `❌ ${failed} test${failed !== 1 ? 's' : ''} failed, ${passed} passed (${total} total)`
    : `✅ All ${passed} test${passed !== 1 ? 's' : ''} passed`;

  return { passed, failed, total, summary };
}
