/** Never interpret a lost finance snapshot as a new empty account after enrollment. */
export function failClosedIfMissingSnapshot(firstEnrollment:boolean):void {
  if (!firstEnrollment) throw new Error('ANDROID_LOCAL_STATE_MISSING_FAIL_CLOSED')
}
