/**
 * Reads the bet question as it is typed ("$20 says the Bills win tonight") and works out
 * what else on the Create screen it already says: two sides or a pool's options, a 1 v 1
 * against a friend, the side the creator backs, the stake, the closing time, friends to
 * invite and a category.
 *
 * It returns only what the text said. A field it leaves out was not mentioned, and the
 * form keeps whatever it holds (see betTextAutofill.ts for how the screen applies it).
 * Nothing here is trusted: the creator sees the filled form before sending, and the
 * server's createBetWithStake checks everything again.
 *
 * Rules, not a model: instant, offline, the same answer every time. Pure, so it is unit
 * tested (__tests__/betTextParser.test.ts holds the phrasings it is meant to handle).
 */

import { MAX_OPTIONS, MIN_POOL_OPTIONS } from '../../amplify/shared/betOptions';
import { LIMITS } from '../../amplify/shared/createBetLogic';
import { gameTeams, isValidStake, type BetFormat, type GameForSuggestions } from './createBetFlowLogic';

export type BetCategory = 'SPORTS' | 'ENTERTAINMENT' | 'WEATHER' | 'STOCKS' | 'CUSTOM';

export interface ParserFriend {
  id: string;
  username?: string | null;
  displayName?: string | null;
}

export interface ParseContext {
  friends?: ParserFriend[];
  /** The game the creator is checked in to, if any */
  event?: GameForSuggestions | null;
  /** For closing times like "tonight"; defaults to the current time */
  now?: Date;
}

/** The parts of the form the text spoke to. Anything left out was not mentioned. */
export interface ParsedBet {
  /** 2 sides, a pool, or a 1 v 1 when one friend is named as the opponent */
  format?: BetFormat;
  /** Two side names, or a pool's three to six options, in key order. Comes with `format`. */
  options?: string[];
  /** Which of the options the creator backs */
  pickedIndex?: number;
  stake?: number;
  deadlineMinutes?: number;
  /** Friends to invite (2 sides or a pool) */
  friendIds?: string[];
  /** The one friend challenged (1 v 1) */
  opponentId?: string;
  category?: BetCategory;
  /**
   * The question without the words that went into other fields (the stake, "bet Mike",
   * "I'll take the over", a pool's list). Only set when some did: otherwise the question
   * stays exactly as typed.
   */
  cleanTitle?: string;
  /**
   * Fields filled on a weak clue, for the screen to show as guesses: Yes / No read from a
   * bare statement with a stake ("$5 Lamar throws 2 TDs"), or "next score" read as 15 min.
   */
  guesses?: Array<'options' | 'deadline'>;
}

// ---------------------------------------------------------------------------
// Small helpers

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);
const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
/** Leading and trailing punctuation and joining words, keeping a closing "?". */
const trimEdges = (s: string) =>
  squash(s)
    .replace(/^[\s,.;:!\-–—]+/, '')
    .replace(/[\s,.;:!\-–—]+$/, '')
    .replace(/^(?:and|so|that|then)\s+/i, '');

const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 0, 0);
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const QUESTION_START = /^(?:will|won'?t|would|does|doesn'?t|do|did|is|isn'?t|are|aren'?t|can|can'?t|could|has|have|should)\b/i;
const OPEN_QUESTION = /^(?:who|which|what)\b/i;

// ---------------------------------------------------------------------------
// Amount

const WORD_AMOUNTS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  fifteen: 15, twenty: 20, 'twenty five': 25, thirty: 30, forty: 40, fifty: 50,
  hundred: 100, 'a hundred': 100, 'one hundred': 100,
};
const SLANG_AMOUNTS: Record<string, number> = { buck: 1, dollar: 1, fiver: 5, tenner: 10 };

