/**
 * Reading AppSync errors. The Amplify client reports a refused write in `errors` rather
 * than throwing. Plain functions, no dependencies: bundled into Lambdas and unit tested.
 */

/**
 * True when a create was refused only because a row with that id already exists (AppSync
 * creates with a condition that the id is new). Lets a caller treat a write that lost a
 * race, or was repeated, as already done.
 */
export function isDuplicate(errors: ReadonlyArray<{ errorType?: string; message?: string }> | null | undefined): boolean {
  return (
    !!errors?.length &&
    errors.every((e) => /ConditionalCheckFailed/i.test(e.errorType ?? '') || /conditional request failed/i.test(e.message ?? ''))
  );
}
