import type { AppSyncIdentity } from 'aws-lambda';

/**
 * The event a Lambda receives when it backs a custom query or mutation
 * (`a.handler.function(...)`).
 *
 * This is NOT aws-lambda's `AppSyncResolverEvent`. Amplify's function transformer invokes
 * the Lambda with its own payload — `{ typeName, fieldName, arguments, identity, source,
 * request, prev }` — so the field name is at the top level and there is no `info`. Reading
 * `event.info.fieldName` (the direct-resolver shape) compiles fine and fails on every call;
 * that broke `registerDevice` and `sendTestPush` when they first shipped.
 */
export interface AmplifyResolverEvent<TArgs = Record<string, unknown>> {
  typeName: string;
  fieldName: string;
  arguments: TArgs;
  identity: AppSyncIdentity;
  source: Record<string, unknown> | null;
  request: { headers: Record<string, string | undefined> } | null;
  prev: { result: unknown } | null;
}

/** The query or mutation an Amplify resolver Lambda was invoked for, if the event is one. */
export function resolverFieldName(event: unknown): string | undefined {
  if (typeof event !== 'object' || event === null) return undefined;
  const fieldName = (event as { fieldName?: unknown }).fieldName;
  return typeof fieldName === 'string' ? fieldName : undefined;
}