function takeAmount(text: string): { amount?: number; rest: string } {
  const patterns: Array<[RegExp, (m: RegExpMatchArray) => number]> = [
    [/(?:\bfor\s+)?\$\s?(\d+(?:\.\d{1,2})?)(?![\d.])/i, (m) => parseFloat(m[1])],
    [/(?:\bfor\s+)?\b(\d+(?:\.\d{1,2})?)\s*(?:bucks|dollars?|usd)\b/i, (m) => parseFloat(m[1])],
    [
      /(?:\bfor\s+)?\b(a hundred|one hundred|twenty five|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|thirty|forty|fifty|hundred)\s+(?:bucks|dollars?)\b/i,
      (m) => WORD_AMOUNTS[m[1].toLowerCase()],
    ],
    [/(?:\bfor\s+)?\ba\s+(buck|dollar|fiver|tenner)\b/i, (m) => SLANG_AMOUNTS[m[1].toLowerCase()]],
  ];
  for (const [re, value] of patterns) {
    const m = text.match(re);
    if (m) {
      const amount = value(m);
      if (amount > 0) return { amount, rest: text.replace(m[0], ' ') };
    }
  }
  return { rest: text };
}

// ---------------------------------------------------------------------------
// Deadline (read only; the words stay in the title, where they mean something)

function readDeadline(text: string, now: Date, atGame: boolean): number | undefined {
  const t = text.toLowerCase();
  let target: Date | undefined;

  // "in 5 minutes" is usually part of the challenge ("eat 10 wings in 5 minutes"), so
  // minutes count only after a word about the bet closing; hours and up count anyway
  const rel =
    t.match(/\b(?:closes?|ends?|expires?|locks?|deadline|open|good)\s+(?:in|for)\s+(an?|\d+(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?|h|days?|weeks?)\b/) ??
    t.match(/\bin\s+(an?|\d+(?:\.\d+)?)\s*(hours?|hrs?|h|days?|weeks?)\b/);
  if (rel) {
    const n = /^an?$/.test(rel[1]) ? 1 : parseFloat(rel[1]);
    const unit = rel[2];
    const minutes = unit.startsWith('m') ? n : unit.startsWith('h') ? n * 60 : unit.startsWith('d') ? n * 1440 : n * 10080;
    return clampMinutes(minutes);
  }

  // The day it is about, if named
  let day: Date | undefined;
  const weekday = t.match(/\b(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (/\btomorrow\b/.test(t)) day = addDays(now, 1);
  else if (weekday) {
    let ahead = (WEEKDAYS.indexOf(weekday[2]) - now.getDay() + 7) % 7;
    if (weekday[1] && ahead === 0) ahead = 7;
    day = addDays(now, ahead);
  } else if (/\b(?:tonight|today|end of (?:the )?day|eod)\b/.test(t)) day = now;

  const clock = t.match(/\b(?:at|by|before|until)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/) ?? t.match(/\b(noon|midnight)\b/);
  if (clock) {
    let hours: number;
    let minutes = 0;
    if (clock[1] === 'noon') hours = 12;
    else if (clock[1] === 'midnight') hours = 23, minutes = 59;
    else {
      hours = parseInt(clock[1], 10) % 12 + (clock[3] === 'pm' ? 12 : 0);
      minutes = clock[2] ? parseInt(clock[2], 10) : 0;
    }
    const base = day ?? now;
    target = new Date(base.getFullYear(), base.getMonth(), base.getDate(), hours, minutes);
    if (!day && target <= now) target = addDays(target, 1);
  } else if (day) {
    target = endOfDay(day);
  } else if (/\b(?:this weekend|end of (?:the )?week)\b/.test(t)) {
    target = endOfDay(addDays(now, (7 - now.getDay()) % 7));
  } else if (/\bnext week\b/.test(t)) {
    target = endOfDay(addDays(now, 7));
  } else if (/\bend of (?:the )?month\b/.test(t)) {
    target = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59);
  } else if (!atGame && /\b\d{1,2}:\d{2}\b/.test(t)) {
    // Away from a game, a bare clock time is when it is decided ("Sam makes the 8:15
    // train"): its next 8:15, morning or evening
    const bare = t.match(/\b(\d{1,2}):(\d{2})\b/)!;
    const hours = parseInt(bare[1], 10);
    const minutes = parseInt(bare[2], 10);
    if (hours <= 23 && minutes <= 59) {
      const candidates = (hours === 0 || hours > 12 ? [hours] : [hours % 12, (hours % 12) + 12]).flatMap((h) => [
        new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, minutes),
        new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, h, minutes),
      ]);
      target = candidates.filter((d) => d > now).sort((a, b) => a.getTime() - b.getTime())[0];
    }
  } else if (/\bend of (?:the )?year\b/.test(t)) {
    target = new Date(now.getFullYear(), 11, 31, 23, 59);
  }

  return target ? clampMinutes((target.getTime() - now.getTime()) / 60000) : undefined;
}

