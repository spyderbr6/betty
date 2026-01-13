# Squares Invitation System - Implementation Guide

## Status: In Progress

### ✅ Phase 1: Database Schema (COMPLETED)
- Added SquaresInvitation model with relations
- Added notification types: SQUARES_INVITATION_RECEIVED/ACCEPTED/DECLINED
- Added TypeScript interface
- Committed and pushed

---

## 🔲 Phase 2: CreateSquaresForm Friend Selection UI

### File: `src/components/betting/CreateSquaresForm.tsx`

#### A. Add Imports
```typescript
// Add to existing imports
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { Image } from 'react-native';

const client = generateClient<Schema>();
```

#### B. Add State (after existing state variables, line ~50)
```typescript
// Friend selection state
const [friends, setFriends] = useState<any[]>([]);
const [selectedFriends, setSelectedFriends] = useState<Set<string>>(new Set());
const [isLoadingFriends, setIsLoadingFriends] = useState(false);
```

#### C. Add fetchFriends Function (after handlePayoutChange, line ~111)
```typescript
const fetchFriends = useCallback(async () => {
  if (!user?.userId) return;

  try {
    setIsLoadingFriends(true);

    // Get user's friendships
    const [friendships1, friendships2] = await Promise.all([
      client.models.Friendship.list({
        filter: { user1Id: { eq: user.userId } }
      }),
      client.models.Friendship.list({
        filter: { user2Id: { eq: user.userId } }
      })
    ]);

    const allFriendships = [
      ...(friendships1.data || []),
      ...(friendships2.data || [])
    ];

    // Get friend user IDs
    const friendUserIds = allFriendships.map(friendship =>
      friendship.user1Id === user.userId
        ? friendship.user2Id
        : friendship.user1Id
    ).filter(Boolean) as string[];

    if (friendUserIds.length === 0) {
      setFriends([]);
      return;
    }

    // Fetch friend user data
    const friendDataPromises = friendUserIds.map(id =>
      client.models.User.get({ id })
    );

    const friendDataResults = await Promise.all(friendDataPromises);
    const friendsData = friendDataResults
      .map(result => result.data)
      .filter(Boolean);

    setFriends(friendsData);
  } catch (error) {
    console.error('Error fetching friends:', error);
  } finally {
    setIsLoadingFriends(false);
  }
}, [user?.userId]);

const toggleFriendSelection = (friendId: string) => {
  setSelectedFriends(prev => {
    const newSet = new Set(prev);
    if (newSet.has(friendId)) {
      newSet.delete(friendId);
    } else {
      newSet.add(friendId);
    }
    return newSet;
  });
};

const generateAvatarInitials = (friend: any): string => {
  const name = friend.displayName || friend.username || 'U';
  const words = name.split(' ');
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
};
```

#### D. Add useEffect to fetch friends (after existing useEffect if any)
```typescript
useEffect(() => {
  if (user) {
    fetchFriends();
  }
}, [fetchFriends]);
```

#### E. Add Friend Selector UI (AFTER Optional Description section, BEFORE Action Buttons, line ~412)
```typescript
{/* Invite Friends */}
{friends.length > 0 && (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>INVITE FRIENDS (OPTIONAL)</Text>
    <Text style={styles.sectionSubtitle}>Select friends to invite to your squares game</Text>

    {isLoadingFriends ? (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    ) : (
      <>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.friendsScroll}
          contentContainerStyle={styles.friendsScrollContent}
        >
          {friends.map((friend) => (
            <TouchableOpacity
              key={friend.id}
              style={[
                styles.friendAvatar,
                selectedFriends.has(friend.id) && styles.friendAvatarSelected
              ]}
              onPress={() => toggleFriendSelection(friend.id)}
              activeOpacity={0.7}
            >
              {friend.profilePictureUrl ? (
                <Image source={{ uri: friend.profilePictureUrl }} style={styles.friendImage} resizeMode="cover" />
              ) : (
                <View style={[styles.friendPlaceholder, selectedFriends.has(friend.id) && styles.friendPlaceholderSelected]}>
                  <Text style={[styles.friendInitials, selectedFriends.has(friend.id) && styles.friendInitialsSelected]}>
                    {generateAvatarInitials(friend)}
                  </Text>
                </View>
              )}
              {selectedFriends.has(friend.id) && (
                <View style={styles.friendSelectedBadge}>
                  <Ionicons name="checkmark" size={12} color={colors.background} />
                </View>
              )}
              <Text style={styles.friendName} numberOfLines={1}>
                {friend.displayName || friend.username}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {selectedFriends.size > 0 && (
          <View style={styles.selectedFriendsInfo}>
            <Ionicons name="people" size={16} color={colors.primary} />
            <Text style={styles.selectedFriendsText}>
              {selectedFriends.size} friend{selectedFriends.size !== 1 ? 's' : ''} selected
            </Text>
          </View>
        )}
      </>
    )}
  </View>
)}
```

