import { type ClientSchema, a, defineData } from "@aws-amplify/backend";

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
    })
    .authorization((allow) => [
      allow.owner(),
      allow.authenticated().to(['read'])
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
    })
    .authorization((allow) => [
      allow.owner(),
      allow.authenticated().to(['read']),
      allow.authenticated().to(['update']) // Allow participants to update
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
      allow.authenticated().to(['read']),
      allow.authenticated().to(['create', 'update'])
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
});

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
Frontend code examples for working with the betting data:

// Create a new bet
const newBet = await client.models.Bet.create({
  title: "Lakers vs Warriors - Next 3PT Made",
  description: "LeBron James makes next 3-point attempt",
  category: "SPORTS",
  status: "ACTIVE",
  totalPot: 100,
  odds: { sideA: -110, sideB: +150 },
  deadline: new Date(Date.now() + 3600000).toISOString(),
});

// Join a bet
const participation = await client.models.Participant.create({
  betId: "bet-id-here",
  side: "A",
  amount: 50,
  status: "PENDING"
});

// List active bets
const { data: activeBets } = await client.models.Bet.list({
  filter: { status: { eq: "ACTIVE" } }
});

// Get user stats
const { data: userStats } = await client.models.User.get({ id: "user-id" });
========================================================================*/