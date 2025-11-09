import { type ClientSchema, a, defineData } from "@aws-amplify/backend";
import { scheduledBetChecker } from "../functions/scheduled-bet-checker/resource";
import { pushNotificationSender } from "../functions/push-notification-sender/resource";
import { eventFetcher } from "../functions/event-fetcher/resource";

/*== SIDEBET BETTING PLATFORM SCHEMA =======================================
This schema defines the core data models for the SideBet peer-to-peer betting
platform, including users, bets, participants, and evidence submission.
=========================================================================*/
const schema = a.schema({
  User: a
    .model({
      id: a.id(),
      username: a.string().required(),
      email: a.string().required(),
      displayName: a.string(), // Friendly/display name for friends
      profilePictureUrl: a.string(), // S3 URL for profile picture
      // Phone verification fields
      phoneNumber: a.string(), // E.164 format: +1234567890
      phoneNumberVerified: a.boolean().default(false),
      phoneNumberVerifiedAt: a.datetime(),
      allowPhoneDiscovery: a.boolean().default(false), // Opt-in for friend discovery by phone
      role: a.enum(['USER', 'ADMIN', 'SUPER_ADMIN']), // User role for access control
      balance: a.float().default(0),
      trustScore: a.float().default(5.0),
      totalBets: a.integer().default(0),
      totalWinnings: a.float().default(0),
      winRate: a.float().default(0),
      // Onboarding tracking
      onboardingCompleted: a.boolean().default(false), // Whether user has completed onboarding
      onboardingStep: a.integer().default(0), // Current step in onboarding (0 = not started, 1-3 = in progress, 4 = completed)
      createdAt: a.datetime(),
      updatedAt: a.datetime(),
      // Relations
      betsCreated: a.hasMany('Bet', 'creatorId'),
      participations: a.hasMany('Participant', 'userId'),
      sentFriendRequests: a.hasMany('FriendRequest', 'fromUserId'),
      receivedFriendRequests: a.hasMany('FriendRequest', 'toUserId'),
      friendshipsAsUser1: a.hasMany('Friendship', 'user1Id'),
      friendshipsAsUser2: a.hasMany('Friendship', 'user2Id'),
      sentBetInvitations: a.hasMany('BetInvitation', 'fromUserId'),
      receivedBetInvitations: a.hasMany('BetInvitation', 'toUserId'),
      notifications: a.hasMany('Notification', 'userId'),
      pushTokens: a.hasMany('PushToken', 'userId'),
      notificationPreferences: a.hasOne('NotificationPreferences', 'userId'),
      paymentMethods: a.hasMany('PaymentMethod', 'userId'),
      transactions: a.hasMany('Transaction', 'userId'),
      eventCheckIns: a.hasMany('EventCheckIn', 'userId'),
    })
    .authorization((allow) => [
      allow.owner().to(['create', 'read', 'update', 'delete']),
      allow.authenticated().to(['read', 'create', 'update']) // Allow authenticated users to update any user (for balance changes, stats, etc.)
    ]),

  // Notification/Event Log for efficient querying
  Notification: a
    .model({
      id: a.id(),
      userId: a.id().required(), // Who receives this notification
      type: a.enum([
        'FRIEND_REQUEST_RECEIVED',
        'FRIEND_REQUEST_ACCEPTED',
        'FRIEND_REQUEST_DECLINED',
        'BET_INVITATION_RECEIVED',
        'BET_INVITATION_ACCEPTED',
        'BET_INVITATION_DECLINED',
        'BET_JOINED',
        'BET_RESOLVED',
        'BET_CANCELLED',
        'BET_DISPUTED',
        'BET_DEADLINE_APPROACHING',
        'DEPOSIT_COMPLETED',
        'DEPOSIT_FAILED',
        'WITHDRAWAL_COMPLETED',
        'WITHDRAWAL_FAILED',
        'PAYMENT_METHOD_VERIFIED',
        'SYSTEM_ANNOUNCEMENT'
      ]),
      title: a.string().required(), // Short notification title
      message: a.string().required(), // Notification content
      isRead: a.boolean().default(false),
      priority: a.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
      // Metadata for deep linking and actions
      actionType: a.string(), // 'open_bet', 'view_friend_request', etc.
      actionData: a.json(), // Additional data (bet ID, user ID, etc.)
      // References to source entities
      relatedBetId: a.id(),
      relatedUserId: a.id(), // The other user involved (friend requester, bet creator, etc.)
      relatedRequestId: a.string(), // Friend request ID, bet invitation ID, etc.
      createdAt: a.datetime(),
      // Relations
      user: a.belongsTo('User', 'userId'),
      relatedBet: a.belongsTo('Bet', 'relatedBetId'),
    })
    .authorization((allow) => [
      allow.authenticated().to(['read', 'create', 'update']) // Any authenticated user can create/read/update notifications
    ]),

  // Push notification tokens for mobile devices
  PushToken: a
    .model({
      id: a.id(),
      userId: a.id().required(),
      token: a.string().required(), // Expo push token or FCM token
      platform: a.enum(['IOS', 'ANDROID', 'WEB']),
      deviceId: a.string(), // Unique device identifier
      appVersion: a.string(), // App version when token was registered
      isActive: a.boolean().default(true), // Whether token is still valid
      lastUsed: a.datetime(), // When this token was last used successfully
      createdAt: a.datetime(),
      // Relations
      user: a.belongsTo('User', 'userId'),
    })
    .authorization((allow) => [
      allow.owner().to(['create', 'read', 'update', 'delete']),
      allow.authenticated().to(['create']) // Allow users to register tokens for others (admin use)
    ]),

  // User notification preferences for controlling which notifications to receive
  NotificationPreferences: a
    .model({
      id: a.id(),
      userId: a.id().required(),

      // Global notification controls
      pushEnabled: a.boolean().default(true),        // Master switch for push notifications
      inAppEnabled: a.boolean().default(true),       // Master switch for in-app toast notifications
      emailEnabled: a.boolean().default(false),      // Email notifications (future feature)

      // Notification type preferences - grouped by category
      // Friend notifications
      friendRequestsEnabled: a.boolean().default(true),      // Friend requests received/accepted/declined

      // Bet notifications
      betInvitationsEnabled: a.boolean().default(true),      // Bet invitations received/accepted/declined
      betJoinedEnabled: a.boolean().default(true),           // Someone joined your bet
      betResolvedEnabled: a.boolean().default(true),         // Bet resolved (won/lost)
      betCancelledEnabled: a.boolean().default(true),        // Bet cancelled
      betDeadlineEnabled: a.boolean().default(true),         // Bet deadline approaching

      // Payment notifications
      paymentNotificationsEnabled: a.boolean().default(true), // Deposits/withdrawals completed/failed & payment method verified

      // System notifications
      systemAnnouncementsEnabled: a.boolean().default(true), // System announcements and updates

      // Do Not Disturb schedule
      dndEnabled: a.boolean().default(false),        // Enable quiet hours
      dndStartHour: a.integer(),                     // Start hour (0-23, e.g., 22 = 10 PM)
      dndEndHour: a.integer(),                       // End hour (0-23, e.g., 7 = 7 AM)

      createdAt: a.datetime(),
      updatedAt: a.datetime(),

      // Relations
      user: a.belongsTo('User', 'userId'),
    })
    .authorization((allow) => [
      allow.owner().to(['create', 'read', 'update', 'delete']),
    ]),

  Bet: a
    .model({
      id: a.id(),
      title: a.string().required(),
      description: a.string().required(),
      category: a.enum(['SPORTS', 'ENTERTAINMENT', 'WEATHER', 'STOCKS', 'CUSTOM']),
      status: a.enum(['DRAFT', 'ACTIVE', 'LIVE', 'PENDING_RESOLUTION', 'DISPUTED', 'RESOLVED', 'CANCELLED']),
      creatorId: a.id().required(),
      totalPot: a.float().required(),
      betAmount: a.float(), // Individual bet amount for joining
      odds: a.json(), // Store odds as JSON object
      deadline: a.datetime().required(),
      winningSide: a.string(), // Which side won
      resolutionReason: a.string(), // Why the bet was resolved this way
      eventId: a.id(), // Optional link to live event
      isPrivate: a.boolean().default(false), // Private bets only visible to invited users
      createdAt: a.datetime(),
      updatedAt: a.datetime(),
      // Relations
      creator: a.belongsTo('User', 'creatorId'),
      participants: a.hasMany('Participant', 'betId'),
      evidence: a.hasMany('Evidence', 'betId'),
      invitations: a.hasMany('BetInvitation', 'betId'),
      notifications: a.hasMany('Notification', 'relatedBetId')
    })
    .authorization((allow) => [
      allow.owner().to(['create', 'read', 'update', 'delete']),
      allow.authenticated().to(['read', 'create', 'update']) // Allow any authenticated user to create bets, read all bets, and update (for total pot changes)
    ]),

  Participant: a
    .model({
      id: a.id(),
      betId: a.id().required(),
      userId: a.id().required(),
      side: a.string().required(), // 'A' or 'B' or custom side name
      amount: a.float().required(),
      status: a.enum(['PENDING', 'ACCEPTED', 'DECLINED']),
      payout: a.float().default(0), // Calculated payout if they win
      joinedAt: a.datetime(),
      // Relations
      bet: a.belongsTo('Bet', 'betId'),
      user: a.belongsTo('User', 'userId'),
    })
    .authorization((allow) => [
      allow.owner(),
      allow.authenticated().to(['read', 'create', 'update'])
    ]),

  Evidence: a
    .model({
      id: a.id(),
      betId: a.id().required(),
      submittedBy: a.id().required(),
      type: a.enum(['PHOTO', 'VIDEO', 'SCREENSHOT', 'TEXT']),
      url: a.string(), // S3 URL for media
      description: a.string(),
      timestamp: a.datetime(),
      // Relations
      bet: a.belongsTo('Bet', 'betId'),
    })
    .authorization((allow) => [
      allow.owner(),
      allow.authenticated().to(['read'])
    ]),

  // For tracking user statistics and leaderboards
  UserStats: a
    .model({
      id: a.id(),
      userId: a.id().required(),
      period: a.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'ALL_TIME']),
      betsWon: a.integer().default(0),
      betsLost: a.integer().default(0),
      totalProfit: a.float().default(0),
      biggestWin: a.float().default(0),
      winStreak: a.integer().default(0),
      updatedAt: a.datetime(),
    })
    .authorization((allow) => [
      allow.owner(),
      allow.authenticated().to(['read'])
    ]),

  // Friend Management Models
  FriendRequest: a
    .model({
      id: a.id(),
      fromUserId: a.id().required(),
      toUserId: a.id().required(),
      status: a.enum(['PENDING', 'ACCEPTED', 'DECLINED']),
      message: a.string(), // Optional message when sending friend request
      createdAt: a.datetime(),
      updatedAt: a.datetime(),
      // Relations
      fromUser: a.belongsTo('User', 'fromUserId'),
      toUser: a.belongsTo('User', 'toUserId'),
    })
    .authorization((allow) => [
      allow.owner(),
      allow.authenticated().to(['read', 'create', 'update'])
    ]),

  Friendship: a
    .model({
      id: a.id(),
      user1Id: a.id().required(), // Always the user with the lexicographically smaller ID
      user2Id: a.id().required(), // Always the user with the lexicographically larger ID
      createdAt: a.datetime(),
      // Relations
      user1: a.belongsTo('User', 'user1Id'),
      user2: a.belongsTo('User', 'user2Id'),
    })
    .authorization((allow) => [
      allow.owner(),
      allow.authenticated().to(['read', 'create', 'delete'])
    ]),

  BetInvitation: a
    .model({
      id: a.id(),
      betId: a.id().required(),
      fromUserId: a.id().required(),
      toUserId: a.id().required(),
      status: a.enum(['PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED']),
      message: a.string(), // Optional message with the invitation
      invitedSide: a.string(), // Which side the friend is invited to join ('A' or 'B')
      createdAt: a.datetime(),
      updatedAt: a.datetime(),
      expiresAt: a.datetime(), // Invitation expiry
      // Relations
      bet: a.belongsTo('Bet', 'betId'),
      fromUser: a.belongsTo('User', 'fromUserId'),
      toUser: a.belongsTo('User', 'toUserId'),
    })
    .authorization((allow) => [
      allow.owner(),
      allow.authenticated().to(['read', 'create', 'update'])
    ]),

  // Payment Management Models
  PaymentMethod: a
    .model({
      id: a.id(),
      userId: a.id().required(),
      type: a.enum(['VENMO', 'PAYPAL', 'BANK_ACCOUNT', 'CASH_APP']),
      // Venmo-specific fields
      venmoUsername: a.string(),
      venmoPhone: a.string(), // Last 4 digits for verification
      venmoEmail: a.string(), // Email associated with Venmo account
      // Verification
      isVerified: a.boolean().default(false),
      verifiedAt: a.datetime(),
      verificationMethod: a.enum(['MANUAL', 'MICRO_DEPOSIT', 'TRANSACTION_ID']),
      // Status
      isDefault: a.boolean().default(false),
      isActive: a.boolean().default(true),
      // Metadata
      displayName: a.string(), // e.g., "Venmo (@username)"
      lastUsed: a.datetime(),
      createdAt: a.datetime(),
      updatedAt: a.datetime(),
      // Relations
      user: a.belongsTo('User', 'userId'),
      transactions: a.hasMany('Transaction', 'paymentMethodId'),
    })
    .authorization((allow) => [
      allow.owner().to(['create', 'read', 'update', 'delete']),
      allow.authenticated().to(['read']) // Admin can read for verification
    ]),

  Transaction: a
    .model({
      id: a.id(),
      userId: a.id().required(),
      type: a.enum([
        'DEPOSIT',           // User adds funds
        'WITHDRAWAL',        // User withdraws funds
        'BET_PLACED',        // Balance deducted when joining bet
        'BET_WON',          // Winnings paid out
        'BET_CANCELLED',    // Refund when bet cancelled
        'BET_REFUND',       // Manual refund by admin
        'ADMIN_ADJUSTMENT'  // Admin balance correction
      ]),
      status: a.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED']),
      amount: a.float().required(),
      // Balance tracking
      balanceBefore: a.float().required(),
      balanceAfter: a.float().required(),
      // Payment method info (for deposits/withdrawals)
      paymentMethodId: a.id(),
      // Venmo-specific fields
      venmoTransactionId: a.string(), // User-provided Venmo transaction ID for verification
      venmoUsername: a.string(), // Captured at time of transaction
      // Related entities
      relatedBetId: a.id(),
      relatedParticipantId: a.id(),
      // Transaction metadata
      notes: a.string(), // Admin notes or user description
      failureReason: a.string(), // Why transaction failed
      processedBy: a.id(), // Admin user who processed manual transaction
      // Timestamps
      createdAt: a.datetime(),
      processedAt: a.datetime(), // When status changed to PROCESSING
      completedAt: a.datetime(), // When status changed to COMPLETED/FAILED
      // Relations
      user: a.belongsTo('User', 'userId'),
      paymentMethod: a.belongsTo('PaymentMethod', 'paymentMethodId'),
    })
    .authorization((allow) => [
      allow.owner().to(['create', 'read']), // Users can create their own transactions and read them
      allow.authenticated().to(['read', 'create', 'update']), // All authenticated users can read/create/update transactions
      // NOTE: Admin-only update permissions enforced in app logic by checking user.role
      // TransactionService validates admin role before allowing status updates on PENDING transactions
    ]),

  // Live Event Models
  LiveEvent: a
    .model({
      id: a.id(),
      // Event identification
      externalId: a.string().required(), // TheSportsDB event ID for deduplication
      sport: a.enum(['NBA', 'NFL', 'MLB', 'NHL', 'SOCCER', 'COLLEGE_FOOTBALL', 'COLLEGE_BASKETBALL', 'OTHER']),
      league: a.string(), // e.g., "NBA", "Premier League"
      // Event details
      homeTeam: a.string().required(),
      awayTeam: a.string().required(),
      homeTeamCode: a.string(), // e.g., "LAL", "GSW"
      awayTeamCode: a.string(),
      // Venue
      venue: a.string(),
      city: a.string(),
      country: a.string(),
      // Scores
      homeScore: a.integer().default(0),
      awayScore: a.integer().default(0),
      // Game state
      status: a.enum(['UPCOMING', 'LIVE', 'HALFTIME', 'FINISHED', 'POSTPONED', 'CANCELLED']),
      quarter: a.string(), // e.g., "Q1", "Q2", "Halftime", "OT"
      timeLeft: a.string(), // e.g., "8:42", "00:00"
      // Timestamps
      scheduledTime: a.datetime().required(),
      startTime: a.datetime(),
      endTime: a.datetime(),
      // Metadata
      season: a.string(), // e.g., "2024-2025"
      round: a.string(), // Week number or round
      checkInCount: a.integer().default(0), // Denormalized count for trending
      betCount: a.integer().default(0), // Number of bets linked to this event
      createdAt: a.datetime(),
      updatedAt: a.datetime(),
      // Relations
      checkIns: a.hasMany('EventCheckIn', 'eventId')
    })
    .secondaryIndexes((index) => [
      index('status').sortKeys(['scheduledTime']).queryField('listEventsByStatusAndTime'),
    ])
    .authorization((allow) => [
      allow.authenticated().to(['read', 'create', 'update']) // All authenticated users can read, Lambda functions can create/update
    ]),

  EventCheckIn: a
    .model({
      id: a.id(),
      userId: a.id().required(),
      eventId: a.id().required(),
      // Check-in metadata
      checkInTime: a.datetime().required(),
      checkOutTime: a.datetime(), // Automatically set when event ends or user checks out
      isActive: a.boolean().default(true),
      // Location context (optional)
      location: a.json(), // { latitude, longitude, accuracy }
      // Relations
      user: a.belongsTo('User', 'userId'),
      event: a.belongsTo('LiveEvent', 'eventId'),
    })
    .authorization((allow) => [
      allow.owner().to(['create', 'read', 'update', 'delete']),
      allow.authenticated().to(['read', 'create', 'update']) // Allow users to check in others (social features)
    ]),

  // Scheduled Lambda Function
  scheduledBetChecker: a
    .query()
    .arguments({
      triggerTime: a.string().required()  // ISO timestamp when triggered
    })
    .returns(a.boolean())
    .handler(a.handler.function(scheduledBetChecker))
    .authorization((allow) => [allow.authenticated()]),

  // Push Notification Function
  sendPushNotification: a
    .mutation()
    .arguments({
      userId: a.string().required(),
      title: a.string().required(),
      message: a.string().required(),
      data: a.json(),
      priority: a.enum(['HIGH', 'MEDIUM', 'LOW'])
    })
    .returns(a.boolean())
    .handler(a.handler.function(pushNotificationSender))
    .authorization((allow) => [allow.authenticated()]),

  // Manual Event Fetch Function (for testing)
  fetchEventsManually: a
    .query()
    .arguments({
      triggerTime: a.string().required()  // ISO timestamp when triggered
    })
    .returns(a.boolean())
    .handler(a.handler.function(eventFetcher))
    .authorization((allow) => [allow.authenticated()]),

}).authorization((allow) => [
  // Allow the Lambda functions to be invoked and access data
  allow.resource(scheduledBetChecker).to(["query", "listen", "mutate"]),
  allow.resource(pushNotificationSender).to(["query", "listen", "mutate"]),
  allow.resource(eventFetcher).to(["query", "listen", "mutate"]),
]);

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: "userPool",
    // Switch from API Key to Cognito User Pool for proper authentication
    apiKeyAuthorizationMode: {
      expiresInDays: 30,
    },
  },
});

