/**
 * Create Bet Screen: game first, built for repeat bets (the "Create Bet Final" design).
 *
 * Checked in to a game, the screen opens on it: one-tap suggestions fill the question and
 * the sides, the teams are the default sides, and friends at the same game start invited.
 * After a bet is sent, "Another bet" keeps the game, stake, closing time and friends and
 * clears only the question.
 *
 * The question comes first, and is read as it is typed ("Create Bet Type It" design;
 * services/betTextParser.ts): "$20 says the Bills win tonight, bet Sam" fills the sides,
 * the pick, the stake, the closing time and the friend, and only those
 * (services/betTextAutofill.ts). After a pause, "We heard" under the question shows what
 * was understood, with the create button. Filled fields carry a blue ✦ (a guess, a dashed
 * outline); a field set by hand is never changed by typing; Undo fill puts them all back.
 * The words that went into other fields leave the question when you are done typing.
 *
 * Creating is one call to the server's createBetWithStake (it re-checks everything and
 * takes the stake); invitations are still sent from here afterwards. The decisions are
 * pure functions in services/createBetFlowLogic.ts.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { commonStyles, spacing } from '../styles';
import { LiveGameBanner } from '../components/ui/LiveGameBanner';
import { EventDiscoveryModal } from '../components/ui/EventDiscoveryModal';
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
import { getProfilePictureUrl } from '../services/imageUploadService';
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
  orderSuggestions,
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
import { ChallengeCard, ChallengeOpponents } from '../components/createBet/ChallengeCard';
import { CreateHeader } from '../components/createBet/CreateHeader';
import { StakeAndClose } from '../components/createBet/StakeAndClose';
import { FriendRow } from '../components/createBet/FriendRow';
import { FriendPickerModal } from '../components/createBet/FriendPickerModal';
import { CreateBar } from '../components/createBet/CreateBar';
import { BetSentPanel } from '../components/createBet/BetSentPanel';
import { SquaresSetup } from '../components/createBet/SquaresSetup';
import { parseBetText } from '../services/betTextParser';
import {
  autofillGuesses,
  autofillValues,
  EMPTY_AUTOFILL,
  filledFields,
  planAutofill,
  settleAutofill,
  undoAutofill,
  type AutofillKey,
  type AutofillState,
  type AutofillValues,
} from '../services/betTextAutofill';
import { WeHeardPanel } from '../components/createBet/WeHeardPanel';
import type { FillMarkKind } from '../components/createBet/FillMark';

const client = generateClient<Schema>();

const LAST_STAKE_KEY = 'createBet:lastStake';
/** How long typing pauses before "We heard" shows what was understood */
const HEARD_PAUSE_MS = 400;
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
  const {
    checkedInEvent,
    handleCheckInPress,
    handleCheckOut,
    nearbyEventsCount,
    showEventDiscovery,
    setShowEventDiscovery,
    handleCheckInSuccess,
  } = useEventCheckIn();
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
  const [suggestion, setSuggestionState] = useState<BetSuggestion | null>(null);
  // Read by the game-change reset below, which can run just after a tap with an older render
  const suggestionRef = useRef<BetSuggestion | null>(null);
  const setSuggestion = (next: BetSuggestion | null) => {
    suggestionRef.current = next;
    setSuggestionState(next);
  };
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
  // What the question has filled in so far, so it can be taken back when the words go. The
  // ref is read while typing; the state redraws the ✦ marks.
  const autofillRef = useRef<AutofillState>(EMPTY_AUTOFILL);
  const [autofill, setAutofill] = useState<AutofillState>(EMPTY_AUTOFILL);
  const commitAutofill = (next: AutofillState) => {
    autofillRef.current = next;
    setAutofill(next);
  };
  // Fields set by hand: typing never changes them
  const touchedRef = useRef<Set<AutofillKey>>(new Set());
  const touch = (key: AutofillKey) => touchedRef.current.add(key);
  // Words moved out of the question ("✦ Cleaned up from what you typed")
  const [cleaned, setCleaned] = useState(false);
  // "We heard": shown while the question has focus, once typing has paused
  const [questionFocused, setQuestionFocused] = useState(false);
  const [heardReady, setHeardReady] = useState(false);
  const heardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (heardTimerRef.current) clearTimeout(heardTimerRef.current);
  }, []);

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
  const [barHeight, setBarHeight] = useState<number>(spacing[24]);
  const [now, setNow] = useState(() => new Date());

  // Closing times are shown as clock times, so keep "now" current
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  // Your own picture, for the "You" side of a challenge: the record holds the S3 key
  const myPictureKey = profile?.profilePictureUrl;
  const [myPictureUrl, setMyPictureUrl] = useState<string | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    if (!myPictureKey) {
      setMyPictureUrl(undefined);
      return;
    }
    getProfilePictureUrl(myPictureKey).then((url) => !cancelled && setMyPictureUrl(url || undefined));
    return () => {
      cancelled = true;
    };
  }, [myPictureKey]);

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

  // A new game (or none) brings back its default sides, unless the creator typed their own,
  // picked a suggestion or typed a bet that filled them. The refs, not this render's
  // state: the game can finish loading just as a suggestion is tapped, and this effect
  // then runs after the tap with the render from before it.
  const eventId = event?.id ?? null;
  useEffect(() => {
    const applied = autofillRef.current.applied;
    const keepSides =
      presetId === 'custom' || suggestionRef.current || 'sides' in applied || 'pool' in applied || 'format' in applied;
    if (!keepSides) {
      setPresetId(defaultPreset.id);
      setSideNames(defaultPreset.options ?? ['Yes', 'No']);
      setPoolNames((prev) => (prev.every((name) => !name.trim()) || teams ? defaultPoolOptions() : prev));
    }
    // The game's closing time (short at a live game), unless it was set by hand or typed
    if (!('close' in applied) && !touchedRef.current.has('close')) setCloseId(defaultCloseTime(atLiveGame));
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

  const activeSuggestionId = suggestion && suggestion.title === title ? suggestion.id : null;

  const pickSuggestion = (picked: BetSuggestion) => {
    // A suggestion replaces the question, and with it what the typed one filled in
    commitAutofill(EMPTY_AUTOFILL);
    setCleaned(false);
    // A second tap on the selected suggestion clears what it filled in
    if (picked.id === activeSuggestionId) {
      setSuggestion(null);
      setTitle('');
      setPresetId(defaultPreset.id);
      setSideNames(defaultPreset.options ?? ['Yes', 'No']);
      if (picked.format === 'pool') {
        setPoolNames(defaultPoolOptions());
        setPoolEditing(true);
      }
      if (picked.format !== 'sides') setFormat('sides');
      setPickedIndex(null);
      return;
    }
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
      // A 1 v 1 chip switches to 1 v 1; a two-sided one leaves a 1 v 1 as it is
      const nextFormat = picked.format === 'challenge' || format === 'challenge' ? 'challenge' : 'sides';
      if (nextFormat !== format) setFormat(nextFormat);
      setPickedIndex(nextFormat === 'challenge' ? 0 : null);
    }
    if (picked.needsNumber) setTimeout(() => titleRef.current?.focus(), 0);
  };

  const changeFormat = (next: BetFormat) => {
    if (next === format) return;
    touch('format');
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
    touch('sides');
    setPresetId(preset.id);
    if (preset.options) setSideNames(preset.options);
  };

  const renameSide = (index: number, name: string) => {
    touch('sides');
    setSideNames((prev) => prev.map((existing, i) => (i === index ? name : existing)));
  };

  const renamePool = (index: number, name: string) => {
    touch('pool');
    setPoolNames((prev) => prev.map((existing, i) => (i === index ? name : existing)));
  };
  // Removing an option shifts the later ones up a key, so the pick moves with its option
  const removePoolOption = (index: number) => {
    if (poolNames.length <= MIN_POOL_OPTIONS) return;
    touch('pool');
    setPoolNames((prev) => prev.filter((_, i) => i !== index));
    setPickedIndex((prev) => (prev === null ? prev : prev === index ? null : prev > index ? prev - 1 : prev));
  };

  const toggleFriend = (friendId: string) => {
    touch('friends');
    setSelectedFriends((prev) => {
      const next = new Set(prev);
      if (next.has(friendId)) next.delete(friendId);
      else next.add(friendId);
      return next;
    });
  };

  const changeStake = (amount: number) => {
    touch('stake');
    setStake(amount);
  };

  const changeCloseTime = (id: CloseTimeId) => {
    touch('close');
    setCloseId(id);
    if (id === 'date' && !pickedDate) setPickedDate(initialPickedDate(now));
  };

  const pickSide = (index: number) => {
    touch('pickedIndex');
    setPickedIndex(index);
  };
  const swapSides = () => {
    touch('pickedIndex');
    setPickedIndex((prev) => (prev === 1 ? 0 : 1));
  };
  const changePickedDate = (date: Date) => {
    touch('close');
    setPickedDate(date);
  };
  const pickOpponent = (id: string) => {
    touch('opponentId');
    setOpponentId((prev) => (prev === id ? null : id));
  };
  const addPoolOption = () => {
    touch('pool');
    setPoolNames((prev) => (prev.length < MAX_OPTIONS ? [...prev, ''] : prev));
  };

  // ---------------------------------------------------------------------------
  // The question fills the rest of the form
  // ---------------------------------------------------------------------------

  /** The fields the question can fill, as the form holds them now. */
  const formValues = (): AutofillValues => ({
    format,
    sides: sideNames,
    pool: poolNames,
    pickedIndex,
    stake,
    close: { id: closeId, date: closeId === 'date' && pickedDate ? pickedDate.toISOString() : null },
    friends: Array.from(selectedFriends).sort(),
    opponentId,
  });

  const parseQuestion = (text: string) =>
    parseBetText(text, { friends, event, now: new Date() });

  const applyAutofill = (set: AutofillValues) => {
    if ('format' in set && set.format && set.format !== format) {
      setFormat(set.format);
      if (set.format === 'challenge') setPickedIndex((prev) => (prev === 0 || prev === 1 ? prev : 0));
      else if (set.format === 'sides') setPickedIndex((prev) => (prev === 0 || prev === 1 ? prev : null));
      else setPickedIndex(null);
    }
    if ('sides' in set && set.sides) {
      const names = set.sides;
      setSideNames(names);
      const preset = presets.find((p) => p.options && p.options.join('\n') === names.join('\n'));
      setPresetId(preset?.id ?? 'custom');
    }
    if ('pool' in set && set.pool) {
      setPoolNames(set.pool);
      setPoolEditing(false);
    }
    if ('pickedIndex' in set) setPickedIndex(set.pickedIndex ?? null);
    if ('stake' in set && set.stake !== undefined) setStake(set.stake);
    if ('close' in set && set.close) {
      setCloseId(set.close.id);
      if (set.close.date) setPickedDate(new Date(set.close.date));
    }
    if ('friends' in set) setSelectedFriends(new Set(set.friends ?? []));
    if ('opponentId' in set) setOpponentId(set.opponentId ?? null);
  };

  const typeQuestion = (text: string) => {
    setTitle(text);
    const state = autofillRef.current;
    if (!text.trim()) setCleaned(false);
    const parsed = parseQuestion(text);
    const current = formValues();
    const next = autofillValues(parsed, {
      now: new Date(),
      closeOptions: closeTimeOptions(new Date()),
      state,
      current,
    });
    const plan = planAutofill(state, next, current, [...touchedRef.current], autofillGuesses(parsed));
    commitAutofill(plan.state);
    applyAutofill(plan.set);

    // "We heard" once typing pauses
    if (heardTimerRef.current) clearTimeout(heardTimerRef.current);
    heardTimerRef.current = setTimeout(() => setHeardReady(true), HEARD_PAUSE_MS);
  };

  /**
   * Done typing: the words that went into other fields ("$20", "bet Sam") leave the
   * question. What they filled in stays, whatever is typed next.
   */
  const tidyQuestion = (): string => {
    const clean = parseQuestion(title).cleanTitle;
    if (!clean) return title;
    setTitle(clean);
    commitAutofill(settleAutofill(autofillRef.current));
    setCleaned(true);
    return clean;
  };

  const leaveQuestion = () => {
    setQuestionFocused(false);
    setHeardReady(false);
    if (heardTimerRef.current) clearTimeout(heardTimerRef.current);
    tidyQuestion();
  };

  /**
   * Undo fill: every filled field back to what it held; the question stays as it is, and
   * is read again once it is changed.
   */
  const undoFill = () => {
    const plan = undoAutofill(autofillRef.current);
    applyAutofill(plan.set);
    commitAutofill(plan.state);
    setCleaned(false);
  };

  /**
   * ✕ on the question: empty it, and put back what it filled. A suggestion's question
   * clears as a second tap on the suggestion does.
   */
  const clearQuestion = () => {
    const active = suggestions.find((s) => s.id === activeSuggestionId);
    if (active) {
      pickSuggestion(active);
    } else {
      const plan = undoAutofill(autofillRef.current);
      applyAutofill(plan.set);
      commitAutofill(plan.state);
      setTitle('');
      setSuggestion(null);
    }
    setCleaned(false);
    titleRef.current?.focus();
  };

  const { filled, guessed } = filledFields(autofill);
  const markFor = (key: AutofillKey): FillMarkKind =>
    guessed.has(key) ? 'guess' : filled.has(key) ? 'filled' : null;
  // "Tap your side ✦" when the sides or the side backed came from the text
  const sidesMark: FillMarkKind = markFor('sides') ?? (filled.has('pickedIndex') ? 'filled' : null);

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
    opponentName: opponent ? friendName(opponent).split(' ')[0] : null,
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
    // The keyboard can stay up while Create is tapped, so the question may not be tidied yet
    const question = tidyQuestion();
    const problem = draftProblem({ format, title: question, details, options, pickedIndex, stake, closeMinutes: deadline });
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
      const description = betDescription(details, question, event);
      const result = await createBetWithStake({
        betId,
        title: question.trim(),
        description,
        // At a game it is sports; otherwise what the question is about, if that is clear
        category: event ? 'SPORTS' : parseQuestion(question).category ?? 'CUSTOM',
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

      await sendInvitations(betId, question.trim(), invitees);

      setSent({
        betId,
        title: question.trim(),
        description,
        pickName: names[pickedIndex],
        stake,
        closeAt: closeAt ?? '',
        closeLabel: closeOptionsList.find((option) => option.id === closeId)?.label ?? '',
        invitedNames: invitees
          .map((id) => friends.find((friend) => friend.id === id))
          .filter((friend): friend is User => !!friend)
          .map((friend) => friendName(friend).split(' ')[0]),
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
    commitAutofill(EMPTY_AUTOFILL);
    touchedRef.current = new Set();
    setCleaned(false);
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

  // Leaving the Create tab ends what was showing on it: coming back, from the tab bar or
  // anywhere else, is always the form, never the "Bet sent" sheet or the squares setup.
  // Through refs, so the cleanup runs on leaving only, not on every change to `sent`.
  const sentRef = useRef<SentBet | null>(null);
  const anotherBetRef = useRef(anotherBet);
  useEffect(() => {
    sentRef.current = sent;
    anotherBetRef.current = anotherBet;
  });
  useFocusEffect(
    useCallback(
      () => () => {
        if (sentRef.current) anotherBetRef.current();
        setShowSquares(false);
      },
      [],
    ),
  );

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

  const sentBet: Bet | null = sent
    ? myBets.find((bet) => bet.id === sent.betId) ??
      ({ id: sent.betId, title: sent.title, description: sent.description } as Bet)
    : null;


  // ---------------------------------------------------------------------------

  const onBarLayout = (layoutEvent: LayoutChangeEvent) => setBarHeight(layoutEvent.nativeEvent.layout.height);
  // "We heard" brings its own create button; the bar at the bottom waits until it goes
  const showHeard = questionFocused && heardReady && filled.size > 0 && !sent;
  const showBar = !sent && !showSquares && !showHeard;
  const closeLabelNow =
    closeId === 'date' ? closeAt ?? 'Pick a date' : closeOptionsList.find((option) => option.id === closeId)?.label ?? '';
  const friendsHere = orderedFriends.filter((friend) => atGame.has(friend.id));

  if (showSquares) {
    // Squares has its own title bar (with the back arrow), scroll and create button
    return (
      <SafeAreaView style={styles.container} edges={['top']} testID="screen-create-bet">
        <SquaresSetup checkedInGame={event} friends={orderedFriends} onBack={() => setShowSquares(false)} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="screen-create-bet">
      <CreateHeader title="New bet" />

      <ScrollView
        ref={scrollRef}
        style={styles.content}
        contentContainerStyle={{ paddingBottom: (showBar ? barHeight : 0) + spacing.lg }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {event ? (
          <GameHeader event={event} onChangeGame={handleCheckInPress} friendsHere={friendsHere} />
        ) : (
          // Not checked in: checking in is one tap away, in the game's place
          <LiveGameBanner
            checkedInEvent={null}
            nearbyEventsCount={nearbyEventsCount}
            onCheckInPress={handleCheckInPress}
            onCheckOutPress={handleCheckOut}
          />
        )}


        {/* The question first: typing it can fill in everything below */}
        <BetQuestion
          ref={titleRef}
          title={title}
          onTitleChange={typeQuestion}
          onTitleFocus={() => setQuestionFocused(true)}
          onTitleBlur={leaveQuestion}
          fill={filled.size > 0 ? { cleaned } : null}
          onUndoFill={undoFill}
          onClear={clearQuestion}
          details={details}
          onDetailsChange={setDetails}
          showDetails={showDetails}
          onShowDetails={() => setShowDetails(true)}
          placeholder={
            suggestions.length > 0
              ? 'Say the bet, or tap one below'
              : format === 'challenge'
                ? 'e.g. Bet Sam $10 I win at golf'
                : format === 'pool'
                  ? 'e.g. Who wins the Super Bowl? Chiefs, Bills or Eagles'
                  : "What's the bet? e.g. $10 says it snows tonight"
          }
        />

        {showHeard && (
          <WeHeardPanel
            format={format}
            options={options}
            pickedIndex={pickedIndex}
            opponentName={opponent ? friendName(opponent).split(' ')[0] : null}
            stake={stake}
            closeLabel={closeLabelNow}
            sidesGuess={guessed.has('sides') || guessed.has('pool')}
            closeGuess={guessed.has('close')}
            createLabel={button.label}
            createDetail={button.detail}
            onCreate={handleCreate}
            createDisabled={!overBalance && pickedIndex === null}
            busy={isCreating}
          />
        )}

        {/* Every format shows every suggestion, the current format's first */}
        <SuggestionChips suggestions={orderSuggestions(suggestions, format)} activeId={activeSuggestionId} onPick={pickSuggestion} />
        <FormatTabs
          value={format}
          onChange={changeFormat}
          onSquares={() => setShowSquares(true)}
          filled={filled.has('format')}
        />
        {format === 'challenge' && (
          <ChallengeOpponents
            friends={orderedFriends}
            atGame={atGame}
            opponentId={opponentId}
            onPickOpponent={pickOpponent}
            mark={markFor('opponentId')}
          />
        )}

        {format === 'sides' && (
          <SidePicker
            options={sideNames}
            pickedIndex={pickedIndex}
            onPick={pickSide}
            onRename={renameSide}
            presets={presets}
            activePresetId={presetId}
            onPreset={pickPreset}
            mark={sidesMark}
          />
        )}
        {format === 'pool' && (
          <PoolOptions
            options={poolNames}
            pickedIndex={pickedIndex}
            onPick={pickSide}
            editing={poolEditing}
            onToggleEdit={() => setPoolEditing((value) => !value)}
            onRename={renamePool}
            onAdd={addPoolOption}
            onRemove={removePoolOption}
            mark={markFor('pool')}
          />
        )}
        {format === 'challenge' && (
          <ChallengeCard
            friends={orderedFriends}
            opponentId={opponentId}
            options={sideNames}
            pickedIndex={pickedIndex}
            onPick={pickSide}
            onSwap={swapSides}
            onRename={renameSide}
            presets={presets}
            activePresetId={presetId}
            onPreset={pickPreset}
            myPictureUrl={myPictureUrl}
            mark={sidesMark}
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
          onPickedDateChange={changePickedDate}
          now={now}
          stakeMark={markFor('stake')}
          closeMark={markFor('close')}
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
          />
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

      {sent && (
        <BetSentPanel
          invitedText={sent.invitedNames.length > 0 ? `${joinNames(sent.invitedNames)} ${sent.invitedNames.length === 1 ? 'was' : 'were'} notified` : null}
          title={sent.title}
          pickName={sent.pickName}
          stakeText={`$${sent.stake.toFixed(2)}`}
          closeAt={sent.closeAt}
          againLabel={event ? 'Another bet on this game' : 'Another bet'}
          againDetail={`Keeps ${formatStake(sent.stake)} · ${sent.closeLabel}${sent.invitedNames.length > 0 ? ` · same ${sent.invitedNames.length === 1 ? 'friend' : `${sent.invitedNames.length} friends`}` : ''}`}
          onAgain={anotherBet}
          onShare={() => setShowShare(true)}
          onView={() => viewBet(sent.betId)}
          onCloseBetting={closeBetting}
          closing={closing}
          closed={closed}
        />
      )}

      <EventDiscoveryModal
        visible={showEventDiscovery}
        onClose={() => setShowEventDiscovery(false)}
        currentUserId={user?.userId || ''}
        onCheckInSuccess={handleCheckInSuccess}
      />
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
});
