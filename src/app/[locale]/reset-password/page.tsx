'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useRouter } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { Eye, EyeOff } from 'lucide-react'
import { validateNewPassword } from '@/lib/auth/password-validation'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [hasSession, setHasSession] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useTranslations('auth')
  const tCommon = useTranslations('common')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const proof = searchParams.get('proof')
      if (!proof) {
        if (!cancelled) {
          setHasSession(false)
          setCheckingSession(false)
        }
        return
      }

      const [{ supabase }, verifyResponse] = await Promise.all([
        import('@/lib/supabase/client'),
        fetch(`/api/auth/verify-recovery-proof?proof=${encodeURIComponent(proof)}`),
      ])
      const { valid } = await verifyResponse.json()
      const { data: { user } } = await supabase.auth.getUser()
      if (!cancelled) {
        setHasSession(!!user && valid)
        setCheckingSession(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [searchParams])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const validationError = validateNewPassword(password, confirmPassword)
    if (validationError === 'tooShort') {
      setError(t('resetPasswordTooShort'))
      return
    }
    if (validationError === 'mismatch') {
      setError(t('resetPasswordMismatch'))
      return
    }

    setLoading(true)
    try {
      const { supabase } = await import('@/lib/supabase/client')
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError

      await supabase.auth.signOut()
      router.push('/login?resetSuccess=1')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('resetPasswordFailed'))
    } finally {
      setLoading(false)
    }
  }

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="text-sm text-zinc-400">{tCommon('loading')}</div>
      </div>
    )
  }

  if (!hasSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 px-5">
        <div className="max-w-md text-center space-y-4">
          <p className="text-sm text-zinc-600">{t('resetPasswordSessionMissing')}</p>
          <button
            type="button"
            onClick={() => router.push('/login')}
            className="text-sm text-zinc-900 underline underline-offset-2"
          >
            {t('signIn')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 px-5">
      <div className="w-full max-w-md">
        <h2 className="text-2xl font-bold text-zinc-900 tracking-tight">{t('resetPasswordTitle')}</h2>
        <p className="mt-2 text-sm text-zinc-600">{t('resetPasswordDesc')}</p>

        <form onSubmit={handleSubmit} className="mt-7 space-y-5">
          {error && (
            <div className="text-sm bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-3 py-2.5">
              {error}
            </div>
          )}

          <div>
            <label className="block text-[10px] tracking-[0.2em] text-zinc-500 font-semibold uppercase mb-2">
              {t('newPasswordLabel')}
            </label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 pr-12 bg-white border border-zinc-300 rounded-xl text-base text-zinc-900 placeholder-zinc-300 focus:outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-0 top-0 bottom-0 px-4 flex items-center text-zinc-400 hover:text-zinc-700 transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[10px] tracking-[0.2em] text-zinc-500 font-semibold uppercase mb-2">
              {t('confirmPasswordLabel')}
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-3 bg-white border border-zinc-300 rounded-xl text-base text-zinc-900 placeholder-zinc-300 focus:outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 transition"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !password || !confirmPassword}
            className="w-full bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 disabled:cursor-not-allowed text-white font-medium py-3.5 rounded-xl transition-colors"
          >
            {loading ? t('resetPasswordSubmitting') : t('resetPasswordSubmit')}
          </button>
        </form>
      </div>
    </div>
  )
}