/*== USAGE EXAMPLES ======================================================
Frontend code examples for working with the betting and friend data:

// BETTING EXAMPLES
// Create a new bet
const newBet = await client.models.Bet.create({
  title: "Lakers vs Warriors - Next 3PT Made",
  description: "LeBron James makes next 3-point attempt",
  category: "SPORTS",
  status: "ACTIVE",
  totalPot: 100,
  odds: { sideAName: "Yes", sideBName: "No" },
  deadline: new Date(Date.now() + 3600000).toISOString(),
});

// Join a bet
const participation = await client.models.Participant.create({
  betId: "bet-id-here",
  side: "A",
  amount: 50,
  status: "PENDING"
});

// FRIEND MANAGEMENT EXAMPLES
// Send a friend request
const friendRequest = await client.models.FriendRequest.create({
  fromUserId: "current-user-id",
  toUserId: "target-user-id",
  message: "Let's bet together!"
});

// Accept a friend request and create friendship
const friendship = await client.models.Friendship.create({
  user1Id: "smaller-user-id", // Lexicographically smaller
  user2Id: "larger-user-id"   // Lexicographically larger
});

// Send bet invitation to friend
const betInvitation = await client.models.BetInvitation.create({
  betId: "bet-id-here",
  fromUserId: "current-user-id",
  toUserId: "friend-user-id",
  invitedSide: "A",
  message: "Join me on this bet!",
  expiresAt: new Date(Date.now() + 86400000).toISOString() // 24 hours
});

// Get user's friends (need to query both directions)
const { data: friendships1 } = await client.models.Friendship.list({
  filter: { user1Id: { eq: "current-user-id" } }
});
const { data: friendships2 } = await client.models.Friendship.list({
  filter: { user2Id: { eq: "current-user-id" } }
});

// Get pending friend requests
const { data: pendingRequests } = await client.models.FriendRequest.list({
  filter: {
    and: [
      { toUserId: { eq: "current-user-id" } },
      { status: { eq: "PENDING" } }
    ]
  }
});

// Get pending bet invitations
const { data: pendingInvites } = await client.models.BetInvitation.list({
  filter: {
    and: [
      { toUserId: { eq: "current-user-id" } },
      { status: { eq: "PENDING" } }
    ]
  }
});

// PAYMENT MANAGEMENT EXAMPLES
// Add Venmo payment method
const paymentMethod = await client.models.PaymentMethod.create({
  userId: "current-user-id",
  type: "VENMO",
  venmoUsername: "@johndoe",
  venmoEmail: "john@example.com",
  displayName: "Venmo (@johndoe)",
  isDefault: true
});

// Create deposit transaction
const deposit = await client.models.Transaction.create({
  userId: "current-user-id",
  type: "DEPOSIT",
  status: "PENDING",
  amount: 50.00,
  balanceBefore: 100.00,
  balanceAfter: 150.00,
  paymentMethodId: "payment-method-id",
  venmoTransactionId: "3FA12345678",
  venmoUsername: "@johndoe",
  notes: "Deposit via Venmo"
});

// Create withdrawal transaction
const withdrawal = await client.models.Transaction.create({
  userId: "current-user-id",
  type: "WITHDRAWAL",
  status: "PENDING",
  amount: 25.00,
  balanceBefore: 100.00,
  balanceAfter: 75.00,
  paymentMethodId: "payment-method-id",
  venmoUsername: "@johndoe",
  notes: "Withdrawal to Venmo"
});

// Record bet transaction when joining
const betTransaction = await client.models.Transaction.create({
  userId: "current-user-id",
  type: "BET_PLACED",
  status: "COMPLETED",
  amount: 20.00,
  balanceBefore: 100.00,
  balanceAfter: 80.00,
  relatedBetId: "bet-id-here",
  notes: "Joined bet: Lakers vs Warriors"
});

// Get user's transaction history
const { data: transactions } = await client.models.Transaction.list({
  filter: { userId: { eq: "current-user-id" } }
});

// Get pending transactions (for admin)
const { data: pendingTransactions } = await client.models.Transaction.list({
  filter: { status: { eq: "PENDING" } }
});
========================================================================*/