import { describe, expect, it } from 'vitest';
import { accountIdFromArn, classifyCaller, isAdmin } from '../callerAuth';

const ACCOUNT = '111122223333';

describe('classifyCaller', () => {
  it('treats one of our Lambdas (IAM role in this account) as internal', () => {
    const caller = classifyCaller(
      { accountId: ACCOUNT, userArn: `arn:aws:sts::${ACCOUNT}:assumed-role/payout-role/session`, sourceIp: [], username: 'AROA:x' },
      ACCOUNT
    );
    expect(caller).toEqual({ kind: 'internal', arn: `arn:aws:sts::${ACCOUNT}:assumed-role/payout-role/session` });
  });

  it('denies an app user arriving with identity-pool IAM credentials', () => {
    // The app holds identity-pool credentials (for storage); with them it can sign AppSync
    // requests as IAM. Those requests carry the identity id and must never count as internal.
    expect(
      classifyCaller(
        { accountId: ACCOUNT, userArn: `arn:aws:sts::${ACCOUNT}:assumed-role/authRole/CognitoIdentityCredentials`, cognitoIdentityId: 'us-east-2:abc', cognitoIdentityPoolId: 'us-east-2:pool' },
        ACCOUNT
      )
    ).toMatchObject({ kind: 'denied' });
    expect(
      classifyCaller({ accountId: ACCOUNT, userArn: 'arn', cognitoIdentityPoolId: 'us-east-2:pool' }, ACCOUNT)
    ).toMatchObject({ kind: 'denied' });
  });

  it('denies IAM callers from another account', () => {
    expect(classifyCaller({ accountId: '999988887777', userArn: 'arn' }, ACCOUNT)).toEqual({ kind: 'denied', reason: 'other account' });
  });

  it('reads a user pool caller with their groups', () => {
    expect(classifyCaller({ sub: 'u-1', groups: ['admins'], claims: {} }, ACCOUNT)).toEqual({ kind: 'user', sub: 'u-1', groups: ['admins'] });
    expect(classifyCaller({ sub: 'u-1', groups: null }, ACCOUNT)).toEqual({ kind: 'user', sub: 'u-1', groups: [] });
  });

  it('denies a missing or unknown identity (API key, none)', () => {
    expect(classifyCaller(null, ACCOUNT)).toMatchObject({ kind: 'denied' });
    expect(classifyCaller({}, ACCOUNT)).toMatchObject({ kind: 'denied' });
  });
});

describe('isAdmin', () => {
  it('is the admins group, for user callers only', () => {
    expect(isAdmin({ kind: 'user', sub: 'u', groups: ['admins'] })).toBe(true);
    expect(isAdmin({ kind: 'user', sub: 'u', groups: ['bettors'] })).toBe(false);
    expect(isAdmin({ kind: 'internal', arn: 'x' })).toBe(false);
  });
});

describe('accountIdFromArn', () => {
  it('reads the account from a function ARN', () => {
    expect(accountIdFromArn('arn:aws:lambda:us-east-2:111122223333:function:money')).toBe('111122223333');
  });
});
