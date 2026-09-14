import { describe, expect, it } from 'vitest';
import {
  buildExpoMessages,
  countSuccesses,
  succeededTokenIds,
  partitionTokens,
  tokensToDeactivate,
  type PushTokenRecord,
} from '../pushLogic';

const token = (over: Partial<PushTokenRecord> = {}): PushTokenRecord => ({
  id: 'tok-1',
  token: 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]',
  platform: 'ANDROID',
  isActive: true,
  ...over,
});

describe('partitionTokens', () => {
  it('drops inactive tokens before doing anything else', () => {
    const { active, mobile, web } = partitionTokens([
      token({ id: 'a' }),
      token({ id: 'b', isActive: false }),
      token({ id: 'c', platform: 'WEB', isActive: false }),
    ]);
    expect(active.map((t) => t.id)).toEqual(['a']);
    expect(mobile.map((t) => t.id)).toEqual(['a']);
    expect(web).toEqual([]);
  });

  it('splits mobile from web', () => {
    const { mobile, web } = partitionTokens([
      token({ id: 'ios', platform: 'IOS' }),
      token({ id: 'android', platform: 'ANDROID' }),
      token({ id: 'web', platform: 'WEB' }),
    ]);
    expect(mobile.map((t) => t.id)).toEqual(['ios', 'android']);
    expect(web.map((t) => t.id)).toEqual(['web']);
  });

  it('ignores an unknown platform rather than treating it as mobile', () => {
    const { mobile, web } = partitionTokens([token({ id: 'x', platform: 'DESKTOP' })]);
    expect(mobile).toEqual([]);
    expect(web).toEqual([]);
  });

  it('survives null, which is what the data layer returns when there are no rows', () => {
    expect(partitionTokens(null).active).toEqual([]);
  });
});

describe('buildExpoMessages', () => {
  it('routes HIGH priority to the urgent channel', () => {
    const [msg] = buildExpoMessages([token()], 'Title', 'Body', { betId: 'b1' }, 'HIGH');
    expect(msg.priority).toBe('high');
    expect(msg.channelId).toBe('urgent');
    expect(msg.data).toEqual({ betId: 'b1' });
  });

  it('treats anything below HIGH as normal', () => {
    for (const p of ['MEDIUM', 'LOW', 'anything-else']) {
      const [msg] = buildExpoMessages([token()], 'T', 'B', undefined, p);
      expect(msg.priority, `priority ${p}`).toBe('normal');
      expect(msg.channelId, `channel ${p}`).toBe('default');
    }
  });

  it('defaults missing data to an empty object, never undefined', () => {
    const [msg] = buildExpoMessages([token()], 'T', 'B', undefined, 'LOW');
    expect(msg.data).toEqual({});
  });

  it('emits one message per token, addressed to that token', () => {
    const msgs = buildExpoMessages(
      [token({ token: 'A' }), token({ token: 'B' })],
      'T',
      'B',
      {},
      'LOW'
    );
    expect(msgs.map((m) => m.to)).toEqual(['A', 'B']);
  });
});

describe('tokensToDeactivate', () => {
  it('correlates tickets to tokens positionally, not by filtered index', () => {
    // The regression this guards: tickets are filtered to the failures, then the
    // filtered index was used against the unfiltered token array. With one
    // failure in the middle that disabled token A and left B — the dead one —
    // active, so a healthy device went silent and a dead one was retried forever.
    const tokens = [token({ id: 'A' }), token({ id: 'B' }), token({ id: 'C' })];
    const tickets = [
      { status: 'ok' },
      { status: 'error', details: { error: 'DeviceNotRegistered' } },
      { status: 'ok' },
    ];
    expect(tokensToDeactivate(tokens, tickets)).toEqual(['B']);
  });

  it('deactivates every dead token when several fail', () => {
    const tokens = [token({ id: 'A' }), token({ id: 'B' }), token({ id: 'C' })];
    const tickets = [
      { status: 'error', details: { error: 'DeviceNotRegistered' } },
      { status: 'ok' },
      { status: 'error', details: { error: 'DeviceNotRegistered' } },
    ];
    expect(tokensToDeactivate(tokens, tickets)).toEqual(['A', 'C']);
  });

  it('leaves tokens alone for errors that are not DeviceNotRegistered', () => {
    // A transient MessageRateExceeded must not cost the user their registration.
    const tokens = [token({ id: 'A' })];
    const tickets = [{ status: 'error', details: { error: 'MessageRateExceeded' } }];
    expect(tokensToDeactivate(tokens, tickets)).toEqual([]);
  });

  it('ignores an error ticket with no details', () => {
    expect(tokensToDeactivate([token({ id: 'A' })], [{ status: 'error' }])).toEqual([]);
  });

  it('returns nothing when Expo sent no ticket array', () => {
    expect(tokensToDeactivate([token()], undefined)).toEqual([]);
  });

  it('does not fall over when Expo returns more tickets than tokens', () => {
    const tickets = [
      { status: 'error', details: { error: 'DeviceNotRegistered' } },
      { status: 'error', details: { error: 'DeviceNotRegistered' } },
    ];
    expect(tokensToDeactivate([token({ id: 'A' })], tickets)).toEqual(['A']);
  });
});

describe('succeededTokenIds', () => {
  it('stamps the tokens that actually succeeded, not the first N', () => {
    const tokens = [token({ id: 'A' }), token({ id: 'B' }), token({ id: 'C' })];
    const tickets = [
      { status: 'error', details: { error: 'DeviceNotRegistered' } },
      { status: 'ok' },
      { status: 'ok' },
    ];
    expect(succeededTokenIds(tokens, tickets)).toEqual(['B', 'C']);
  });

  it('returns nothing when every send failed', () => {
    const tokens = [token({ id: 'A' })];
    expect(succeededTokenIds(tokens, [{ status: 'error' }])).toEqual([]);
  });
});

describe('countSuccesses', () => {
  it('counts only ok tickets', () => {
    expect(countSuccesses([{ status: 'ok' }, { status: 'error' }, { status: 'ok' }])).toBe(2);
  });

  it('is zero for an absent ticket array', () => {
    expect(countSuccesses(null)).toBe(0);
  });
});
