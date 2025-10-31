# SideBet Testing Guide

**For Sub-Agents**: This guide explains how to run and maintain tests for the SideBet application. All tests are designed to be run on-demand and provide clear summary output.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Testing Architecture](#testing-architecture)
3. [Running Tests](#running-tests)
4. [Writing Tests](#writing-tests)
5. [Admin Testing Utilities](#admin-testing-utilities)
6. [Sub-Agent Workflows](#sub-agent-workflows)
7. [Test Output Interpretation](#test-output-interpretation)
8. [Troubleshooting](#troubleshooting)

---

## Quick Start

### Installation

```bash
# Install all testing dependencies
npm install
```

### Run All Tests

```bash
# Run unit and integration tests
npm run test:all

# Run with coverage
npm run test:coverage

# Run specific test suites
npm run test:unit           # Unit tests only
npm run test:integration    # Integration tests only
npm run test:services       # Service layer tests only
```

### Admin Utilities

```bash
# Seed test data
npm run test:admin -- seed-all

# Clean up test data
npm run test:admin -- cleanup

# List test users
npm run test:admin -- list-users
```

---

## Testing Architecture

### Directory Structure

```
__tests__/
├── unit/                    # Unit tests (isolated components/services)
│   └── services/           # Service layer tests
│       ├── transactionService.test.ts
│       └── bulkLoadingService.test.ts
├── integration/            # Integration tests (workflows)
│   └── betting-workflow.test.ts
├── e2e/                    # End-to-end tests (Maestro)
├── helpers/                # Shared test utilities
│   ├── test-utils.ts      # Testing helper functions
│   ├── mock-data.ts       # Mock data generators
│   ├── amplify-mocks.ts   # Amplify service mocks
│   └── admin-utils.ts     # Admin test utilities
└── setup/                  # Test configuration
    ├── jest-setup.ts      # Jest setup
    └── test-env.ts        # Environment config

.maestro/                   # E2E test flows
├── flows/                 # User flow tests
│   ├── 01-login.yaml
│   ├── 02-create-bet.yaml
│   └── 03-join-bet.yaml
├── scripts/               # Helper scripts
└── config.yaml            # Maestro configuration
```

### Test Types

1. **Unit Tests**: Fast, isolated tests for individual functions/services
2. **Integration Tests**: Tests for workflows spanning multiple services
3. **E2E Tests**: Full user flow tests using Maestro (requires device/simulator)

---

## Running Tests

### Unit Tests

```bash
# Run all unit tests
npm run test:unit

# Run specific service tests
npm run test:services

# Run with verbose output
npm run test:verbose

# Watch mode (auto-rerun on changes)
npm run test:watch
```

### Integration Tests

```bash
# Run all integration tests
npm run test:integration
```

### E2E Tests

```bash
# Run all E2E flows
npm run test:e2e

# Run single E2E flow
npm run test:e2e:single -- .maestro/flows/01-login.yaml

# Requirements:
# - Maestro CLI installed: https://maestro.mobile.dev/getting-started/installing-maestro
# - App running on device/simulator
# - Test users seeded in database
```

### Coverage Reports

```bash
# Generate coverage report
npm run test:coverage

# View coverage report
open coverage/lcov-report/index.html
```

---

## Writing Tests

### Unit Test Template

```typescript
/**
 * Service Name Unit Tests
 * Brief description
 */

import { ServiceName } from '../../../src/services/serviceName';
import { MockUsers, MockFactory } from '../../helpers/mock-data';
import { createMockAmplifyClient } from '../../helpers/amplify-mocks';

// Mock Amplify client
const mockClient = createMockAmplifyClient();
jest.mock('aws-amplify/data', () => ({
  generateClient: jest.fn(() => mockClient),
}));

describe('ServiceName', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('methodName', () => {
    it('should do something correctly', async () => {
      // Arrange
      const input = MockFactory.user();

      // Act
      const result = await ServiceName.methodName(input);

      // Assert
      expect(result).toBeDefined();
      expect(mockClient.models.User.create).toHaveBeenCalled();
    });

    it('should handle error case', async () => {
      // Test error handling
      await expect(
        ServiceName.methodName(null)
      ).rejects.toThrow('Expected error message');
    });
  });
});
```

### Integration Test Template

```typescript
/**
 * Workflow Name Integration Tests
 * Tests complete workflow from start to finish
 */

import { MockUsers, MockBets, MockFactory } from '../helpers/mock-data';
import { createMockAmplifyClient } from '../helpers/amplify-mocks';

const mockClient = createMockAmplifyClient();
jest.mock('aws-amplify/data', () => ({
  generateClient: jest.fn(() => mockClient),
}));

describe('Workflow Name', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should complete entire workflow', async () => {
    // Step 1: Setup
    const user = MockUsers.regular;

    // Step 2: Execute workflow
    // ... workflow steps

    // Step 3: Verify results
    expect(mockClient.models.Bet.create).toHaveBeenCalled();
    expect(mockClient.models.Transaction.create).toHaveBeenCalled();
  });
});
```

### E2E Test Template (Maestro)

```yaml
# Workflow Name E2E Test
# Description of what this test does

appId: com.sidebet.app
---

# Step 1: Login
- runFlow: 01-login.yaml

# Step 2: Navigate
- tapOn: "Tab Name"

# Step 3: Interact
- assertVisible: "Expected Text"
- tapOn: "Button Name"

# Step 4: Verify
- assertVisible:
    text: "Success Message"
    timeout: 5000

# Log result
- runScript:
    file: ../scripts/log.js
    env:
      MESSAGE: "✅ Test passed"
```

---

## Admin Testing Utilities

The admin utilities help you manage test data for both manual and automated testing.

### Available Commands

```bash
# Seed test users (creates 3 test users: 2 regular, 1 admin)
npm run test:admin -- seed-users

# Seed test bets (creates 2 sample bets)
npm run test:admin -- seed-bets [creatorId]

# Seed everything (users + bets)
npm run test:admin -- seed-all

# Clean up all test data
npm run test:admin -- cleanup

# List all test users
npm run test:admin -- list-users

# Reset user balance
npm run test:admin -- reset-balance <userId> <amount>

# Make user an admin
npm run test:admin -- make-admin <userId>
```

### Test User Credentials

After running `seed-users`, you'll have:

1. **Regular User 1**
   - Email: `testuser1@sidebet.test`
   - Balance: $1000
   - Role: USER

2. **Regular User 2**
   - Email: `testuser2@sidebet.test`
   - Balance: $500
   - Role: USER

3. **Admin User**
   - Email: `testadmin@sidebet.test`
   - Balance: $5000
   - Role: ADMIN

### Example Workflow

```bash
# 1. Seed test data
npm run test:admin -- seed-all

# 2. List users to get IDs
npm run test:admin -- list-users

# 3. Adjust balance if needed
npm run test:admin -- reset-balance <userId> 2000

# 4. Run tests
npm run test:all

# 5. Clean up
npm run test:admin -- cleanup
```

---

## Sub-Agent Workflows

### Workflow 1: Run Tests After Code Changes

**When**: After modifying service code or business logic

```bash
# 1. Run relevant test suite
npm run test:services

# 2. If tests fail, read error output
# 3. Fix code or update tests
# 4. Re-run tests until passing
npm run test:services

# 5. Run full test suite
npm run test:all
```

### Workflow 2: Write New Tests for New Features

**When**: After adding new features or functions

```bash
# 1. Create test file in appropriate directory
# __tests__/unit/services/newService.test.ts

# 2. Use test template (see Writing Tests section)

# 3. Run new test
npm run test -- newService.test.ts

# 4. Ensure test passes
# 5. Commit test with feature code
```

### Workflow 3: Debug Failing Tests

**When**: Tests are failing and need investigation

```bash
# 1. Run test with verbose output
npm run test:verbose -- <test-file-name>

# 2. Check for:
#    - Mock data issues (helpers/mock-data.ts)
#    - Amplify client mocks (helpers/amplify-mocks.ts)
#    - Service logic errors
#    - Missing dependencies

# 3. Fix issues and re-run
npm run test -- <test-file-name>
```

### Workflow 4: Full Regression Testing

**When**: Before major releases or deployments

```bash
# 1. Seed test data
npm run test:admin -- seed-all

# 2. Run all tests with coverage
npm run test:coverage

# 3. Review coverage report
open coverage/lcov-report/index.html

# 4. Run E2E tests (if device available)
npm run test:e2e

# 5. Clean up test data
npm run test:admin -- cleanup
```

### Workflow 5: Maintain Tests

**When**: Code changes break existing tests

```bash
# 1. Identify failing test
npm run test

# 2. Read test file and understand expectations
# 3. Determine if:
#    a) Test needs updating (API changed)
#    b) Code has bug (fix code)
#    c) Mock data needs updating

# 4. Update test or code
# 5. Verify fix
npm run test -- <updated-test-file>
```

---

## Test Output Interpretation

### Successful Test Output

```
PASS  __tests__/unit/services/transactionService.test.ts
  TransactionService
    createDeposit
      ✓ should create a pending deposit transaction (15ms)
      ✓ should not update balance until approved (3ms)
      ✓ should throw error for invalid amount (2ms)

Test Suites: 1 passed, 1 total
Tests:       3 passed, 3 total
Snapshots:   0 total
Time:        2.5s
```

**Summary for user**: ✅ All 3 tests passed

### Failed Test Output

```
FAIL  __tests__/unit/services/transactionService.test.ts
  TransactionService
    createDeposit
      ✓ should create a pending deposit transaction (15ms)
      ✕ should not update balance until approved (25ms)
      ✓ should throw error for invalid amount (2ms)

  ● TransactionService › createDeposit › should not update balance until approved

    expect(jest.fn()).not.toHaveBeenCalled()

    Expected number of calls: 0
    Received number of calls: 1

      75 |       // Balance should not be updated for PENDING deposits
      76 |       expect(mockClient.models.User.update).not.toHaveBeenCalled();
         |                                              ^

Test Suites: 1 failed, 1 total
Tests:       1 failed, 2 passed, 3 total
```

**Summary for user**: ❌ 1 test failed, 2 passed (3 total)
**Issue**: Balance was updated when it shouldn't have been
**Action**: Check TransactionService.createDeposit implementation

### Summary Generation

Use the `parseTestResults` helper:

```typescript
import { parseTestResults } from './__tests__/helpers/test-utils';

const jestOutput = '... jest output ...';
const summary = parseTestResults(jestOutput);

console.log(summary.summary);
// Example: "✅ All 25 tests passed"
// Example: "❌ 3 tests failed, 22 passed (25 total)"
```

---

## Troubleshooting

### Common Issues

#### Issue 1: Tests can't find Amplify modules

**Symptom**: `Cannot find module 'aws-amplify/data'`

**Solution**:
```bash
# Ensure dependencies are installed
npm install

# Clear Jest cache
npx jest --clearCache

# Re-run tests
npm run test
```

#### Issue 2: Mock data doesn't match real data structure

**Symptom**: Tests fail with type errors or missing properties

**Solution**:
1. Check `__tests__/helpers/mock-data.ts`
2. Update mock objects to match current schema
3. Update `amplify/data/resource.ts` if needed

#### Issue 3: E2E tests fail to find elements

**Symptom**: Maestro can't find buttons or text

**Solution**:
1. Check element IDs match actual app UI
2. Increase timeout values
3. Verify app is running on device/simulator
4. Check if test data exists (run `npm run test:admin -- seed-all`)

#### Issue 4: Admin utilities can't connect to database

**Symptom**: "Unable to connect to Amplify"

**Solution**:
```bash
# Ensure Amplify is configured
npx ampx sandbox

# Check amplify_outputs.json exists
ls amplify_outputs.json

# Verify AWS credentials
aws configure list
```

#### Issue 5: Tests are slow

**Symptom**: Tests take >30 seconds to run

**Solution**:
```bash
# Run tests in parallel (default)
npm run test

# Run specific test file
npm run test -- transactionService.test.ts

# Disable coverage collection for faster runs
npm run test -- --coverage=false
```

---

## Best Practices

### For Sub-Agents

1. **Always run tests after code changes**
   ```bash
   npm run test:services  # Quick feedback
   npm run test:all       # Full verification
   ```

2. **Use mock data generators**
   ```typescript
   import { MockFactory } from '../../helpers/mock-data';
   const user = MockFactory.user({ balance: 500 });
   ```

3. **Clear mocks between tests**
   ```typescript
   beforeEach(() => {
     jest.clearAllMocks();
   });
   ```

4. **Write descriptive test names**
   ```typescript
   // ❌ Bad
   it('works', () => { ... });

   // ✅ Good
   it('should create deposit and update balance', () => { ... });
   ```

5. **Test both success and error cases**
   ```typescript
   it('should succeed with valid input', () => { ... });
   it('should throw error for invalid input', () => { ... });
   ```

6. **Use admin utilities for E2E testing**
   ```bash
   # Always seed before E2E tests
   npm run test:admin -- seed-all
   npm run test:e2e
   npm run test:admin -- cleanup
   ```

7. **Generate coverage reports regularly**
   ```bash
   npm run test:coverage
   ```

---

## Coverage Goals

- **Statements**: 50%+ (current threshold)
- **Branches**: 40%+ (current threshold)
- **Functions**: 50%+ (current threshold)
- **Lines**: 50%+ (current threshold)

**Target for core services**: 80%+ coverage

---

## Additional Resources

- **Jest Documentation**: https://jestjs.io/docs/getting-started
- **React Native Testing Library**: https://callstack.github.io/react-native-testing-library/
- **Maestro Documentation**: https://maestro.mobile.dev/
- **Testing Best Practices**: https://kentcdodds.com/blog/common-mistakes-with-react-testing-library

---

## Quick Reference

### Most Common Commands

```bash
# Run tests
npm run test                    # All tests
npm run test:unit              # Unit tests only
npm run test:services          # Service tests only
npm run test:all               # Unit + Integration

# Coverage
npm run test:coverage          # Generate coverage report

# Admin utilities
npm run test:admin -- seed-all    # Seed test data
npm run test:admin -- cleanup     # Clean test data
npm run test:admin -- list-users  # List test users

# E2E tests
npm run test:e2e               # Run all E2E flows
```

### Test File Locations

```
Unit tests:         __tests__/unit/services/*.test.ts
Integration tests:  __tests__/integration/*.test.ts
E2E tests:          .maestro/flows/*.yaml
Test helpers:       __tests__/helpers/*.ts
Mock data:          __tests__/helpers/mock-data.ts
```

---

**Last Updated**: 2025-10-31
**Version**: 1.0.0
