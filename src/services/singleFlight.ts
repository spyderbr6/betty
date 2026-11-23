/**
 * One call at a time per key: a call made while another for the same key is under way
 * gets that call's result instead of starting its own. A forced call waits for the one
 * under way, then runs anyway.
 *
 * Used for push registration, which sign-in starts several times at once (see
 * NotificationService.registerPushToken). Plain logic, no React Native imports, so it can
 * be unit tested.
 */
export function singleFlight<T>() {
  let current: { key: string; promise: Promise<T> } | null = null;

  return async function run(key: string, force: boolean, start: () => Promise<T>): Promise<T> {
    if (current?.key === key) {
      const pending = current.promise;
      if (!force) return pending;
      await pending.catch(() => undefined);
    }
    const promise = start();
    current = { key, promise };
    try {
      return await promise;
    } finally {
      if (current?.promise === promise) current = null;
    }
  };
}
