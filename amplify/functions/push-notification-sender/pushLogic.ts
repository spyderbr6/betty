/**
 * Pure decision logic for push delivery, kept separate from the handler.
 *
 * The handler cannot be imported by a test: it configures Amplify with a
 * top-level await, imports `$amplify/env/...` (a module that only exists after
 * a build), and calls webpush.setVapidDetails() at module scope. Everything in
 * here is a plain function over plain data, so it can be tested directly and
 * the handler keeps only the I/O.
 */

export type Platform = 'IOS' | 'ANDROID' | 'WEB' | string;

/** Anything carrying a push token: a PushDevice row, or a resolved PushTarget. */
export interface TokenRecord {
  id?: string | null;
  token?: string | null;
  platform?: Platform | null;
}

export type Priority = 'HIGH' | 'MEDIUM' | 'LOW' | string;

export interface ExpoMessage {
  to: string;
  sound: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  priority: 'high' | 'normal';
  /** Android: the notification channel, which decides how it is presented. */
  channelId: string;
  /** iOS: the app icon badge. Absent leaves the badge as it is. */
  badge?: number;
  /** iOS: 'time-sensitive' breaks through Focus modes. Absent means the default, 'active'. */
  interruptionLevel?: 'time-sensitive';
}

/** How a message is presented, beyond its text. See dispatchLogic.pushPresentation. */
export interface ExpoPresentation {
  channelId?: string;
  badge?: number;
  timeSensitive?: boolean;
}

/** Expo's per-message result. `data` is positionally aligned with the request. */
export interface ExpoTicket {
  status?: string;
  details?: { error?: string } | null;
}

/**
 * Build the Expo push payloads. HIGH priority is delivered as high priority (it may wake
 * a dozing Android device); how it looks is the channel's business, not the priority's.
 */
export function buildExpoMessages(
  tokens: TokenRecord[],
  title: string,
  message: string,
  data: unknown,
  priority: Priority,
  presentation: ExpoPresentation = {}
): ExpoMessage[] {
  return tokens.map((t) => {
    const msg: ExpoMessage = {
      to: t.token!,
      sound: 'default',
      title,
      body: message,
      data: (data as Record<string, unknown>) || {},
      priority: priority === 'HIGH' ? 'high' : 'normal',
      channelId: presentation.channelId ?? 'default',
    };
    if (presentation.badge !== undefined) msg.badge = presentation.badge;
    if (presentation.timeSensitive) msg.interruptionLevel = 'time-sensitive';
    return msg;
  });
}

/**
 * Ids of tokens Expo reported as DeviceNotRegistered.
 *
 * Correlation is positional: Expo returns one ticket per message, in request
 * order, so ticket i belongs to tokens[i]. The previous implementation filtered
 * the tickets first and then used the *filtered* index against the unfiltered
 * token array, which deactivated healthy tokens and left dead ones active —
 * with tokens [A,B,C] and tickets [ok, error, ok] it disabled A instead of B.
 */
export function tokensToDeactivate(
  tokens: TokenRecord[],
  tickets: ExpoTicket[] | null | undefined
): string[] {
  return (tickets ?? []).reduce<string[]>((ids, ticket, i) => {
    const dead =
      ticket?.status === 'error' && (ticket.details?.error ?? '').includes('DeviceNotRegistered');
    const id = tokens[i]?.id;
    if (dead && id) ids.push(id);
    return ids;
  }, []);
}

/**
 * Ids of tokens Expo accepted, for stamping lastUsed.
 *
 * Same positional rule as tokensToDeactivate, and the same bug existed here:
 * the success tickets were filtered and the filtered index used against the
 * unfiltered token array, so lastUsed landed on whichever tokens happened to
 * sit at those offsets.
 */
export function succeededTokenIds(
  tokens: TokenRecord[],
  tickets: ExpoTicket[] | null | undefined
): string[] {
  return (tickets ?? []).reduce<string[]>((ids, ticket, i) => {
    const id = tokens[i]?.id;
    if (ticket?.status === 'ok' && id) ids.push(id);
    return ids;
  }, []);
}

/** Count of tickets Expo accepted. */
export function countSuccesses(tickets: ExpoTicket[] | null | undefined): number {
  return (tickets ?? []).filter((t) => t?.status === 'ok').length;
}

/** A PushDevice row, as the sender reads it. */
export interface PushDeviceRecord {
  id?: string | null;
  token?: string | null;
  platform?: Platform | null;
  isActive?: boolean | null;
  pushEnabled?: boolean | null;
}

/** One device to send a push to. */
export interface PushTarget {
  id: string;
  token: string;
  platform: Platform;
}

/**
 * Where to send a user's pushes: their active devices with push switched on, each token
 * once (a token can briefly sit on two rows while a device changes hands).
 */
export function resolvePushTargets(devices: PushDeviceRecord[] | null | undefined): PushTarget[] {
  const targets: PushTarget[] = [];
  const seen = new Set<string>();
  for (const d of devices ?? []) {
    if (!d.id || !d.token || !d.platform || !d.isActive || d.pushEnabled === false) continue;
    if (seen.has(d.token)) continue;
    seen.add(d.token);
    targets.push({ id: d.id, token: d.token, platform: d.platform });
  }
  return targets;
}
