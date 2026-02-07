/**
 * Migration utility to populate displayNameLower for existing users
 * This should be run once to migrate existing users who have displayName but no displayNameLower
 */

import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';

const client = generateClient<Schema>();

/**
 * Migrate all users with displayName to have displayNameLower
 * @returns Number of users migrated
 */
export async function migrateDisplayNameLower(): Promise<number> {
  try {
    console.log('[Migration] Starting displayNameLower migration...');

    // Fetch all users
    const { data: allUsers } = await client.models.User.list();

    if (!allUsers || allUsers.length === 0) {
      console.log('[Migration] No users found');
      return 0;
    }

    let migratedCount = 0;

    // Update users who have displayName but not displayNameLower
    for (const user of allUsers) {
      if (user.displayName && !user.displayNameLower) {
        try {
          await client.models.User.update({
            id: user.id!,
            displayNameLower: user.displayName.toLowerCase(),
          });
          migratedCount++;
          console.log(`[Migration] Updated user ${user.id} (${user.displayName})`);
        } catch (error) {
          console.error(`[Migration] Failed to update user ${user.id}:`, error);
        }
      }
    }

    console.log(`[Migration] Migration complete. ${migratedCount} users updated.`);
    return migratedCount;
  } catch (error) {
    console.error('[Migration] Migration failed:', error);
    throw error;
  }
}

/**
 * Check how many users need migration
 * @returns Number of users needing migration
 */
export async function checkMigrationStatus(): Promise<{
  total: number;
  needsMigration: number;
  migrated: number;
}> {
  try {
    const { data: allUsers } = await client.models.User.list();

    if (!allUsers || allUsers.length === 0) {
      return { total: 0, needsMigration: 0, migrated: 0 };
    }

    const total = allUsers.length;
    const usersWithDisplayName = allUsers.filter(u => u.displayName);
    const needsMigration = usersWithDisplayName.filter(u => !u.displayNameLower).length;
    const migrated = usersWithDisplayName.filter(u => u.displayNameLower).length;

    return { total, needsMigration, migrated };
  } catch (error) {
    console.error('[Migration] Status check failed:', error);
    throw error;
  }
}
