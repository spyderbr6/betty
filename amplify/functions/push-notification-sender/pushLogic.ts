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

export interface PushTokenRecord {
  id?: string | null;
  token?: string | null;
  platform?: Platform | null;
  isActive?: boolean | null;
}

export type Priority = 'HIGH' | 'MEDIUM' | 'LOW' | string;

export interface ExpoMessage {
  to: string;
  sound: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  badge: number;
  priority: 'high' | 'normal';
  channelId: 'urgent' | 'default';
}

/** Expo's per-message result. `data` is positionally aligned with the request. */
export interface ExpoTicket {
  status?: string;
  details?: { error?: string } | null;
}

/** Active tokens only, split by transport. Anything not IOS/ANDROID/WEB is dropped. */
export function partitionTokens(tokens: PushTokenRecord[] | null | undefined) {
  const active = (tokens ?? []).filter((t) => t.isActive);
  return {
    active,
    mobile: active.filter((t) => t.platform === 'IOS' || t.platform === 'ANDROID'),
    web: active.filter((t) => t.platform === 'WEB'),
  };
}

/** Build the Expo push payloads. HIGH maps to the urgent channel, everything else to default. */
export function buildExpoMessages(
  tokens: PushTokenRecord[],
  title: string,
  message: string,
  data: unknown,
  priority: Priority
): ExpoMessage[] {
  const high = priority === 'HIGH';
  return tokens.map((t) => ({
    to: t.token!,
    sound: 'default',
    title,
    body: message,
    data: (data as Record<string, unknown>) || {},
    badge: 1,
    priority: high ? 'high' : 'normal',
    channelId: high ? 'urgent' : 'default',
  }));
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
  tokens: PushTokenRecord[],
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
  tokens: PushTokenRecord[],
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
