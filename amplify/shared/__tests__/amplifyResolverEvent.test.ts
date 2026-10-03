import { describe, expect, it } from 'vitest';
import { resolverFieldName } from '../amplifyResolverEvent';

// The payload Amplify's function transformer sends (graphql-function-transformer's
// "Invoke AWS Lambda data source" request template), as the device-registry Lambda logged it.
const amplifyEvent = {
  typeName: 'Mutation',
  fieldName: 'registerDevice',
  arguments: { installationId: 'inst-1', token: 'tok', platform: 'WEB' },
  identity: { sub: 'user-1', username: 'user-1' },
  source: null,
  request: { headers: {} },
  prev: null,
};

describe('resolverFieldName', () => {
  it('reads the field from the top level, where Amplify puts it', () => {
    expect(resolverFieldName(amplifyEvent)).toBe('registerDevice');
  });

  it('does not look in info: Amplify never sends it, and reading it is the bug this guards', () => {
    expect(resolverFieldName({ info: { fieldName: 'sendTestPush' } })).toBeUndefined();
  });

  it('returns undefined for a DynamoDB stream event and for non-objects', () => {
    expect(resolverFieldName({ Records: [] })).toBeUndefined();
    expect(resolverFieldName(null)).toBeUndefined();
    expect(resolverFieldName('sendTestPush')).toBeUndefined();
  });
});
