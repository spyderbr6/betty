/**
 * Admin Testing Utilities
 * Tools for sub-agents to manage test data and user accounts
 *
 * Usage:
 *   npm run test:admin -- seed-users      # Create test users
 *   npm run test:admin -- seed-bets       # Create test bets
 *   npm run test:admin -- seed-all        # Seed everything
 *   npm run test:admin -- cleanup         # Clean test data
 *   npm run test:admin -- reset-balance <userId> <amount>
 *   npm run test:admin -- make-admin <userId>
 */

import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { Amplify } from 'aws-amplify';
import outputs from '../../amplify_outputs.json';

// Configure Amplify
Amplify.configure(outputs);
const client = generateClient<Schema>();

/**
 * Seed test users
 */
export async function seedTestUsers() {
  console.log('🌱 Seeding test users...');

  const testUsers = [
    {
      email: 'testuser1@sidebet.test',
      displayName: 'Test User 1',
      balance: 1000,
      role: 'USER',
    },
    {
      email: 'testuser2@sidebet.test',
      displayName: 'Test User 2',
      balance: 500,
      role: 'USER',
    },
    {
      email: 'testadmin@sidebet.test',
      displayName: 'Test Admin',
      balance: 5000,
      role: 'ADMIN',
    },
  ];

  const results = [];
  for (const user of testUsers) {
    try {
      // Check if user already exists
      const { data: existing } = await client.models.User.list({
        filter: { email: { eq: user.email } },
      });

      if (existing && existing.length > 0) {
        console.log(`  ⏭️  User ${user.email} already exists, skipping`);
        results.push({ email: user.email, status: 'exists', id: existing[0].id });
        continue;
      }

      // Create user
      const { data, errors } = await client.models.User.create({
        ...user,
        trustScore: 100,
        totalBets: 0,
        totalWinnings: 0,
        winRate: 0,
      });

      if (errors) {
        console.error(`  ❌ Error creating ${user.email}:`, errors);
        results.push({ email: user.email, status: 'error', errors });
      } else {
        console.log(`  ✅ Created user: ${user.email} (${data?.id})`);
        results.push({ email: user.email, status: 'created', id: data?.id });
      }
    } catch (error) {
      console.error(`  ❌ Exception creating ${user.email}:`, error);
      results.push({ email: user.email, status: 'exception', error });
    }
  }

  return results;
}

/**
 * Seed test bets
 */
export async function seedTestBets(creatorId?: string) {
  console.log('🌱 Seeding test bets...');

  if (!creatorId) {
    console.log('  ℹ️  No creator ID provided, finding test user...');
    const { data: users } = await client.models.User.list({
      filter: { email: { eq: 'testuser1@sidebet.test' } },
    });

    if (!users || users.length === 0) {
      console.error('  ❌ No test users found. Run seed-users first.');
      return [];
    }

    creatorId = users[0].id;
    console.log(`  ℹ️  Using creator: ${creatorId}`);
  }

  const testBets = [
    {
      title: 'Lakers vs Warriors',
      description: 'Who will win tonight?',
      betAmount: 50,
      sideAName: 'Lakers',
      sideBName: 'Warriors',
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 86400000).toISOString(), // 24 hours
    },
    {
      title: 'Bitcoin Price',
      description: 'Will BTC hit $100k this year?',
      betAmount: 100,
      sideAName: 'Yes',
      sideBName: 'No',
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 2592000000).toISOString(), // 30 days
    },
  ];

  const results = [];
  for (const bet of testBets) {
    try {
      const { data, errors } = await client.models.Bet.create({
        ...bet,
        creatorId,
        participantCount: 0,
      });

      if (errors) {
        console.error(`  ❌ Error creating bet "${bet.title}":`, errors);
        results.push({ title: bet.title, status: 'error', errors });
      } else {
        console.log(`  ✅ Created bet: "${bet.title}" (${data?.id})`);
        results.push({ title: bet.title, status: 'created', id: data?.id });
      }
    } catch (error) {
      console.error(`  ❌ Exception creating bet "${bet.title}":`, error);
      results.push({ title: bet.title, status: 'exception', error });
    }
  }

  return results;
}

/**
 * Clean up test data
 */