function clampMinutes(minutes: number): number | undefined {
  if (!Number.isFinite(minutes) || minutes <= 0) return undefined;
  return Math.min(Math.max(1, Math.ceil(minutes)), LIMITS.deadlineMinutes);
}

// ---------------------------------------------------------------------------
// Friends

interface FriendMatch {
  ids: string[];
  /** Named as the one opponent ("bet Mike", "me vs Mike"), not just mentioned. */
  opponent: boolean;
  /** "Bet Mike ...": the creator backs what follows */
  betTrigger: boolean;
  /** Words were taken out of the question ("bet Mike", "@mikeb") */
  removed: boolean;
  rest: string;
  /** The friends' names as typed, to recognise them as a side. */
  names: Map<string, string>;
}

function takeFriends(text: string, friends: ParserFriend[]): FriendMatch {
  const byName = new Map<string, string | null>(); // lowercased name -> id, null when two friends share it
  const add = (name: string | null | undefined, id: string) => {
    const key = name?.trim().toLowerCase();
    if (!key || key.length < 2) return;
    byName.set(key, byName.has(key) && byName.get(key) !== id ? null : id);
  };
  for (const f of friends) {
    add(f.username, f.id);
    add(f.displayName, f.id);
    const first = f.displayName?.trim().split(/\s+/)[0];
    if (first && first.length >= 3) add(first, f.id);
  }
  const names = [...byName.keys()].filter((k) => byName.get(k)).sort((a, b) => b.length - a.length);
  const empty: FriendMatch = { ids: [], opponent: false, betTrigger: false, removed: false, rest: text, names: new Map() };
  if (names.length === 0) return empty;

  const N = `@?(?:${names.map(escapeRegExp).join('|')})`;
  const list = `${N}(?:\\s*(?:,|&|\\band\\b)\\s*${N})*`;
  const ids: string[] = [];
  const typed = new Map<string, string>();
  let opponent = false;
  let betTrigger = false;
  let removed = false;
  let rest = text;

  const record = (chunk: string) => {
    for (const part of chunk.split(/\s*(?:,|&|\band\b)\s*/i)) {
      const key = part.replace(/^@/, '').toLowerCase();
      const id = byName.get(key);
      if (id && !ids.includes(id)) ids.push(id);
      if (id) typed.set(key, id);
    }
  };

  const direct = new RegExp(`\\b(bet|challenge|invite|against|vs\\.?|versus|with|me and)\\s+(${list})(?![\\w])`, 'gi');
  rest = rest.replace(direct, (whole, trigger: string, chunk: string) => {
    record(chunk);
    const t = trigger.toLowerCase();
    if (t !== 'invite') opponent = true;
    if (t === 'bet' || t === 'challenge') betTrigger = true;
    // "Bet Mike", "with Mike", "invite Mike" say who, not what is bet on
    if (!/^(bet|challenge|invite|with)$/.test(t)) return whole;
    removed = true;
    return ' ';
  });

  const reverse = new RegExp(`(?:^|\\s)(${N})\\s+(?:and (?:i|me)\\b|vs\\.?\\s|versus\\b)`, 'gi');
  for (const m of rest.matchAll(reverse)) {
    record(m[1]);
    opponent = true;
  }

  for (const m of rest.matchAll(/@([\w.-]+)/g)) record(m[1]);
  rest = rest.replace(/@([\w.-]+)/g, (whole, handle: string) => {
    if (!byName.get(handle.toLowerCase())) return whole;
    removed = true;
    return ' ';
  });

  return { ids, opponent, betTrigger, removed, rest, names: typed };
}

