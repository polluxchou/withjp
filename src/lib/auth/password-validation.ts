// Supabase's default GoTrue config requires a minimum of 6 characters —
// this mirrors that so the UI can reject too-short passwords before the
// updateUser() call round-trips to the server.
export const MIN_PASSWORD_LENGTH = 6

export type PasswordValidationError = 'tooShort' | 'mismatch'

export function validateNewPassword(
  password: string,
  confirmPassword: string
): PasswordValidationError | null {
  if (password.length < MIN_PASSWORD_LENGTH) return 'tooShort'
  if (password !== confirmPassword) return 'mismatch'
  return null
}