export async function cleanupTestData() {
  console.log('🧹 Cleaning up test data...');

  // Delete test users
  const { data: testUsers } = await client.models.User.list({
    filter: {
      email: { contains: '@sidebet.test' },
    },
  });

  console.log(`  🗑️  Found ${testUsers?.length || 0} test users to delete`);

  if (testUsers) {
    for (const user of testUsers) {
      try {
        await client.models.User.delete({ id: user.id });
        console.log(`  ✅ Deleted user: ${user.email}`);
      } catch (error) {
        console.error(`  ❌ Error deleting user ${user.email}:`, error);
      }
    }
  }

  // Delete test bets (created by test users)
  if (testUsers && testUsers.length > 0) {
    const testUserIds = testUsers.map(u => u.id);
    const { data: testBets } = await client.models.Bet.list();

    const betsToDelete = testBets?.filter(bet => testUserIds.includes(bet.creatorId)) || [];
    console.log(`  🗑️  Found ${betsToDelete.length} test bets to delete`);

    for (const bet of betsToDelete) {
      try {
        await client.models.Bet.delete({ id: bet.id });
        console.log(`  ✅ Deleted bet: ${bet.title}`);
      } catch (error) {
        console.error(`  ❌ Error deleting bet ${bet.title}:`, error);
      }
    }
  }

  console.log('✨ Cleanup complete!');
}

/**
 * Reset user balance
 */
export async function resetUserBalance(userId: string, amount: number) {
  console.log(`💰 Resetting balance for user ${userId} to ${amount}...`);

  try {
    const { data, errors } = await client.models.User.update({
      id: userId,
      balance: amount,
    });

    if (errors) {
      console.error('  ❌ Error updating balance:', errors);
      return { status: 'error', errors };
    }

    console.log(`  ✅ Balance updated to ${amount}`);
    return { status: 'success', balance: data?.balance };
  } catch (error) {
    console.error('  ❌ Exception updating balance:', error);
    return { status: 'exception', error };
  }
}

/**
 * Make user an admin
 */
export async function makeUserAdmin(userId: string) {
  console.log(`👑 Making user ${userId} an admin...`);

  try {
    const { data, errors } = await client.models.User.update({
      id: userId,
      role: 'ADMIN',
    });

    if (errors) {
      console.error('  ❌ Error updating role:', errors);
      return { status: 'error', errors };
    }

    console.log(`  ✅ User is now an admin`);
    return { status: 'success', role: data?.role };
  } catch (error) {
    console.error('  ❌ Exception updating role:', error);
    return { status: 'exception', error };
  }
}

/**
 * Get test users info
 */
export async function getTestUsers() {
  console.log('👥 Fetching test users...');

  const { data: users } = await client.models.User.list({
    filter: { email: { contains: '@sidebet.test' } },
  });

  if (!users || users.length === 0) {
    console.log('  ℹ️  No test users found');
    return [];
  }

  console.log(`  📋 Found ${users.length} test users:`);
  users.forEach(user => {
    console.log(`     - ${user.email} (${user.id}): $${user.balance}, Role: ${user.role}`);
  });

  return users;
}

/**
 * CLI handler
 */
async function main() {
  const command = process.argv[2];
  const arg1 = process.argv[3];
  const arg2 = process.argv[4];

  try {
    switch (command) {
      case 'seed-users':
        await seedTestUsers();
        break;

      case 'seed-bets':
        await seedTestBets(arg1);
        break;

      case 'seed-all':
        await seedTestUsers();
        const users = await getTestUsers();
        if (users.length > 0) {
          await seedTestBets(users[0].id);
        }
        break;

      case 'cleanup':
        await cleanupTestData();
        break;

      case 'reset-balance':
        if (!arg1 || !arg2) {
          console.error('❌ Usage: npm run test:admin -- reset-balance <userId> <amount>');
          process.exit(1);
        }
        await resetUserBalance(arg1, parseFloat(arg2));
        break;

      case 'make-admin':
        if (!arg1) {
          console.error('❌ Usage: npm run test:admin -- make-admin <userId>');
          process.exit(1);
        }
        await makeUserAdmin(arg1);
        break;

      case 'list-users':
        await getTestUsers();
        break;

      default:
        console.log('Usage:');
        console.log('  npm run test:admin -- seed-users');
        console.log('  npm run test:admin -- seed-bets [creatorId]');
        console.log('  npm run test:admin -- seed-all');
        console.log('  npm run test:admin -- cleanup');
        console.log('  npm run test:admin -- reset-balance <userId> <amount>');
        console.log('  npm run test:admin -- make-admin <userId>');
        console.log('  npm run test:admin -- list-users');
        process.exit(1);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}
