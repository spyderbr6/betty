// expo-font's serverContext.web.js imports node:async_hooks for static
// rendering only; in the browser it is never used. Minimal no-op stand-in.
export class AsyncLocalStorage<T> {
  getStore(): T | undefined { return undefined; }
  run<R>(_store: T, fn: () => R): R { return fn(); }
}
