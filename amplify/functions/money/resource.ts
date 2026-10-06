import { defineFunction } from '@aws-amplify/backend';

/**
 * The money function: the only code that changes a balance (docs/SECURITY_PLAN.md).
 *
 * Lives in the data stack (resourceGroupName: 'data') because it writes the model tables
 * directly for atomic ledger transactions; table names and permissions are wired in
 * backend.ts. In its own stack, referencing the tables would close a dependency cycle
 * (the data stack already depends on it as a resolver).
 */
export const money = defineFunction({
  name: 'money',
  entry: './handler.ts',
  resourceGroupName: 'data',
  environment: {
    AMPLIFY_DATA_GRAPHQL_ENDPOINT: process.env.AMPLIFY_DATA_GRAPHQL_ENDPOINT || '',
  },
  timeoutSeconds: 60,
  memoryMB: 512,
});
