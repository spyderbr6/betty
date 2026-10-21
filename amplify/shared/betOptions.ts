/**
 * The options of a bet: what a participant can back and the creator can name the winner.
 *
 * A bet began with exactly two sides, 'A' and 'B', named in the bet's `odds` JSON
 * (sideAName, sideBName). A pool has three to six, named in `odds.options`; its first two
 * are also written as sideAName and sideBName. Options are keyed 'A' to 'F' in order, so a
 * two-sided bet is simply one with two options and every stored side stays valid.
 *
 * Pure, and shared by the server and the app so they cannot disagree about a bet's options.
 */

export const OPTION_KEYS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
export type OptionKey = (typeof OPTION_KEYS)[number];

export const MIN_POOL_OPTIONS = 3;
export const MAX_OPTIONS = OPTION_KEYS.length;

/** A head-to-head bet: the creator and one opponent, on opposite sides. */
export const HEAD_TO_HEAD_PARTICIPANTS = 2;

export interface BetOddsShape {
  sideAName?: string | null;
  sideBName?: string | null;
  options?: unknown;
}

export interface BetOption {
  key: OptionKey;
  name: string;
}

/**
 * The bet's `odds` as read from the API: an object, or JSON text (AWSJSON, sometimes
 * encoded twice). Anything unreadable is an empty object, which reads as two sides.
 */
export function parseOdds(value: unknown): BetOddsShape {
  let odds = value;
  for (let i = 0; i < 3 && typeof odds === 'string'; i++) {
    try {
      odds = JSON.parse(odds);
    } catch {
      return {};
    }
  }
  return odds && typeof odds === 'object' && !Array.isArray(odds) ? (odds as BetOddsShape) : {};
}

/** The bet's options in order. Anything that is not a well-formed pool reads as two sides. */
export function betOptions(odds: BetOddsShape | null | undefined): BetOption[] {
  const names = odds?.options;
  if (
    Array.isArray(names) &&
    names.length >= MIN_POOL_OPTIONS &&
    names.length <= MAX_OPTIONS &&
    names.every((name) => typeof name === 'string' && name.trim().length > 0)
  ) {
    return (names as string[]).map((name, index) => ({ key: OPTION_KEYS[index], name }));
  }
  return [
    { key: 'A', name: odds?.sideAName || 'Side A' },
    { key: 'B', name: odds?.sideBName || 'Side B' },
  ];
}

export function isPool(odds: BetOddsShape | null | undefined): boolean {
  return betOptions(odds).length > 2;
}

/** Whether `side` is one of this bet's options. */
export function isBetOption(odds: BetOddsShape | null | undefined, side: unknown): side is OptionKey {
  return betOptions(odds).some((option) => option.key === side);
}

/** The option's display name; an unknown side reads as "Side X". */
export function optionName(odds: BetOddsShape | null | undefined, side: string | null | undefined): string {
  return betOptions(odds).find((option) => option.key === side)?.name ?? `Side ${side ?? ''}`.trim();
}

/** Every option's name by key, for the history notes. */
export function optionNames(odds: BetOddsShape | null | undefined): Record<string, string> {
  return Object.fromEntries(betOptions(odds).map((option) => [option.key, option.name]));
}

/** The Bet attribute counting an option's participants: sideACount ... sideFCount. */
export const countField = (key: OptionKey): `side${OptionKey}Count` => `side${key}Count`;

/** How many participants back an option, from the bet's denormalized counts. */
export function optionCount(bet: OptionCounts, key: OptionKey): number {
  return bet[countField(key)] || 0;
}

type OptionCounts = Partial<Record<`side${OptionKey}Count`, number | null>>;

/** Everyone on the bet, from its denormalized counts. */
export function participantCount(bet: OptionCounts & { odds?: BetOddsShape | null }): number {
  return betOptions(bet.odds).reduce((sum, option) => sum + optionCount(bet, option.key), 0);
}

/** The bet's counts as stored, for copying a raw row into the app's Bet. */
export function optionCounts(bet: OptionCounts): Record<`side${OptionKey}Count`, number> {
  return Object.fromEntries(OPTION_KEYS.map((key) => [countField(key), bet[countField(key)] || 0])) as Record<
    `side${OptionKey}Count`,
    number
  >;
}

export function isHeadToHead(bet: { maxParticipants?: number | null } | null | undefined): boolean {
  return bet?.maxParticipants === HEAD_TO_HEAD_PARTICIPANTS;
}
