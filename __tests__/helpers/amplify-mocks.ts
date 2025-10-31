/**
 * Amplify Mocks
 * Mock implementations of AWS Amplify services for testing
 */

import { MockUsers, MockBets, MockTransactions, MockParticipants } from './mock-data';

/**
 * Mock Amplify Data Client
 * Simulates the generateClient API from aws-amplify/data
 */
export function createMockAmplifyClient() {
  const mockStore = {
    users: [MockUsers.regular, MockUsers.admin, MockUsers.lowBalance, MockUsers.newUser],
    bets: [MockBets.active, MockBets.pendingResolution, MockBets.resolved, MockBets.cancelled],
    transactions: [
      MockTransactions.deposit,
      MockTransactions.pendingDeposit,
      MockTransactions.withdrawal,
      MockTransactions.betPlaced,
      MockTransactions.betWon,
    ],
    participants: [MockParticipants.sideA, MockParticipants.sideB],
  };

  return {
    models: {
      User: {
        get: jest.fn(({ id }: { id: string }) =>
          Promise.resolve({
            data: mockStore.users.find(u => u.id === id) || null,
            errors: [],
          })
        ),
        list: jest.fn(() =>
          Promise.resolve({
            data: mockStore.users,
            errors: [],
          })
        ),
        create: jest.fn((data: any) =>
          Promise.resolve({
            data: { id: `user-${Date.now()}`, ...data },
            errors: [],
          })
        ),
        update: jest.fn((data: any) =>
          Promise.resolve({
            data: { ...data },
            errors: [],
          })
        ),
        delete: jest.fn(({ id }: { id: string }) =>
          Promise.resolve({
            data: { id },
            errors: [],
          })
        ),
      },
      Bet: {
        get: jest.fn(({ id }: { id: string }) =>
          Promise.resolve({
            data: mockStore.bets.find(b => b.id === id) || null,
            errors: [],
          })
        ),
        list: jest.fn(() =>
          Promise.resolve({
            data: mockStore.bets,
            errors: [],
          })
        ),
        create: jest.fn((data: any) =>
          Promise.resolve({
            data: { id: `bet-${Date.now()}`, participantCount: 0, ...data },
            errors: [],
          })
        ),
        update: jest.fn((data: any) =>
          Promise.resolve({
            data: { ...data },
            errors: [],
          })
        ),
        delete: jest.fn(({ id }: { id: string }) =>
          Promise.resolve({
            data: { id },
            errors: [],
          })
        ),
      },
      Transaction: {
        get: jest.fn(({ id }: { id: string }) =>
          Promise.resolve({
            data: mockStore.transactions.find(t => t.id === id) || null,
            errors: [],
          })
        ),
        list: jest.fn(() =>
          Promise.resolve({
            data: mockStore.transactions,
            errors: [],
          })
        ),
        create: jest.fn((data: any) =>
          Promise.resolve({
            data: { id: `transaction-${Date.now()}`, ...data },
            errors: [],
          })
        ),
        update: jest.fn((data: any) =>
          Promise.resolve({
            data: { ...data },
            errors: [],
          })
        ),
      },
      BetParticipant: {
        get: jest.fn(({ id }: { id: string }) =>
          Promise.resolve({
            data: mockStore.participants.find(p => p.id === id) || null,
            errors: [],
          })
        ),
        list: jest.fn(() =>
          Promise.resolve({
            data: mockStore.participants,
            errors: [],
          })
        ),
        create: jest.fn((data: any) =>
          Promise.resolve({
            data: { id: `participant-${Date.now()}`, ...data },
            errors: [],
          })
        ),
        delete: jest.fn(({ id }: { id: string }) =>
          Promise.resolve({
            data: { id },
            errors: [],
          })
        ),
      },
    },
    // Add mock store for testing purposes
    __mockStore: mockStore,
  };
}

/**
 * Mock Auth functions
 */
export const mockAuth = {
  fetchAuthSession: jest.fn(() =>
    Promise.resolve({
      tokens: {
        accessToken: {
          toString: () => 'mock-access-token',
        },
      },
    })
  ),
  signIn: jest.fn(({ username, password }: { username: string; password: string }) =>
    Promise.resolve({
      isSignedIn: true,
      nextStep: { signInStep: 'DONE' },
    })
  ),
  signOut: jest.fn(() => Promise.resolve()),
  getCurrentUser: jest.fn(() =>
    Promise.resolve({
      userId: MockUsers.regular.id,
      username: MockUsers.regular.email,
    })
  ),
};

/**
 * Mock Storage functions
 */
export const mockStorage = {
  uploadData: jest.fn(({ path, data }: { path: string; data: any }) =>
    Promise.resolve({
      result: {
        path,
        key: path,
      },
    })
  ),
  getUrl: jest.fn(({ path }: { path: string }) =>
    Promise.resolve({
      url: new URL(`https://mock-s3-bucket.s3.amazonaws.com/${path}`),
      expiresAt: new Date(Date.now() + 3600000),
    })
  ),
  remove: jest.fn(({ path }: { path: string }) =>
    Promise.resolve({
      path,
    })
  ),
};

/**
 * Setup all Amplify mocks
 * Call this in individual test files to enable mocking
 */
export function setupAmplifyMocks() {
  const mockClient = createMockAmplifyClient();

  jest.mock('aws-amplify/data', () => ({
    generateClient: jest.fn(() => mockClient),
  }));

  jest.mock('aws-amplify/auth', () => mockAuth);
  jest.mock('aws-amplify/storage', () => mockStorage);

  return { mockClient, mockAuth, mockStorage };
}

/**
 * Reset all mock calls and implementations
 */
export function resetAmplifyMocks() {
  jest.clearAllMocks();
}