// ---------------------------------------------------------------------------
// The creator's pick ("I'll take the over", "my money's on the Bills")

const PICK = /[,;]?\s*\b(?:i'?ll take|i'?m taking|i take|i'?ve got|i got|i'?m on|i pick|i choose|i'?m going with|i say|my money(?:'s| is) on)\s+(?:the\s+)?([^,.;!?]+)/i;

function takePick(text: string): { pick?: string; rest: string } {
  const m = text.match(PICK);
  if (!m) return { rest: text };
  return { pick: squash(m[1]).toLowerCase(), rest: text.replace(m[0], ' ') };
}

// ---------------------------------------------------------------------------
// Sides and options

/** Time words at the end of a side name: "the Bills tonight" is the side "Bills". */
const TIME_TAIL =
  /\s+(?:tonight|today|tomorrow(?: night)?|this (?:weekend|week|season|year)|next week|(?:on|by|this|next) \w+day|\w+day(?: night)?|in (?:an?|\d+)\b.*|at \d.*|by \d.*|by a lot|straight up|again|outright)$/i;

function cleanSide(s: string): string {
  let side = trimEdges(s).replace(/\?+$/, '');
  for (let i = 0; i < 3; i++) side = side.replace(TIME_TAIL, '');
  side = side.replace(/^the\s+/i, '');
  return capitalize(trimEdges(side));
}

const okOption = (s: string) => s.length > 0 && s.length <= 40 && wordCount(s) <= 5;

function findPool(text: string): { lead: string; items: string[] } | null {
  let lead = '';
  let seg = text;
  // "Who wins: A, B or C", "Who wins? A, B or C", "Best picture - A, B, C", "between A, B and C"
  const split = text.match(/^(.*?)(:|\?|\s[-–—]\s|\bbetween\b)\s*(.+)$/i);
  if (split) {
    lead = split[2] === '?' ? `${split[1]}?` : split[1];
    seg = split[3];
  }

  let items = seg.split(/\s+(?:vs\.?|versus)\s+/i);
  if (items.length < MIN_POOL_OPTIONS) {
    if (!seg.includes(',')) return null;
    items = seg.split(/\s*,\s*(?:(?:or|and)\s+)?|\s+(?:or|and)\s+/i);
  }
  items = items.map((s) => trimEdges(s).replace(/\?+$/, '')).filter(Boolean);
  if (!lead && items.length > 0 && OPEN_QUESTION.test(items[0])) lead = items.shift()!;
  items = items.map(cleanSide);
  if (items.length < MIN_POOL_OPTIONS || items.length > MAX_OPTIONS || !items.every(okOption)) return null;
  return { lead: trimEdges(lead), items };
}

function findTwoSides(text: string): [string, string] | null {
  const vs = text.split(/\s+(?:vs\.?|versus|v\.)\s+/i);
  if (vs.length === 2) {
    const left = vs[0].split(/[,:;]/).pop()!.replace(/^(?:who wins|who will win|which)\b\s*(?:between)?/i, '');
    const right = vs[1].split(/[,?!.;]/)[0];
    const a = cleanSide(left);
    const b = cleanSide(right);
    if (a && b) return [a, b];
  }

  const beats = text.match(
    /^(.+?)\s+(?:will\s+|gonna\s+|(?:is|are)\s+going\s+to\s+)?(?:beats?|defeats?|wins?\s+(?:against|over)|tops?|takes?\s+down|crush(?:es)?|destroys?)\s+(.+)$/i,
  );
  if (beats) {
    const a = cleanSide(beats[1]);
    const b = cleanSide(beats[2]);
    if (a && b && okOption(a) && okOption(b)) return [a, b];
  }

  const or =
    text.match(/^(?:who|which(?:\s+\w+)?)\s+(?:wins|will win|is going to win|gets it|takes it|scores (?:next|first))?[\s,:]*(.+?)\s+or\s+(.+?)\??$/i) ??
    text.match(/^([^,]+?)\s+or\s+([^,]+?)\??$/i);
  // "win by 10 or more", "rain or not": not two sides
  if (or && !/^(?:not|more|less|fewer|better|worse|else|never|so)\b/i.test(or[2].trim()) && !QUESTION_START.test(or[1].trim())) {
    const a = cleanSide(or[1]);
    const b = cleanSide(or[2]);
    if (a && b && okOption(a) && okOption(b) && wordCount(a) <= 4 && wordCount(b) <= 4) return [a, b];
  }
  return null;
}

