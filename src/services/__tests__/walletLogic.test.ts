import { describe, expect, it } from 'vitest';
import { decideProblem, newRequestId, parseWalletResult, withdrawProblem } from '../walletLogic';

describe('parseWalletResult', () => {
  it('reads an expected answer as an object or JSON text, and nothing else', () => {
    const requested = { status: 'requested', transactionId: 'withdrawal#x', amount: 50, fee: 1, net: 49, balance: 0 };
    expect(parseWalletResult(JSON.stringify(requested), ['requested', 'refused'])).toEqual(requested);
    expect(parseWalletResult({ status: 'decided' }, ['requested', 'refused'])).toBeNull();
    expect(parseWalletResult('x', ['requested'])).toBeNull();
  });
});

describe('newRequestId', () => {
  it('is a fresh v4 UUID each time', () => {
    expect(newRequestId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(newRequestId()).not.toBe(newRequestId());
  });
});

describe('withdrawProblem', () => {
  it('has nothing to say once the request is in', () => {
    expect(withdrawProblem({ status: 'requested', transactionId: 't', amount: 50, fee: 1, net: 49, balance: 0 })).toBeNull();
  });

  it('explains a refusal, with the balance or the minimum', () => {
    expect(withdrawProblem({ status: 'refused', reason: 'INSUFFICIENT_FUNDS', balance: 12.5, required: 50 })).toEqual({
      title: 'Insufficient Balance',
      message: 'You only have $12.50 available.',
    });
    expect(withdrawProblem({ status: 'refused', reason: 'BELOW_MINIMUM', minimum: 10 })?.message).toBe('Minimum withdrawal is $10.00.');
    expect(withdrawProblem(null)?.title).toBe('Error');
  });
});

describe('decideProblem', () => {
  it('has nothing to say once decided, and explains a refusal', () => {
    expect(decideProblem({ status: 'decided', outcome: 'COMPLETED', userId: 'u', credited: 25 })).toBeNull();
    expect(decideProblem({ status: 'refused', reason: 'NOT_ADMIN' })).toContain('admins group');
    expect(decideProblem({ status: 'refused', reason: 'NOT_PENDING' })).toContain('already been decided');
    expect(decideProblem(null)).toContain('could not be saved');
  });
});
