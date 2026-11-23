import { describe, expect, it } from 'vitest';
import {
  isDuplicate,
  proPaymentFailedNotificationId,
  resolutionNeededNotificationId,
  squaresReminderNotificationId,
  stripeEventNotificationId,
} from '../notificationIds';

describe('notification ids', () => {
  it('gives each event one id, distinct across kinds', () => {
    const ids = [
      resolutionNeededNotificationId('x'),
      squaresReminderNotificationId('x'),
      stripeEventNotificationId('x'),
      proPaymentFailedNotificationId('x', '2026-12-01T00:00:00.000Z'),
    ];
    expect(new Set(ids).size).toBe(ids.length);
    expect(resolutionNeededNotificationId('bet-1')).toBe(resolutionNeededNotificationId('bet-1'));
  });

  it('gives a failed Pro payment a new id each billing period', () => {
    expect(proPaymentFailedNotificationId('sub', '2026-12-01T00:00:00.000Z')).not.toBe(
      proPaymentFailedNotificationId('sub', '2027-01-01T00:00:00.000Z')
    );
  });
});

describe('isDuplicate', () => {
  it('recognises AppSync refusing a create whose id exists', () => {
    expect(isDuplicate([{ errorType: 'DynamoDB:ConditionalCheckFailedException', message: 'The conditional request failed' }])).toBe(true);
    expect(isDuplicate([{ message: 'The conditional request failed (Service: DynamoDb)' }])).toBe(true);
  });

  it('treats any other error, or none, as not a duplicate', () => {
    expect(isDuplicate([{ errorType: 'Unauthorized', message: 'Not Authorized to access createNotification' }])).toBe(false);
    expect(isDuplicate([{ errorType: 'DynamoDB:ConditionalCheckFailedException' }, { errorType: 'Unauthorized' }])).toBe(false);
    expect(isDuplicate([])).toBe(false);
    expect(isDuplicate(undefined)).toBe(false);
  });
});
