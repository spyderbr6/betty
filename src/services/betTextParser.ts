/**
 * Reads a bet typed in plain words ("$20 says the Chiefs beat the Bills tonight") and
 * works out as much of the create-bet form as it can: bet type, category, sides or pool
 * options, amount, deadline, friends to invite and which side the creator is backing.
 *
 * It returns only what the text actually said. Every field it leaves out stays at the
 * form's default, and `found` lists what it did set, so the screen can show what was
 * understood. Nothing here is trusted: the creator reviews the form, and the server's
 * createBetWithStake checks it again (amplify/shared/createBetLogic.ts).
 *
 * Rules, not a model: instant, offline, the same answer every time. Pure, so it is unit
 * tested (__tests__/betTextParser.test.ts holds the phrasings it is meant to handle).
 */

import { MAX_OPTIONS, MIN_POOL_OPTIONS, type OptionKey } from '../../amplify/shared/betOptions';
import { LIMITS } from '../../amplify/shared/createBetLogic';

export type BetTemplateId =
  | 'next-score'
  | 'player-prop'
  | 'over-under'
  | 'yes-no'
  | 'head-to-head'
  | 'pool'
  | 'custom';

export type BetCategory = 'SPORTS' | 'ENTERTAINMENT' | 'WEATHER' | 'STOCKS' | 'CUSTOM';

export interface ParserFriend {
  id: string;
  username: string;
  displayName?: string | null;
}

export interface ParserEvent {
  homeTeam: string;
  awayTeam: string;
  homeTeamShortName?: string;
  awayTeamShortName?: string;
  homeTeamCode?: string;
  awayTeamCode?: string;
}

export interface ParseContext {
  friends?: ParserFriend[];
  /** The game the creator is checked in to, if any. */
  event?: ParserEvent | null;
  /** For deadlines like "tonight"; defaults to the current time. */
  now?: Date;
}

export type ParsedField =
  | 'template'
  | 'category'
  | 'title'
  | 'sides'
  | 'options'
  | 'amount'
  | 'deadline'
  | 'friends'
  | 'side'
  | 'event';