#### F. Add Styles (at end of StyleSheet.create, line ~600+)
```typescript
loadingContainer: {
  paddingVertical: spacing.lg,
  alignItems: 'center',
},
friendsScroll: {
  marginTop: spacing.md,
},
friendsScrollContent: {
  paddingRight: spacing.md,
},
friendAvatar: {
  alignItems: 'center',
  marginRight: spacing.md,
  width: 70,
},
friendAvatarSelected: {
  opacity: 1,
},
friendImage: {
  width: 60,
  height: 60,
  borderRadius: 30,
  borderWidth: 3,
  borderColor: colors.border,
},
friendPlaceholder: {
  width: 60,
  height: 60,
  borderRadius: 30,
  backgroundColor: colors.surface,
  justifyContent: 'center',
  alignItems: 'center',
  borderWidth: 3,
  borderColor: colors.border,
},
friendPlaceholderSelected: {
  backgroundColor: colors.primary,
  borderColor: colors.primary,
},
friendInitials: {
  ...textStyles.button,
  color: colors.textPrimary,
  fontSize: typography.fontSize.lg,
},
friendInitialsSelected: {
  color: colors.background,
},
friendSelectedBadge: {
  position: 'absolute',
  top: 0,
  right: 0,
  width: 20,
  height: 20,
  borderRadius: 10,
  backgroundColor: colors.success,
  justifyContent: 'center',
  alignItems: 'center',
  borderWidth: 2,
  borderColor: colors.background,
},
friendName: {
  ...textStyles.caption,
  color: colors.textSecondary,
  marginTop: spacing.xs / 2,
  textAlign: 'center',
  maxWidth: 60,
},
selectedFriendsInfo: {
  flexDirection: 'row',
  alignItems: 'center',
  marginTop: spacing.md,
  paddingVertical: spacing.sm,
  paddingHorizontal: spacing.md,
  backgroundColor: colors.surface,
  borderRadius: spacing.radius.sm,
},
selectedFriendsText: {
  ...textStyles.caption,
  color: colors.primary,
  marginLeft: spacing.xs,
  fontWeight: typography.fontWeight.semibold,
},
```

---

## 🔲 Phase 3: Invitation Creation Logic

### File: `src/components/betting/CreateSquaresForm.tsx`

#### Update handleCreate function (line ~113) to send invitations AFTER game creation:

```typescript
const handleCreate = async () => {
  if (!user || !selectedEvent || !isFormValid) return;

  setIsCreating(true);

  try {
    const price = parseFloat(pricePerSquare);

    // Create payout structure (convert percentages to decimals)
    const payoutStructure = {
      period1: period1Payout / 100,
      period2: period2Payout / 100,
      period3: period3Payout / 100,
      period4: period4Payout / 100,
    };

    // Create squares game (locksAt is automatically set to event scheduledTime)
    const gameId = await SquaresGameService.createSquaresGame({
      creatorId: user.userId,
      eventId: selectedEvent.id,
      title: `${selectedEvent.awayTeamCode || selectedEvent.awayTeam} @ ${selectedEvent.homeTeamCode || selectedEvent.homeTeam} Squares`,
      description: description.trim() || undefined,
      pricePerSquare: price,
      payoutStructure,
    });

    if (gameId) {
      // Send invitations to selected friends
      if (selectedFriends.size > 0) {
        try {
          // Get squares game data for expiry
          const { data: gameData } = await client.models.SquaresGame.get({ id: gameId });

          // Get current user's display name
          const { data: currentUserData } = await client.models.User.get({ id: user.userId });
          const currentUserDisplayName = currentUserData?.displayName || currentUserData?.username || user.username;

          const invitationPromises = Array.from(selectedFriends).map(async (friendId) => {
            try {
              // Create squares invitation
              await client.models.SquaresInvitation.create({
                squaresGameId: gameId,
                fromUserId: user.userId,
                toUserId: friendId,
                status: 'PENDING',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                expiresAt: gameData?.locksAt || undefined,
              });

              // Create notification for invited friend
              await client.models.Notification.create({
                userId: friendId,
                type: 'SQUARES_INVITATION_RECEIVED',
                title: 'Squares Game Invitation',
                message: `${currentUserDisplayName} invited you to join their squares game!`,
                priority: 'HIGH',
                isRead: false,
                actionData: JSON.stringify({ squaresGameId: gameId }),
                createdAt: new Date().toISOString(),
              });

              console.log(`Sent squares invitation to friend: ${friendId}`);
            } catch (error) {
              console.error(`Error sending invitation to ${friendId}:`, error);
            }
          });

          await Promise.all(invitationPromises);
          console.log(`Sent ${selectedFriends.size} squares invitations`);
        } catch (error) {
          console.error('Error sending friend invitations:', error);
          // Don't block the success flow if invitations fail
        }
      }

      showAlert(
        'Squares Game Created!',
        selectedFriends.size > 0
          ? `Your betting squares game has been created and ${selectedFriends.size} friend${selectedFriends.size !== 1 ? 's have' : ' has'} been invited!`
          : 'Your betting squares game has been created. Start selling squares to fill the grid!'
      );

      if (onSuccess) {
        onSuccess(gameId);
      }
    }
  } catch (error) {
    console.error('Error creating squares game:', error);
    showAlert(
      'Error',
      'Failed to create squares game. Please try again.',
      [{ text: 'OK' }]
    );
  } finally {
    setIsCreating(false);
  }
};
```

---

## 🔲 Phase 4: Update LiveEventsScreen

### File: `src/screens/LiveEventsScreen.tsx`

#### Update fetchJoinableSquaresGames function (line ~204) to include invited games:

REPLACE the entire function with:

```typescript
const fetchJoinableSquaresGames = async () => {
  if (!user?.userId) return;

  try {
    console.log(`🎯 Fetching joinable squares games (viewMode: ${viewMode})`);

    // Get user's purchases to filter out games they already joined
    const { data: userPurchases } = await client.models.SquaresPurchase.list({
      filter: { userId: { eq: user.userId } }
    });

    const joinedGameIds = new Set(
      (userPurchases || []).map(p => p.squaresGameId).filter(Boolean)
    );

    // Get user's pending invitations
    const { data: userInvitations } = await client.models.SquaresInvitation.list({
      filter: {
        and: [
          { toUserId: { eq: user.userId } },
          { status: { eq: 'PENDING' } }
        ]
      }
    });

    const invitedGameIds = new Set(
      (userInvitations || []).map(inv => inv.squaresGameId).filter(Boolean) as string[]
    );

    console.log(`Found ${invitedGameIds.size} pending invitations`);

    // If friends mode, get friend IDs first
    let friendUserIds: string[] = [];
    if (viewMode === 'friends') {
      const [friendships1, friendships2] = await Promise.all([
        client.models.Friendship.list({
          filter: { user1Id: { eq: user.userId } }
        }),
        client.models.Friendship.list({
          filter: { user2Id: { eq: user.userId } }
        })
      ]);

      const allFriendships = [
        ...(friendships1.data || []),
        ...(friendships2.data || [])
      ];

      friendUserIds = allFriendships.map(friendship =>
        friendship.user1Id === user.userId
          ? friendship.user2Id
          : friendship.user1Id
      ).filter(Boolean) as string[];

      console.log(`✅ Found ${friendUserIds.length} friends`);

      if (friendUserIds.length === 0 && invitedGameIds.size === 0) {
        // No friends and no invitations, no games to show
        console.log('No friends or invitations found, skipping squares games fetch');
        setSquaresGames([]);
        return;
      }
    }

    // Fetch all ACTIVE squares games
    const { data: games } = await client.models.SquaresGame.list({
      filter: {
        status: { eq: 'ACTIVE' }
      }
    });

    // Filter to joinable games
    const joinableGames: SquaresGame[] = (games || [])
      .filter(game => {
        if (!game) return false;

        // Must not be creator
        if (game.creatorId === user.userId) return false;

        // Must not have already purchased squares
        if (joinedGameIds.has(game.id!)) return false;

        // If friends mode, must be created by a friend OR invited
        if (viewMode === 'friends') {
          const isCreatedByFriend = friendUserIds.includes(game.creatorId!);
          const isInvited = invitedGameIds.has(game.id!);

          if (!isCreatedByFriend && !isInvited) {
            return false;
          }
        }

        // Include private games ONLY if user is invited
        if (game.isPrivate && !invitedGameIds.has(game.id!)) {
          return false;
        }

        return true;
      })
      .map(game => ({
        id: game.id!,
        creatorId: game.creatorId!,
        eventId: game.eventId!,
        title: game.title!,
        description: game.description || undefined,
        status: game.status!,
        pricePerSquare: game.pricePerSquare || 0,
        totalPot: game.totalPot || 0,
        squaresSold: game.squaresSold || 0,
        numbersAssigned: game.numbersAssigned || false,
        isPrivate: game.isPrivate || false,
        isInvited: invitedGameIds.has(game.id!), // Mark if invited
        createdAt: game.createdAt || new Date().toISOString(),
      }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    console.log(`✅ Loaded ${joinableGames.length} joinable squares games`);
    setSquaresGames(joinableGames);
  } catch (error) {
    console.error('❌ Error fetching joinable squares games:', error);
  }
};
```

