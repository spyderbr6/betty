/**
 * Create Bet Screen: game first, built for repeat bets (the "Create Bet Final" design).
 *
 * Checked in to a game, the screen opens on it: one-tap suggestions fill the question and
 * the sides, the teams are the default sides, and friends at the same game start invited.
 * After a bet is sent, "Another bet" keeps the game, stake, closing time and friends and
 * clears only the question.
 *
 * Creating is one call to the server's createBetWithStake (it re-checks everything and
 * takes the stake); invitations are still sent from here afterwards. The decisions are
 * pure functions in services/createBetFlowLogic.ts.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { colors, commonStyles, spacing, textStyles, typography } from '../styles';
import { Header } from '../components/ui/Header';
import { showAlert } from '../components/ui/CustomAlert';
import { AddFundsModal } from '../components/ui/AddFundsModal';
import { BetQRCodeModal } from '../components/ui/BetQRCodeModal';
import { useAuth } from '../contexts/AuthContext';
import { useProfile } from '../contexts/ProfileContext';
import { useBetData } from '../contexts/BetDataContext';
import { useEventCheckIn } from '../hooks/useEventCheckIn';
import type { Bet, User } from '../types/betting';
import { NotificationService } from '../services/notificationService';
import { createBetWithStake } from '../services/createBetService';
import { createBetProblem, newBetId } from '../services/createBetLogic';
import { endBetEarly } from '../services/betStatusService';
import { endEarlyProblem } from '../services/betStatusLogic';
import { friendIdsAtEvent, loadFriends } from '../services/createBetFriends';
import {
  betDescription,
  betSuggestions,
  closeMinutes,
  closeTimeOptions,
  createButtonText,
  defaultCloseTime,
  draftProblem,
  formatCloseAt,
  formatStake,
  friendName,
  gameTeams,
  initialPickedDate,
  joinNames,
  restoreStake,
  type BetFormat,
  type BetSuggestion,
  type CloseTimeId,
} from '../services/createBetFlowLogic';
import { HEAD_TO_HEAD_PARTICIPANTS, MAX_OPTIONS, MIN_POOL_OPTIONS, OPTION_KEYS } from '../../amplify/shared/betOptions';
import { GameHeader } from '../components/createBet/GameHeader';
import { SuggestionChips } from '../components/createBet/SuggestionChips';
import { FormatTabs } from '../components/createBet/FormatTabs';
import { BetQuestion } from '../components/createBet/BetQuestion';
import { SidePicker, type SidePreset } from '../components/createBet/SidePicker';
import { PoolOptions } from '../components/createBet/PoolOptions';
import { ChallengeCard } from '../components/createBet/ChallengeCard';
import { StakeAndClose } from '../components/createBet/StakeAndClose';
import { FriendRow } from '../components/createBet/FriendRow';
import { FriendPickerModal } from '../components/createBet/FriendPickerModal';
import { CreateBar } from '../components/createBet/CreateBar';
import { BetSentPanel } from '../components/createBet/BetSentPanel';
import { SquaresSetup } from '../components/createBet/SquaresSetup';

const client = generateClient<Schema>();

const LAST_STAKE_KEY = 'createBet:lastStake';
/** How long an invitation stays open */
const INVITATION_HOURS = 24;

interface SentBet {
  betId: string;
  title: string;
  description: string;
  pickName: string;
  stake: number;
  closeAt: string;
  closeLabel: string;
  invitedNames: string[];
}

