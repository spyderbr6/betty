/**
 * Test Event Fetcher Utility
 *
 * Use this to manually test the event fetching functionality
 */

import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';

const client = generateClient<Schema>();

/**
 * Manually trigger the event fetcher Lambda function
 */
export async function triggerEventFetch(): Promise<void> {
  try {
    console.log('[TestEventFetcher] Triggering event fetch...');

    const { data, errors } = await client.queries.fetchEventsManually({
      triggerTime: new Date().toISOString()
    });

    if (errors) {
      console.error('[TestEventFetcher] Errors:', errors);
      throw new Error('Event fetch failed');
    }

    console.log('[TestEventFetcher] Event fetch result:', data);
    console.log('[TestEventFetcher] ✅ Event fetch triggered successfully');

  } catch (error) {
    console.error('[TestEventFetcher] Failed to trigger event fetch:', error);
    throw error;
  }
}

/**
 * Check how many events are in the database
 */
export async function checkEventsInDatabase(): Promise<number> {
  try {
    console.log('[TestEventFetcher] Checking events in database...');

    const { data: events, errors } = await client.models.LiveEvent.list({
      limit: 1000
    });

    if (errors) {
      console.error('[TestEventFetcher] Errors fetching events:', errors);
      return 0;
    }

    console.log(`[TestEventFetcher] Found ${events?.length || 0} events in database`);

    if (events && events.length > 0) {
      console.log('[TestEventFetcher] Sample event:', {
        id: events[0].id,
        homeTeam: events[0].homeTeam,
        awayTeam: events[0].awayTeam,
        status: events[0].status,
        scheduledTime: events[0].scheduledTime
      });
    }

    return events?.length || 0;

  } catch (error) {
    console.error('[TestEventFetcher] Failed to check events:', error);
    return 0;
  }
}

/**
 * Test the TheSportsDB API directly (without Lambda)
 */
export async function testSportsAPI(): Promise<void> {
  try {
    console.log('[TestEventFetcher] Testing TheSportsDB API directly...');

    const today = new Date().toISOString().split('T')[0];
    const url = `https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=${today}&l=4387`; // NBA

    console.log('[TestEventFetcher] Fetching from:', url);

    const response = await fetch(url);
    const data = await response.json();

    console.log('[TestEventFetcher] API Response:', {
      eventsCount: data.events?.length || 0,
      firstEvent: data.events?.[0] ? {
        idEvent: data.events[0].idEvent,
        strEvent: data.events[0].strEvent,
        dateEvent: data.events[0].dateEvent,
        strTime: data.events[0].strTime
      } : null
    });

    if (!data.events || data.events.length === 0) {
      console.log('[TestEventFetcher] ⚠️  No events found for today. This might be normal if no NBA games scheduled.');
      console.log('[TestEventFetcher] Try checking tomorrow\'s date or a different league (NFL: 4391)');
    } else {
      console.log(`[TestEventFetcher] ✅ API working! Found ${data.events.length} events`);
    }

  } catch (error) {
    console.error('[TestEventFetcher] Failed to test API:', error);
    throw error;
  }
}

/**
 * Full diagnostic test
 */
export async function runFullDiagnostics(): Promise<void> {
  console.log('\n========== EVENT SYSTEM DIAGNOSTICS ==========\n');

  // Step 1: Test API
  console.log('Step 1: Testing TheSportsDB API...');
  await testSportsAPI();
  console.log('');

  // Step 2: Check database
  console.log('Step 2: Checking database for existing events...');
  const eventCount = await checkEventsInDatabase();
  console.log('');

  // Step 3: Trigger fetch
  console.log('Step 3: Triggering event fetch Lambda...');
  await triggerEventFetch();
  console.log('');

  // Step 4: Check database again
  console.log('Step 4: Checking database again after fetch...');
  await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
  const newEventCount = await checkEventsInDatabase();
  console.log('');

  console.log('========== DIAGNOSTICS COMPLETE ==========');
  console.log(`Events before: ${eventCount}`);
  console.log(`Events after: ${newEventCount}`);
  console.log(`Events added: ${newEventCount - eventCount}`);
  console.log('==========================================\n');
}