#### Update onRefresh to use same logic (line ~320):
Apply same invitation filtering logic in the onRefresh function.

---

## 🔲 Phase 5: Update SquaresGame Interface

### File: `src/screens/LiveEventsScreen.tsx` (line ~119)

Update the SquaresGame interface:
```typescript
interface SquaresGame {
  id: string;
  creatorId: string;
  eventId: string;
  title: string;
  description?: string;
  status: string;
  pricePerSquare: number;
  totalPot: number;
  squaresSold: number;
  numbersAssigned: boolean;
  isPrivate?: boolean;
  isInvited?: boolean; // ADD THIS LINE
  createdAt: string;
}
```

---

## 🔲 Phase 6: Update Notification Handlers

### File: `src/services/toastNotificationService.ts`

Add to getNotificationTypeLabel function (line ~297):
```typescript
'SQUARES_INVITATION_RECEIVED': 'squares invitations',
'SQUARES_INVITATION_ACCEPTED': 'squares invitation acceptances',
'SQUARES_INVITATION_DECLINED': 'squares invitation declines',
```

### File: `src/utils/notificationNavigationHandler.ts`

Add to getNotificationNavigationAction function (around line ~157):
```typescript
case 'SQUARES_INVITATION_RECEIVED':
  return {
    action: 'navigate',
    screen: 'SquaresGameDetail',
    params: {
      gameId: data?.actionData?.squaresGameId,
    },
  };

case 'SQUARES_INVITATION_ACCEPTED':
case 'SQUARES_INVITATION_DECLINED':
  return {
    action: 'navigate',
    screen: 'MyBets',
    params: {
      tab: 'squares',
    },
  };
```

Add to getNotificationActionDescription function (around line ~188):
```typescript
'SQUARES_INVITATION_RECEIVED': 'Tap to view game',
'SQUARES_INVITATION_ACCEPTED': 'Tap to view your games',
'SQUARES_INVITATION_DECLINED': 'Tap to view your games',
```

---

## 🔲 Phase 7: Optional - Show Invitation Badge on Cards

### File: `src/components/betting/SquaresGameCard.tsx`

Add a visual indicator when game is invited:
- Add `isInvited` prop
- Show "Invited" badge if true
- Style with highlight color

---

## Testing Checklist

- [ ] Create a squares game without inviting anyone (should work as before)
- [ ] Create a squares game and invite 2-3 friends
- [ ] Invited friends receive notification
- [ ] Invited friends see game in Join page (Friends mode)
- [ ] Private games only visible to invited users
- [ ] Non-invited users cannot see private games
- [ ] Buying a square implicitly accepts invitation
- [ ] Invitation expires when grid locks

---

## Next Steps

1. Implement Phase 2 (CreateSquaresForm UI)
2. Implement Phase 3 (Invitation creation logic)
3. Implement Phase 4 (LiveEventsScreen filtering)
4. Implement Phase 5 (Interface update)
5. Implement Phase 6 (Notification handlers)
6. Test end-to-end flow
7. Optional: Add invitation badge to cards