// ---------------------------------------------------------------------------
// The checked-in game

function teamNames(event: GameForSuggestions, home: boolean): string[] {
  const { away: awayLabel, home: homeLabel } = gameTeams(event);
  const names = home
    ? [event.homeTeam, event.homeTeamShortName, event.homeTeamCode, homeLabel]
    : [event.awayTeam, event.awayTeamShortName, event.awayTeamCode, awayLabel];
  return names.filter((n): n is string => !!n && n.trim().length >= 2).map((n) => n.toLowerCase());
}

/** Where the team is first mentioned, or -1. */
function teamMention(text: string, event: GameForSuggestions, home: boolean): number {
  let first = -1;
  for (const name of teamNames(event, home)) {
    const m = text.match(new RegExp(`\\b${escapeRegExp(name)}\\b`, 'i'));
    if (m && m.index !== undefined && (first < 0 || m.index < first)) first = m.index;
  }
  return first;
}

/** The team as the form names it ("Bills"), if this side is one of the game's teams. */
function asTeam(side: string, event: GameForSuggestions): string | undefined {
  const s = side.toLowerCase();
  const labels = gameTeams(event);
  for (const home of [true, false]) {
    for (const name of teamNames(event, home)) {
      if (s === name || (s.length >= 3 && (name.includes(s) || s.includes(name)))) return home ? labels.home : labels.away;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Category

const CATEGORY_RULES: Array<[BetCategory, RegExp]> = [
  ['STOCKS', /\b(?:stocks?|shares?|nasdaq|s&p|dow jones|the dow|bitcoin|btc|ethereum|crypto|market cap|earnings|ipo|ticker)\b|\$[A-Z]{1,5}\b/i],
  ['WEATHER', /\b(?:rains?|raining|rainy|snows?|snowing|snowy|sunny|weather|temperature|degrees|forecast|storms?|thunder|hail|humid|tornado|hurricane|fog|inches of)\b/i],
  ['ENTERTAINMENT', /\b(?:oscars?|emmys?|grammys?|golden globes?|movies?|films?|box office|tv|shows?|episodes?|finale|bachelor(?:ette)?|survivor|big brother|idol|albums?|songs?|billboard|netflix|concert|tour|awards?|celebrit(?:y|ies)|reality)\b/i],
  ['SPORTS', /\b(?:games?|match(?:es)?|scores?|points?|goals?|touchdowns?|tds?|nfl|nba|mlb|nhl|mls|wnba|ncaa|super bowl|world series|stanley cup|playoffs?|quarter|halftime|innings?|overtime|team|coach|mvp|golf|tennis|hockey|baseball|basketball|football|soccer|race|ufc|boxing|fight|player|yards|rebounds|assists|home runs?|strikeouts?|league|championship|season)\b/i],
];

/** A stock ticker in capitals next to a trading word ("AAPL close above 250"). */
const TICKER = /\b[A-Z]{2,5}\b(?=.*\b(?:close|closes|closing|open|opens|trade|trades|trading|hits?|above|below)\b)/;

function readCategory(text: string): BetCategory | undefined {
  for (const [category, re] of CATEGORY_RULES) if (re.test(text)) return category;
  if (TICKER.test(text) && /\b(?:close|closes|closing|open|opens|trades?|trading)\b/i.test(text)) return 'STOCKS';
  return undefined;
}

// ---------------------------------------------------------------------------
// Bet type signals

const NEXT_SCORE = /\bnext\s+(?:score|basket|bucket|goal|touchdown|td|point|points|run|field goal|fg)\b|\bscores?\s+(?:next|first)\b|\b(?:first|next)\s+to\s+score\b/i;
const OVER_UNDER = /\bover\s*\/\s*under\b|\bover[\s-]+under\b|\bo\/u\b|\bover or under\b|\b(?:over|under)\s+\d+(?:\.\d+)?\b/i;
const ME = /^(?:me|i|myself)$/i;
/** Bets where naming one team means backing it against the other */
const TEAM_OUTCOME = /\bwins?\b|\bwinning\b|\bbeats?\b|\btakes? it\b/i;
/** In-game moments the app cannot close on: read as a short close, and shown as a guess */
const GAME_MOMENT = /\bnext\s+(?:score|basket|bucket|goal|touchdown|td|point|run)\b|\bscores?\s+(?:next|first)\b|\bfirst\s+to\s+score\b|\bthis\s+(?:drive|possession|inning|quarter|period)\b/i;
const GAME_MOMENT_MINUTES = 15;

// ---------------------------------------------------------------------------

export function parseBetText(input: string, context: ParseContext = {}): ParsedBet {
  const now = context.now ?? new Date();
  const result: ParsedBet = {};
  const guesses = new Set<'options' | 'deadline'>();
  const original = squash(input);
  if (!original) return result;
  // Words that went into another field, so the question can lose them
  let removed = false;

  // 1. Pull out the parts that are not what the bet is about
  const amount = takeAmount(original);
  if (amount.amount !== undefined && isValidStake(amount.amount)) {
    result.stake = amount.amount;
    removed = true;
  }

  const deadline = readDeadline(original, now, !!context.event);
  if (deadline !== undefined) result.deadlineMinutes = deadline;
  else if (context.event && GAME_MOMENT.test(original)) {
    // Bets close on durations, not game moments: "next score" gets a short one
    result.deadlineMinutes = GAME_MOMENT_MINUTES;
    guesses.add('deadline');
  }

  const friends = takeFriends(amount.rest, context.friends ?? []);
  if (friends.removed) removed = true;

  const pick = takePick(friends.rest);
  if (pick.pick) removed = true;

  // "I bet ...", "$20 says ...", "bet you ...": the creator backs what follows
  let text = squash(pick.rest);
  let assertive = friends.betTrigger;
  const lead = text.match(/^(?:i\s+)?(?:bet(?:\s+you)?|says?)\b(?:\s+that)?\s*|^i\s+think\s+(?:that\s+)?/i);
  if (lead) {
    assertive = true;
    text = text.slice(lead[0].length);
  }
  text = trimEdges(text);

  // 2. The sides, or a pool's options
  const pool = findPool(text);
  const two = pool ? null : findTwoSides(text);
  const event = context.event;
  let options: string[] | undefined;
  if (pool) {
    options = pool.items;
    removed = true;
  } else if (OVER_UNDER.test(text)) {
    options = ['Over', 'Under'];
  } else if (two) {
    options = two;
  } else if (QUESTION_START.test(text) || assertive) {
    // "Will it rain?", "I bet it rains". An open question ("Who wins?") is not yes/no.
    options = ['Yes', 'No'];
  } else if ((result.stake !== undefined || friends.opponent) && wordCount(text) >= 2) {
    // "$5 Lamar throws 2 TDs": money on a statement is probably yes or no, but which
    // side is not said
    options = ['Yes', 'No'];
    guesses.add('options');
  }
  // "Steelers score next": yes or no. Two teams would leave no winner if nobody scores
  // again, where "No" covers the other team scoring and nobody scoring. An open question
  // ("Who scores next?") is not yes / no: at a game it gets the two teams below.
  let scoresNext = false;
  if (!pool && !two && NEXT_SCORE.test(text) && !OPEN_QUESTION.test(text) && (!options || options[0] === 'Yes')) {
    options = ['Yes', 'No'];
    scoresNext = true;
    guesses.delete('options');
  }
  /** The index of the one team the text names, if it backs it */
  let namedTeam: number | null = null;

  // The checked-in game's teams, named as the form names them
  if (event && !pool) {
    const home = teamMention(text, event, true);
    const away = teamMention(text, event, false);
    if (options?.length === 2 && two) {
      const a = asTeam(two[0], event);
      const b = asTeam(two[1], event);
      if (a && b && a !== b) options = [a, b];
    } else if (
      !scoresNext &&
      (!options || options[0] === 'Yes') &&
      (home >= 0) !== (away >= 0) &&
      TEAM_OUTCOME.test(text)
    ) {
      // "Ravens win tonight": the named team against the other,
      // in the game's order (away first) so the sides stay the game's own
      const { away: awayLabel, home: homeLabel } = gameTeams(event);
      options = [awayLabel, homeLabel];
      namedTeam = home >= 0 ? 1 : 0;
      guesses.delete('options');
    } else if (!options && ((home >= 0 && away >= 0) || NEXT_SCORE.test(text))) {
      const { away: awayLabel, home: homeLabel } = gameTeams(event);
      options = home >= 0 && away >= 0 && home < away ? [homeLabel, awayLabel] : [awayLabel, homeLabel];
    }
    if (home >= 0 || away >= 0) result.category = 'SPORTS';
  }

  // 3. A 1 v 1 when one friend is named as the opponent; otherwise friends are invited
  const challenge = friends.opponent && friends.ids.length === 1 && !pool;
  if (challenge) {
    result.format = 'challenge';
    result.opponentId = friends.ids[0];
    if (options && two) {
      // "Me vs Mike at golf": the sides are the two people
      const friend = context.friends?.find((f) => f.id === friends.ids[0]);
      const theirName = capitalize(friend?.displayName?.trim().split(/\s+/)[0] || friend?.username || 'They');
      const isFriend = (s: string) => {
        const first = s.toLowerCase().split(/\s+/)[0].replace(/^@/, '');
        return friends.names.has(first) || friends.names.has(s.toLowerCase());
      };
      if (ME.test(two[0]) && isFriend(two[1])) options = ['I win', `${theirName} wins`];
      else if (isFriend(two[0]) && ME.test(two[1])) options = [`${theirName} wins`, 'I win'];
    }
  } else if (friends.ids.length > 0) {
    result.friendIds = friends.ids;
  }
  if (options) {
    result.options = options.map((o) => o.slice(0, LIMITS.sideName));
    if (!result.format) result.format = pool ? 'pool' : 'sides';
  }

  // 4. Which side the creator is on
  if (options) {
    let mine = -1;
    if (pick.pick) {
      const p = pick.pick.replace(/^the\s+/, '');
      mine = options.findIndex((n) => {
        const name = n.toLowerCase();
        return name === p || (p.length >= 3 && (name.includes(p) || p.includes(name)));
      });
    } else if (namedTeam !== null && !QUESTION_START.test(text)) {
      mine = namedTeam;
    } else if (scoresNext && !QUESTION_START.test(text)) {
      // "Steelers score next" says yes; "Will the Steelers score next?" asks
      mine = 0;
    } else if (options.includes('I win')) {
      mine = options.indexOf('I win');
    } else if (assertive && options[0] === 'Over') {
      // "$20 says under 45.5"
      mine = /^under\b/i.test(text) ? 1 : 0;
    } else if (assertive && !pool && !guesses.has('options')) {
      mine = 0;
    }
    if (mine >= 0) result.pickedIndex = mine;
  }

  // 5. Category, from the words used
  result.category = result.category ?? readCategory(original);
  if (!result.category) delete result.category;

  // 6. The question without what went elsewhere; untouched when nothing did
  if (removed) {
    let title = pool && pool.lead ? pool.lead : text;
    title = trimEdges(title);
    if (pool && pool.lead && OPEN_QUESTION.test(title)) title = title.replace(/\?*$/, '?');
    title = capitalize(title);
    if (title.length > LIMITS.title) title = title.slice(0, LIMITS.title).replace(/\s+\S*$/, '');
    if (title.length >= 2 && title !== original) result.cleanTitle = title;
  }

  if (guesses.size > 0) result.guesses = [...guesses];
  return result;
}
