'use client'

import { useState, useEffect } from 'react'
import { useRouter } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { Eye, EyeOff, Zap, ArrowRight, Check } from 'lucide-react'

const REMEMBER_KEY = 'cg_remembered_email'

function useClock() {
  const [time, setTime] = useState<string>('--:--')
  useEffect(() => {
    const update = () => {
      const d = new Date()
      const hh = String(d.getHours()).padStart(2, '0')
      const mm = String(d.getMinutes()).padStart(2, '0')
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone.split('/').pop() ?? ''
      setTime(`${hh}:${mm} · ${tz.toUpperCase()}`)
    }
    update()
    const id = setInterval(update, 30 * 1000)
    return () => clearInterval(id)
  }, [])
  return time
}

export default function LoginPage() {
  const [email, setEmail]               = useState('')
  const [password, setPassword]         = useState('')
  const [remember, setRemember]         = useState(false)
  const [error, setError]               = useState('')
  const [loading, setLoading]           = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const router = useRouter()
  const t = useTranslations('auth')
  const tNav = useTranslations('nav')
  const time = useClock()

  useEffect(() => {
    const saved = localStorage.getItem(REMEMBER_KEY)
    if (saved) {
      setEmail(saved)
      setRemember(true)
    }
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { supabase } = await import('@/lib/supabase/client')
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error

      if (remember) localStorage.setItem(REMEMBER_KEY, email)
      else          localStorage.removeItem(REMEMBER_KEY)

      router.push('/')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('loginFailed'))
    } finally {
      setLoading(false)
    }
  }

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.05fr_1fr]">
      {/* ───── LEFT: dark brand hero ───── */}
      <aside className="relative hidden lg:flex flex-col bg-slate-950 text-white overflow-hidden px-10 py-9">
        {/* ambient glow */}
        <div
          className="absolute inset-0 pointer-events-none opacity-70"
          style={{
            background:
              'radial-gradient(720px 540px at 18% 32%, rgba(99,102,241,0.30), transparent 70%),' +
              'radial-gradient(620px 460px at 78% 76%, rgba(236,72,153,0.18), transparent 75%)',
          }}
        />
        {/* fine grid */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />

        {/* Top row: brand + status */}
        <div className="relative flex items-start justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-500/40">
              <Zap className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
            <div>
              <div className="font-bold tracking-tight text-base leading-tight">{tNav('appName')}</div>
              <div className="text-[10px] text-slate-400 tracking-[0.22em]">CREATOR GUILD · OS</div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-slate-300 tracking-[0.2em] font-mono px-3 py-1.5 border border-slate-800 rounded-full bg-slate-950/60 backdrop-blur">
            <span className="relative inline-flex">
              <span className="absolute inline-flex h-2 w-2 rounded-full bg-emerald-400 opacity-75 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <span>{time}</span>
          </div>
        </div>

        {/* Tagline */}
        <div className="relative flex-1 flex flex-col justify-center z-10">
          <div className="flex items-center gap-2 text-[10px] tracking-[0.3em] text-indigo-300 uppercase mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
            {t('brandTag')}
          </div>
          <h1 className="font-bold leading-[1.02] tracking-tight text-[clamp(2.75rem,5.5vw,4.75rem)]">
            {t('taglineLead')}
            <br />
            <span
              className="inline-block italic text-slate-900 px-3 -mx-1 rounded-md"
              style={{ background: 'linear-gradient(180deg, #d9f99d 0%, #bef264 100%)' }}
            >
              {t('taglineAccent')}.
            </span>
          </h1>
          <div className="mt-8 max-w-md space-y-2">
            <p className="text-slate-300 text-sm leading-relaxed">{t('subtitle')}</p>
            <p className="text-slate-500 text-[10px] tracking-[0.18em] uppercase">{t('subtitleEn')}</p>
          </div>
        </div>

        {/* bottom mini meta strip */}
        <div className="relative z-10 flex items-center justify-between text-[10px] tracking-[0.2em] text-slate-500 font-mono">
          <div>WITHJP · {new Date().getFullYear()}</div>
          <div className="flex items-center gap-1.5">
            <span className="w-1 h-1 rounded-full bg-emerald-400" />
            ALL SYSTEMS · ONLINE
          </div>
        </div>
      </aside>

      {/* ───── RIGHT: form ───── */}
      <main className="flex flex-col bg-stone-50 px-6 py-8 sm:px-10 lg:px-16 lg:py-10 relative">
        {/* dotted left rule (lg+ only) */}
        <div
          className="hidden lg:block absolute left-6 top-12 bottom-12 w-px"
          style={{ backgroundImage: 'repeating-linear-gradient(to bottom, #d6d3d1 0 4px, transparent 4px 9px)' }}
        />

        {/* Top breadcrumb */}
        <div className="flex items-center justify-between text-[10px] tracking-[0.22em] text-slate-500 mb-12 lg:mb-16">
          <span className="font-semibold text-slate-900 uppercase">{t('stepLabel')}</span>
          <span className="text-slate-400 font-mono">v0.1.0</span>
        </div>

        <div className="flex-1 flex items-center">
          <div className="w-full max-w-md mx-auto">
            {/* Welcome */}
            <h2 className="text-[clamp(2rem,4vw,2.75rem)] font-bold text-slate-900 tracking-tight leading-[1.1]">
              {t('welcomeLead')},
              <br />
              <span className="italic font-serif text-rose-500">{t('welcomeAccent')}</span>
            </h2>
            <p className="mt-4 text-sm text-slate-600">{t('welcomeDesc')}</p>

            {/* Form */}
            <form onSubmit={handleLogin} className="mt-10 space-y-5" autoComplete="on">
              {error && (
                <div className="text-sm bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-3 py-2.5">
                  {error}
                </div>
              )}

              {/* Email */}
              <div>
                <label className="block text-[10px] tracking-[0.2em] text-slate-500 font-semibold uppercase mb-2">
                  {t('emailLabel')}
                </label>
                <div className="relative">
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@withjp.live"
                    className="w-full px-4 py-3 pr-11 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder-slate-300 focus:outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 transition"
                  />
                  {emailValid && (
                    <Check className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500" />
                  )}
                </div>
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-[10px] tracking-[0.2em] text-slate-500 font-semibold uppercase">
                    {t('passwordLabel')}
                  </label>
                  <button
                    type="button"
                    className="text-[10px] tracking-[0.15em] text-slate-400 hover:text-slate-700 transition-colors uppercase"
                    onClick={() => alert('请联系管理员重置密码')}
                  >
                    {t('forgot')}
                  </button>
                </div>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 pr-11 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder-slate-300 focus:outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Remember */}
              <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none pt-1">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900/20"
                />
                {t('remember')}
              </label>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading || !email || !password}
                className="group w-full bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium py-3.5 rounded-xl transition-colors flex items-center justify-center gap-2 mt-2"
              >
                {loading ? t('signingIn') : t('signIn')}
                {!loading && <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />}
              </button>
            </form>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 lg:mt-auto pt-6 text-center text-[10px] tracking-[0.2em] text-slate-400 font-mono">
          © {new Date().getFullYear()} WITHJP · CREATOR GUILD OS
        </div>
      </main>
    </div>
  )
}
