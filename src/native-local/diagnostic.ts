/** UI-only failure codes. Never expose exceptions, authentication tokens or native SQL errors. */
export type NativeAuthStage = 'OFFLINE_RESTORE' | 'CENTRAL_RESTORE' | 'CENTRAL_WAIT' | 'ENROLL_SIGNIN' | 'ENROLL_RESTORE'

export function nativeAuthDiagnostic(stage:NativeAuthStage,problem:unknown):string {
  let message = ''
  if (problem && typeof problem === 'object' && 'message' in problem && typeof problem.message === 'string') {
    message = problem.message
  }
  // Only stable, machine-created error identifiers can reach the user interface.
  const safe = /^(?:ANDROID|NATIVE|LOCAL|OFFLINE|KEYSTORE|CUSTOMER|CENTRAL)_[A-Z0-9_]{3,70}$/u.test(message)
    ? message : 'UNCLASSIFIED'
  return `${stage} / ${safe}`
}
