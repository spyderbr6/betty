import { type ClientSchema, a, defineData } from "@aws-amplify/backend";
import { scheduledBetChecker } from "../functions/scheduled-bet-checker/resource";
import { pushNotificationSender } from "../functions/push-notification-sender/resource";

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
      balance: a.float().default(0),
      trustScore: a.float().default(5.0),
      totalBets: a.integer().default(0),
      totalWinnings: a.float().default(0),
      winRate: a.float().default(0),
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
      allow.owner().to(['read', 'update']), // Users can only read/update their own notifications
      allow.authenticated().to(['create']) // Any authenticated user can create notifications for others
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
      createdAt: a.datetime(),
      updatedAt: a.datetime(),
      // Relations
      creator: a.belongsTo('User', 'creatorId'),
      participants: a.hasMany('Participant', 'betId'),
      evidence: a.hasMany('Evidence', 'betId'),
      invitations: a.hasMany('BetInvitation', 'betId'),
      notifications: a.hasMany('Notification', 'relatedBetId'),
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

}).authorization((allow) => [
  // Allow the Lambda functions to be invoked and access data
  allow.resource(scheduledBetChecker).to(["query", "listen", "mutate"]),
  allow.resource(pushNotificationSender).to(["query", "listen", "mutate"])
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
========================================================================*/