export interface ParsedBet {
  template?: BetTemplateId;
  category?: BetCategory;
  title?: string;
  /** The text as typed, so the bet always has a description. */
  description?: string;
  sideAName?: string;
  sideBName?: string;
  /** A pool's three to six options, in order. */
  options?: string[];
  amount?: number;
  deadlineMinutes?: number;
  friendIds?: string[];
  /** The option the creator is backing. */
  mySide?: OptionKey;
  /** The sides are the checked-in game's two teams. */
  usesEvent?: boolean;
  /**
   * What the text set. A field missing here was not understood: keep the form's
   * default. `template` is set even when only guessed (a plain statement reads as a
   * yes/no bet), but is listed here only when a rule matched.
   */
  found: ParsedField[];
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

function readDeadline(text: string, now: Date): number | undefined {
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
  const empty: FriendMatch = { ids: [], opponent: false, rest: text, names: new Map() };
  if (names.length === 0) return empty;

  const N = `@?(?:${names.map(escapeRegExp).join('|')})`;
  const list = `${N}(?:\\s*(?:,|&|\\band\\b)\\s*${N})*`;
  const ids: string[] = [];
  const typed = new Map<string, string>();
  let opponent = false;
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
    if (t !== 'with' && t !== 'invite') opponent = true;
    // "Bet Mike ..." and "invite Mike" are instructions, not part of what is bet on
    return /^(bet|challenge|invite)$/.test(t) ? ' ' : whole;
  });

  const reverse = new RegExp(`(?:^|\\s)(${N})\\s+(?:and (?:i|me)\\b|vs\\.?\\s|versus\\b)`, 'gi');
  for (const m of rest.matchAll(reverse)) {
    record(m[1]);
    opponent = true;
  }

  for (const m of rest.matchAll(/@([\w.-]+)/g)) record(m[1]);
  rest = rest.replace(/@([\w.-]+)/g, (whole, handle: string) => (byName.get(handle.toLowerCase()) ? ' ' : whole));

  return { ids, opponent, rest, names: typed };
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
  const split = text.match(/^(.*?)(?::|\s[-–—]\s|\bbetween\b)\s*(.+)$/i);
  if (split) {
    lead = split[1];
    seg = split[2];
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

function teamNames(event: ParserEvent, home: boolean): string[] {
  const names = home
    ? [event.homeTeam, event.homeTeamShortName, event.homeTeamCode]
    : [event.awayTeam, event.awayTeamShortName, event.awayTeamCode];
  return names.filter((n): n is string => !!n && n.trim().length >= 2).map((n) => n.toLowerCase());
}

/** Where the team is first mentioned, or -1. */
function teamMention(text: string, event: ParserEvent, home: boolean): number {
  let first = -1;
  for (const name of teamNames(event, home)) {
    const m = text.match(new RegExp(`\\b${escapeRegExp(name)}\\b`, 'i'));
    if (m && m.index !== undefined && (first < 0 || m.index < first)) first = m.index;
  }
  return first;
}

/** The team's full name if this side is one of the game's teams. */
function asTeam(side: string, event: ParserEvent): string | undefined {
  const s = side.toLowerCase();
  for (const home of [true, false]) {
    const full = home ? event.homeTeam : event.awayTeam;
    for (const name of teamNames(event, home)) {
      if (s === name || (s.length >= 3 && (name.includes(s) || s.includes(name)))) return full;
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

const NEXT_SCORE = /\bnext\s+(?:score|basket|bucket|goal|touchdown|td|point|points|run|field goal|fg)\b|\bscores?\s+(?:next|first)\b|\bfirst\s+to\s+score\b/i;
const OVER_UNDER = /\bover\s*\/\s*under\b|\bover[\s-]+under\b|\bo\/u\b|\bover or under\b|\b(?:over|under)\s+\d+(?:\.\d+)?\b/i;
const PROP_NUMBER = /\b\d+(?:\.\d+)?\s*\+|\bat least\s+\d+|\b\d+\s+or more\b/i;
const PROP_STAT =
  /\b(?:points?|pts|tds?|touchdowns?|yards?|yds|goals?|assists?|rebounds?|boards|hits?|home runs?|hrs|homers?|strikeouts?|ks|sacks?|threes|3s|3-pointers|receptions?|catches|interceptions?|ints|saves|aces|birdies)\b/i;
const ME = /^(?:me|i|myself)$/i;

// ---------------------------------------------------------------------------

export function parseBetText(input: string, context: ParseContext = {}): ParsedBet {
  const now = context.now ?? new Date();
  const found = new Set<ParsedField>();
  const result: ParsedBet = { found: [] };
  const original = squash(input);
  if (!original) return result;

  result.description = original.slice(0, LIMITS.description);

  // 1. Pull out the parts that are not what the bet is about
  const amount = takeAmount(original);
  if (amount.amount !== undefined) {
    result.amount = amount.amount;
    found.add('amount');
  }

  const deadline = readDeadline(original, now);
  if (deadline !== undefined) {
    result.deadlineMinutes = deadline;
    found.add('deadline');
  }

  const friends = takeFriends(amount.rest, context.friends ?? []);
  if (friends.ids.length > 0) {
    result.friendIds = friends.ids;
    found.add('friends');
  }

  const pick = takePick(friends.rest);
  // "I bet ...", "$20 says ...", "bet you ...": the creator backs what follows
  let text = squash(pick.rest);
  let assertive = false;
  const lead = text.match(/^(?:i\s+)?(?:bet(?:\s+you)?|says?)\b(?:\s+that)?\s*|^i\s+think\s+(?:that\s+)?/i);
  if (lead) {
    assertive = true;
    text = text.slice(lead[0].length);
  }
  text = trimEdges(text);

  // 2. What kind of bet it is
  let template: BetTemplateId | undefined;
  let sides: [string, string] | undefined;

  const pool = findPool(text);
  const two = pool ? null : findTwoSides(text);

  if (NEXT_SCORE.test(text)) template = 'next-score';
  else if (OVER_UNDER.test(text)) template = 'over-under';
  else if (pool) template = 'pool';
  else if (PROP_NUMBER.test(text) && PROP_STAT.test(text) && !two) template = 'player-prop';
  else if (two) template = 'custom';
  else if (QUESTION_START.test(text) || assertive || /\?$/.test(text)) template = 'yes-no';
  if (template) found.add('template');

  if (pool) {
    result.options = pool.items;
    found.add('options');
  } else if (template === 'over-under') {
    sides = ['Over', 'Under'];
  } else if (two) {
    sides = two;
  }

  // The checked-in game's teams, when the text names them
  const event = context.event;
  if (event && !pool) {
    if (sides) {
      const a = asTeam(sides[0], event);
      const b = asTeam(sides[1], event);
      if (a && b && a !== b) {
        sides = [a, b];
        result.usesEvent = true;
      }
    } else if (template !== 'yes-no' && template !== 'player-prop' && template !== 'over-under') {
      const home = teamMention(text, event, true);
      const away = teamMention(text, event, false);
      if ((home >= 0 && away >= 0) || template === 'next-score') {
        sides = home >= 0 && away >= 0 && away < home ? [event.awayTeam, event.homeTeam] : [event.homeTeam, event.awayTeam];
        result.usesEvent = true;
      }
    }
    if (!result.usesEvent && (teamMention(text, event, true) >= 0 || teamMention(text, event, false) >= 0)) {
      result.category = 'SPORTS';
    }
    if (result.usesEvent) found.add('event');
  }

  // Two named sides that are a game's teams read as sports; "who wins" alone does not
  if (two && template === 'custom' && result.usesEvent) result.category = 'SPORTS';

  // One friend named as the opponent: head-to-head, keeping the sides already read
  if (friends.opponent && friends.ids.length === 1 && template !== 'pool') {
    if (template === 'yes-no' || !template) sides = ['Yes', 'No'];
    if (sides) {
      // "Me vs Mike at golf": the sides are the two people
      const friend = context.friends?.find((f) => f.id === friends.ids[0]);
      const theirName = capitalize(friend?.displayName?.trim().split(/\s+/)[0] || friend?.username || 'They');
      const isFriend = (s: string) => {
        const first = s.toLowerCase().split(/\s+/)[0].replace(/^@/, '');
        return friends.names.has(first) || friends.names.has(s.toLowerCase());
      };
      if (ME.test(sides[0]) && isFriend(sides[1])) sides = ['I win', `${theirName} wins`];
      else if (isFriend(sides[0]) && ME.test(sides[1])) sides = [`${theirName} wins`, 'I win'];
    }
    template = 'head-to-head';
    found.add('template');
  }

  if (sides) {
    result.sideAName = sides[0].slice(0, LIMITS.sideName);
    result.sideBName = sides[1].slice(0, LIMITS.sideName);
    if (template !== 'yes-no' && template !== 'over-under') found.add('sides');
  }

  // A plain statement with nothing else to go on is a yes/no bet; not listed as found
  result.template = template ?? (wordCount(text) >= 2 ? 'yes-no' : undefined);
  if (result.template === 'yes-no' && !sides) {
    result.sideAName = 'Yes';
    result.sideBName = 'No';
  }

  // 3. Which side the creator is on
  const optionNames = result.options ?? (result.sideAName ? [result.sideAName, result.sideBName ?? ''] : []);
  const keys: OptionKey[] = ['A', 'B', 'C', 'D', 'E', 'F'];
  let mine: number | undefined;
  if (pick.pick) {
    const p = pick.pick.replace(/^the\s+/, '');
    const yesNo: Record<string, number> = { yes: 0, no: 1, over: 0, under: 1 };
    mine = optionNames.findIndex((n) => {
      const name = n.toLowerCase();
      return name === p || (p.length >= 3 && (name.includes(p) || p.includes(name)));
    });
    if (mine < 0 && result.sideAName === 'Yes' && p in yesNo) mine = yesNo[p];
    if (mine < 0 && result.sideAName === 'Over' && p in yesNo) mine = yesNo[p];
    if (mine < 0) mine = undefined;
  } else if (optionNames.length === 2) {
    if (optionNames[0] === 'I win') mine = 0;
    else if (optionNames[1] === 'I win') mine = 1;
    else if (assertive && (result.template === 'yes-no' || result.template === 'head-to-head' || two)) mine = 0;
  }
  if (mine !== undefined) {
    result.mySide = keys[mine];
    found.add('side');
  }

  // 4. Title: what is bet on, without the amount, the friend or the pick
  let title = text;
  if (pool && pool.lead) title = pool.lead;
  title = trimEdges(title);
  if (QUESTION_START.test(title) || OPEN_QUESTION.test(title)) title = title.replace(/\?*$/, '?');
  title = capitalize(title);
  if (title.length > LIMITS.title) title = title.slice(0, LIMITS.title).replace(/\s+\S*$/, '');
  if (title.length >= 2) {
    result.title = title;
    found.add('title');
  }

  // 5. Category, from the words used
  const category = result.category ?? readCategory(original);
  if (category) {
    result.category = category;
    found.add('category');
  }

  result.found = [...found];
  return result;
}
