interface BuildUserCodeInput {
  email?: string | null
  name?: string | null
  number?: number
}

interface BuildUniqueUserCodeInput {
  email?: string | null
  name?: string | null
  nextNumber?: () => number
  maxAttempts?: number
}

const DEFAULT_PREFIX = 'usr'
const MAX_NUMBER = 999999

function normalizePrefix(value: string | null | undefined): string {
  const letters = (value ?? '').toLowerCase().replace(/[^a-z]/g, '')
  if (letters.length >= 3) return letters.slice(0, 6)
  return ''
}

function resolvePrefix(email?: string | null, name?: string | null): string {
  const emailLocalPart = email?.split('@')[0]
  return normalizePrefix(emailLocalPart) || normalizePrefix(name) || DEFAULT_PREFIX
}

function normalizeNumber(number: number | undefined): number {
  if (number == null || !Number.isFinite(number)) {
    return Math.floor(Math.random() * MAX_NUMBER) + 1
  }

  const normalized = Math.abs(Math.trunc(number)) % (MAX_NUMBER + 1)
  return normalized === 0 ? MAX_NUMBER : normalized
}

export function buildUserCode({ email, name, number }: BuildUserCodeInput): string {
  return `${resolvePrefix(email, name)}${normalizeNumber(number)}`
}

export async function buildUniqueUserCode(
  input: BuildUniqueUserCodeInput,
  isAvailable: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const maxAttempts = input.maxAttempts ?? 20

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = buildUserCode({
      email: input.email,
      name: input.name,
      number: input.nextNumber?.(),
    })

    if (await isAvailable(candidate)) {
      return candidate
    }
  }

  throw new Error('Unable to generate a unique user code')
}