export const CreateBetScreen: React.FC = () => {
  const { user } = useAuth();
  const { balance, isLoading: balanceLoading, profile } = useProfile();
  const { myBets } = useBetData();
  const { checkedInEvent, handleCheckInPress } = useEventCheckIn();
  const navigation = useNavigation<any>(); // eslint-disable-line @typescript-eslint/no-explicit-any
  const scrollRef = useRef<ScrollView | null>(null);
  const titleRef = useRef<TextInput | null>(null);
  // The id of the bet being submitted; kept across a retry whose outcome is unknown
  const pendingBetIdRef = useRef<string | null>(null);

  const event = checkedInEvent;
  const atLiveGame = !!event && (event.status === 'LIVE' || event.status === 'HALFTIME');
  const teams = useMemo(() => (event ? gameTeams(event) : null), [event]);

  const presets = useMemo((): SidePreset[] => {
    const list: SidePreset[] = [];
    if (teams) list.push({ id: 'teams', label: `${teams.away} / ${teams.home}`, options: [teams.away, teams.home] });
    list.push(
      { id: 'yes-no', label: 'Yes / No', options: ['Yes', 'No'] },
      { id: 'over-under', label: 'Over / Under', options: ['Over', 'Under'] },
      { id: 'custom', label: 'Custom', options: null },
    );
    return list;
  }, [teams]);
  const defaultPreset = presets[0];
  const defaultPoolOptions = useCallback(
    () => (teams ? [teams.away, teams.home, ''] : Array.from({ length: MIN_POOL_OPTIONS }, () => '')),
    [teams],
  );

  // The form
  const [format, setFormat] = useState<BetFormat>('sides');
  const [suggestion, setSuggestion] = useState<BetSuggestion | null>(null);
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [presetId, setPresetId] = useState<string>(defaultPreset.id);
  const [sideNames, setSideNames] = useState<string[]>(defaultPreset.options ?? ['Yes', 'No']);
  const [poolNames, setPoolNames] = useState<string[]>(defaultPoolOptions);
  const [poolEditing, setPoolEditing] = useState(true);
  const [pickedIndex, setPickedIndex] = useState<number | null>(null);
  const [opponentId, setOpponentId] = useState<string | null>(null);
  const [stake, setStake] = useState(restoreStake(null));
  const [closeId, setCloseId] = useState<CloseTimeId>(defaultCloseTime(atLiveGame));
  const [pickedDate, setPickedDate] = useState<Date | null>(null);
  const [isPrivate, setIsPrivate] = useState(false);
  const [selectedFriends, setSelectedFriends] = useState<Set<string>>(new Set());

  // Around the form
  const [friends, setFriends] = useState<User[]>([]);
  const [atGame, setAtGame] = useState<Set<string>>(new Set());
  const [showSquares, setShowSquares] = useState(false);
  const [showAllFriends, setShowAllFriends] = useState(false);
  const [showAddFunds, setShowAddFunds] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [sent, setSent] = useState<SentBet | null>(null);
  const [closing, setClosing] = useState(false);
  const [closed, setClosed] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [barHeight, setBarHeight] = useState<number>(spacing[24]);
  const [now, setNow] = useState(() => new Date());

  // Closing times are shown as clock times, so keep "now" current
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  // Start at the last stake used on this device
  useEffect(() => {
    AsyncStorage.getItem(LAST_STAKE_KEY)
      .then((saved) => setStake(restoreStake(saved)))
      .catch(() => undefined);
  }, []);

  // Friends, refreshed every time the screen comes into focus
  const refreshFriends = useCallback(async () => {
    if (!user?.userId) return;
    try {
      setFriends(await loadFriends(user.userId));
    } catch (error) {
      console.error('[CreateBet] Error fetching friends:', error);
    }
  }, [user?.userId]);
  useFocusEffect(
    useCallback(() => {
      refreshFriends();
    }, [refreshFriends]),
  );

  // Which friends are at the same game. They start invited, once per game.
  const invitedForEventRef = useRef<string | null>(null);
  const friendIdsKey = friends.map((friend) => friend.id).join(',');
  useEffect(() => {
    let cancelled = false;
    if (!event?.id || friends.length === 0) {
      setAtGame(new Set());
      return;
    }
    friendIdsAtEvent(event.id, friends.map((friend) => friend.id)).then((here) => {
      if (cancelled) return;
      setAtGame(here);
      if (invitedForEventRef.current !== event.id && here.size > 0) {
        invitedForEventRef.current = event.id;
        setSelectedFriends((prev) => new Set([...prev, ...here]));
      }
    });
    return () => {
      cancelled = true;
    };
    // friendIdsKey stands in for the friends list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id, friendIdsKey]);

  // A new game (or none) brings back its default sides, unless the creator typed their own
  const eventId = event?.id ?? null;
  useEffect(() => {
    if (presetId === 'custom' || suggestion) return;
    setPresetId(defaultPreset.id);
    setSideNames(defaultPreset.options ?? ['Yes', 'No']);
    setPoolNames((prev) => (prev.every((name) => !name.trim()) || teams ? defaultPoolOptions() : prev));
    setCloseId(defaultCloseTime(atLiveGame));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  // Friends at the game first, then everyone else
  const orderedFriends = useMemo(
    () => [...friends].sort((a, b) => Number(atGame.has(b.id)) - Number(atGame.has(a.id))),
    [friends, atGame],
  );
  const suggestions = useMemo(() => betSuggestions(event), [event]);

  // ---------------------------------------------------------------------------
  // Form actions
  // ---------------------------------------------------------------------------

  const pickSuggestion = (picked: BetSuggestion) => {
    setSuggestion(picked);
    setTitle(picked.title);
    if (picked.format === 'pool') {
      setFormat('pool');
      setPoolNames(picked.options.slice(0, MAX_OPTIONS));
      setPoolEditing(false);
      setPickedIndex(null);
    } else {
      const matching = presets.find(
        (preset) => preset.options && preset.options.join('\n') === picked.options.join('\n'),
      );
      setPresetId(matching?.id ?? 'custom');
      setSideNames(picked.options);
      if (format === 'pool') setFormat('sides');
      setPickedIndex(format === 'challenge' ? 0 : null);
    }
    if (picked.needsNumber) setTimeout(() => titleRef.current?.focus(), 0);
  };

  const changeFormat = (next: BetFormat) => {
    if (next === format) return;
    setFormat(next);
    if (next === 'pool') {
      if (poolNames.every((name) => !name.trim())) setPoolNames(defaultPoolOptions());
      setPoolEditing(true);
      setPickedIndex(null);
    } else if (next === 'challenge') {
      setPickedIndex((prev) => (prev === 0 || prev === 1 ? prev : 0));
    } else {
      setPickedIndex((prev) => (prev === 0 || prev === 1 ? prev : null));
    }
  };

  const pickPreset = (preset: SidePreset) => {
    setPresetId(preset.id);
    if (preset.options) setSideNames(preset.options);
  };

  const renameSide = (index: number, name: string) => {
    setSideNames((prev) => prev.map((existing, i) => (i === index ? name : existing)));
  };

  const renamePool = (index: number, name: string) => {
    setPoolNames((prev) => prev.map((existing, i) => (i === index ? name : existing)));
  };
  // Removing an option shifts the later ones up a key, so the pick moves with its option
  const removePoolOption = (index: number) => {
    if (poolNames.length <= MIN_POOL_OPTIONS) return;
    setPoolNames((prev) => prev.filter((_, i) => i !== index));
    setPickedIndex((prev) => (prev === null ? prev : prev === index ? null : prev > index ? prev - 1 : prev));
  };

  const toggleFriend = (friendId: string) => {
    setSelectedFriends((prev) => {
      const next = new Set(prev);
      if (next.has(friendId)) next.delete(friendId);
      else next.add(friendId);
      return next;
    });
  };

  const changeStake = (amount: number) => setStake(amount);

  const changeCloseTime = (id: CloseTimeId) => {
    setCloseId(id);
    if (id === 'date' && !pickedDate) setPickedDate(initialPickedDate(now));
  };

  // ---------------------------------------------------------------------------
  // What the form adds up to
  // ---------------------------------------------------------------------------

  const options = format === 'pool' ? poolNames : sideNames;
  const deadline = closeMinutes(closeId, now, pickedDate);
  const closeAt = deadline === null ? null : formatCloseAt(deadline, now);
  const closeOptionsList = closeTimeOptions(now);
  const pickName = pickedIndex === null ? null : options[pickedIndex]?.trim() || null;
  const overBalance = !balanceLoading && stake > balance;
  const opponent = friends.find((friend) => friend.id === opponentId) ?? null;
  const invitees = format === 'challenge' ? (opponentId ? [opponentId] : []) : Array.from(selectedFriends);
  const atGameInvited = invitees.filter((id) => atGame.has(id)).length;
  const effectivePrivate = format === 'challenge' ? !!opponentId : isPrivate;
  const button = createButtonText({
    format,
    stake,
    pickName,
    opponentName: opponent ? friendName(opponent) : null,
    isPrivate: effectivePrivate,
    inviteCount: invitees.length,
    atGameCount: atGameInvited,
    closeAt,
    overBalance,
  });

  // ---------------------------------------------------------------------------
  // Create
  // ---------------------------------------------------------------------------

  const sendInvitations = async (betId: string, betTitle: string, friendIds: string[]) => {
    if (!user?.userId || friendIds.length === 0) return;
    const fromName = profile?.displayName || profile?.username || user.username;
    // A challenge's opponent gets the side the creator did not take; others pick their own
    const invitedSide = format === 'challenge' ? OPTION_KEYS[pickedIndex === 0 ? 1 : 0] : '';
    await Promise.all(
      friendIds.map(async (friendId) => {
        try {
          await client.models.BetInvitation.create({
            betId,
            fromUserId: user.userId,
            toUserId: friendId,
            status: 'PENDING',
            invitedSide,
            expiresAt: new Date(Date.now() + INVITATION_HOURS * 3600_000).toISOString(),
          });
          await NotificationService.notifyBetInvitationReceived(
            friendId,
            fromName,
            betTitle,
            user.userId,
            betId,
            `${betId}-${friendId}`,
          );
        } catch (error) {
          // The bet exists; one failed invitation must not hide that
          console.error(`[CreateBet] Error inviting ${friendId}:`, error);
        }
      }),
    );
  };

  const handleCreate = async () => {
    if (overBalance) {
      setShowAddFunds(true);
      return;
    }
    const problem = draftProblem({ format, title, details, options, pickedIndex, stake, closeMinutes: deadline });
    if (problem) {
      showAlert(problem.title, problem.message);
      return;
    }
    if (!user?.userId || pickedIndex === null || deadline === null) {
      showAlert('Not Signed In', 'You need to be signed in to create a bet.');
      return;
    }

    setIsCreating(true);
    try {
      if (!pendingBetIdRef.current) pendingBetIdRef.current = newBetId();
      const betId = pendingBetIdRef.current;
      const names = options.map((name) => name.trim());
      const description = betDescription(details, title, event);
      const result = await createBetWithStake({
        betId,
        title: title.trim(),
        description,
        category: event ? 'SPORTS' : 'CUSTOM',
        amount: stake,
        side: OPTION_KEYS[pickedIndex],
        sideAName: names[0],
        sideBName: names[1],
        deadlineMinutes: deadline,
        isPrivate: effectivePrivate,
        ...(format === 'pool' ? { options: names } : {}),
        ...(format === 'challenge' ? { maxParticipants: HEAD_TO_HEAD_PARTICIPANTS } : {}),
        // Tagged to the game the creator is checked in to, so "bets at this game" finds it
        eventId: event?.id,
      });

      const refusal = createBetProblem(result, stake);
      if (refusal) {
        // A refusal wrote nothing, so the next attempt can use a fresh id; a failed call
        // may have gone through, so it keeps this one
        if (result) pendingBetIdRef.current = null;
        showAlert(refusal.title, refusal.message);
        return;
      }
      pendingBetIdRef.current = null;
      AsyncStorage.setItem(LAST_STAKE_KEY, String(stake)).catch(() => undefined);

      await sendInvitations(betId, title.trim(), invitees);

      setSent({
        betId,
        title: title.trim(),
        description,
        pickName: names[pickedIndex],
        stake,
        closeAt: closeAt ?? '',
        closeLabel: closeOptionsList.find((option) => option.id === closeId)?.label ?? '',
        invitedNames: invitees
          .map((id) => friends.find((friend) => friend.id === id))
          .filter((friend): friend is User => !!friend)
          .map(friendName),
      });
      setClosed(false);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    } catch (error) {
      console.error('[CreateBet] Error creating bet:', error);
      showAlert('Error', 'Failed to create bet. Please try again.', [{ text: 'OK' }]);
    } finally {
      setIsCreating(false);
    }
  };

  /** The next bet: the question clears; game, stake, closing time and friends stay. */
  const anotherBet = () => {
    pendingBetIdRef.current = null;
    setSent(null);
    setSuggestion(null);
    setTitle('');
    setDetails('');
    setShowDetails(false);
    setPresetId(defaultPreset.id);
    setSideNames(defaultPreset.options ?? ['Yes', 'No']);
    setPoolNames(defaultPoolOptions());
    setPoolEditing(true);
    setPickedIndex(format === 'challenge' ? 0 : null);
  };

  const closeBetting = () => {
    if (!sent) return;
    showAlert('Close betting?', 'Nobody else can join once it closes. You can resolve it whenever you are ready.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Close betting',
        style: 'destructive',
        onPress: async () => {
          setClosing(true);
          const result = await endBetEarly(sent.betId);
          setClosing(false);
          const problem = result ? endEarlyProblem(result) : 'Could not close betting. Please try again.';
          if (problem) showAlert('Close betting', problem);
          else setClosed(true);
        },
      },
    ]);
  };

  const viewBet = (betId: string) => {
    navigation.navigate('Bets', { screen: 'BetDetails', params: { betId, returnToTab: 'Create' } });
  };

  const openOnGame = event ? myBets.filter((bet) => bet.eventId === event.id && bet.status === 'ACTIVE').length : 0;
  const sentBet: Bet | null = sent
    ? myBets.find((bet) => bet.id === sent.betId) ??
      ({ id: sent.betId, title: sent.title, description: sent.description } as Bet)
    : null;

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  // ---------------------------------------------------------------------------

  const onBarLayout = (layoutEvent: LayoutChangeEvent) => setBarHeight(layoutEvent.nativeEvent.layout.height);
  const showBar = !sent && !showSquares;

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="screen-create-bet">
      <Header showBalance={true} variant="default" showEventBanner={!event} />
      {event && <GameHeader event={event} onChangeGame={handleCheckInPress} />}

      {toast && (
        <View style={styles.toast} testID="create-toast">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}

      <ScrollView
        ref={scrollRef}
        style={styles.content}
        contentContainerStyle={{ paddingBottom: (showBar ? barHeight : 0) + spacing.lg }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {showSquares ? (
          <SquaresSetup
            initialEvent={event}
            onBack={() => setShowSquares(false)}
            onCreated={(message) => {
              setShowSquares(false);
              showToast(message);
            }}
          />
        ) : sent ? (
          <BetSentPanel
            invitedText={sent.invitedNames.length > 0 ? `${joinNames(sent.invitedNames)} ${sent.invitedNames.length === 1 ? 'was' : 'were'} invited` : null}
            summary={`You: ${sent.pickName} · $${sent.stake.toFixed(2)} · Closes ${sent.closeAt}`}
            againLabel={event ? 'Another bet on this game' : 'Another bet'}
            againDetail={`Keeps ${formatStake(sent.stake)} · ${sent.closeLabel}${sent.invitedNames.length > 0 ? ` · same ${sent.invitedNames.length === 1 ? 'friend' : `${sent.invitedNames.length} friends`}` : ''}`}
            onAgain={anotherBet}
            onShare={() => setShowShare(true)}
            onView={() => viewBet(sent.betId)}
            onCloseBetting={closeBetting}
            closing={closing}
            closed={closed}
            openOnGame={openOnGame > 0 ? `${openOnGame} open bet${openOnGame === 1 ? '' : 's'} on this game` : null}
            onOpenOnGame={() => navigation.navigate('Bets')}
          />
        ) : (
          <>
            <SuggestionChips
              suggestions={suggestions}
              activeId={suggestion && suggestion.title === title ? suggestion.id : null}
              onPick={pickSuggestion}
            />
            <FormatTabs value={format} onChange={changeFormat} onSquares={() => setShowSquares(true)} />
            <BetQuestion
              ref={titleRef}
              title={title}
              onTitleChange={setTitle}
              details={details}
              onDetailsChange={setDetails}
              showDetails={showDetails}
              onShowDetails={() => setShowDetails(true)}
              placeholder={
                format === 'challenge'
                  ? 'What are the two of you betting on?'
                  : format === 'pool'
                    ? 'e.g. Who wins the Super Bowl?'
                    : "What's the bet?"
              }
            />

            {format === 'sides' && (
              <SidePicker
                options={sideNames}
                pickedIndex={pickedIndex}
                onPick={setPickedIndex}
                onRename={renameSide}
                presets={presets}
                activePresetId={presetId}
                onPreset={pickPreset}
              />
            )}
            {format === 'pool' && (
              <PoolOptions
                options={poolNames}
                pickedIndex={pickedIndex}
                onPick={setPickedIndex}
                editing={poolEditing}
                onToggleEdit={() => setPoolEditing((value) => !value)}
                onRename={renamePool}
                onAdd={() => setPoolNames((prev) => (prev.length < MAX_OPTIONS ? [...prev, ''] : prev))}
                onRemove={removePoolOption}
              />
            )}
            {format === 'challenge' && (
              <ChallengeCard
                friends={orderedFriends}
                atGame={atGame}
                opponentId={opponentId}
                onPickOpponent={(id) => setOpponentId((prev) => (prev === id ? null : id))}
                options={sideNames}
                pickedIndex={pickedIndex}
                onPick={setPickedIndex}
                onSwap={() => setPickedIndex((prev) => (prev === 1 ? 0 : 1))}
                onRename={renameSide}
                presets={presets}
                activePresetId={presetId}
                onPreset={pickPreset}
                myName={profile?.displayName || profile?.username || 'You'}
              />
            )}

            <StakeAndClose
              stake={stake}
              onStakeChange={changeStake}
              overBalance={overBalance}
              closeOptions={closeOptionsList}
              closeId={closeId}
              onCloseChange={changeCloseTime}
              closeAt={closeAt}
              pickedDate={pickedDate}
              onPickedDateChange={setPickedDate}
              now={now}
            />

            {format !== 'challenge' && (
              <FriendRow
                friends={orderedFriends}
                atGame={atGame}
                selected={selectedFriends}
                onToggle={toggleFriend}
                onAllFriends={() => setShowAllFriends(true)}
                isPrivate={isPrivate}
                onPrivacyChange={setIsPrivate}
                showInvites={true}
              />
            )}
          </>
        )}
      </ScrollView>

      {showBar && (
        <View onLayout={onBarLayout} style={styles.barHost} pointerEvents="box-none">
          <CreateBar
            label={button.label}
            detail={button.detail}
            onPress={handleCreate}
            disabled={!overBalance && pickedIndex === null}
            busy={isCreating}
          />
        </View>
      )}

      <FriendPickerModal
        visible={showAllFriends}
        onClose={() => setShowAllFriends(false)}
        friends={orderedFriends}
        atGame={atGame}
        selected={selectedFriends}
        onToggle={toggleFriend}
      />
      <AddFundsModal visible={showAddFunds} onClose={() => setShowAddFunds(false)} />
      {sentBet && <BetQRCodeModal visible={showShare} onClose={() => setShowShare(false)} bet={sentBet} />}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    ...commonStyles.safeArea,
  },
  content: {
    flex: 1,
  },
  barHost: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  toast: {
    backgroundColor: colors.success,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginHorizontal: spacing.md,
    marginTop: spacing.xs,
    borderRadius: spacing.radius.sm,
  },
  toastText: {
    ...textStyles.button,
    color: colors.textInverse,
    fontWeight: typography.fontWeight.medium,
    textAlign: 'center',
  },
});
