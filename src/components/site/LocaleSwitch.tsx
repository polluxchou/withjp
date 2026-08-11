'use client'

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { ChevronDown } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Link, usePathname } from '@/i18n/navigation'
import {
  buildLocaleMenuOptions,
  nextLocaleMenuIndex,
  nextLocaleMenuOpen,
} from '@/lib/site/locale-menu'

export default function LocaleSwitch({ locale }: { locale: string }) {
  const t = useTranslations('site.locale')
  const pathname = usePathname()
  const options = buildLocaleMenuOptions(locale)
  const current = options.find(({ active }) => active) ?? options[0]
  const currentIndex = Math.max(options.findIndex(({ active }) => active), 0)
  const [open, setOpen] = useState(false)
  const [focusIndex, setFocusIndex] = useState(currentIndex)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const optionRefs = useRef<Array<HTMLAnchorElement | null>>([])
  const menuId = useId()

  useEffect(() => {
    if (!open) return

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen((value) => nextLocaleMenuOpen(value, 'outside'))
      }
    }

    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  function openAndFocus(index: number) {
    setFocusIndex(index)
    setOpen(true)
    requestAnimationFrame(() => optionRefs.current[index]?.focus())
  }

  function toggleMenu() {
    if (open) {
      setOpen((value) => nextLocaleMenuOpen(value, 'toggle'))
      return
    }

    openAndFocus(currentIndex)
  }

  function onTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      openAndFocus(0)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      openAndFocus(options.length - 1)
    }
  }

  function onRootKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!open) return

    if (event.key === 'Escape') {
      event.preventDefault()
      setOpen((value) => nextLocaleMenuOpen(value, 'escape'))
      triggerRef.current?.focus()
      return
    }

    const activeIndex = optionRefs.current.findIndex(
      (node) => node === document.activeElement,
    )
    if (activeIndex < 0) return

    const nextIndex = nextLocaleMenuIndex(activeIndex, event.key, options.length)
    if (nextIndex !== activeIndex) {
      event.preventDefault()
      setFocusIndex(nextIndex)
      optionRefs.current[nextIndex]?.focus()
    }
  }

  function onRootBlur(event: ReactFocusEvent<HTMLDivElement>) {
    const nextTarget = event.relatedTarget
    if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
      setOpen((value) => nextLocaleMenuOpen(value, 'outside'))
    }
  }

  return (
    <div
      ref={rootRef}
      onBlur={onRootBlur}
      onKeyDown={onRootKeyDown}
      className="relative"
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={`${t('toggle')}: ${t(current.locale)}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={toggleMenu}
        onKeyDown={onTriggerKeyDown}
        className="inline-flex min-w-[108px] items-center justify-between gap-3 whitespace-nowrap border border-site-line-strong px-2.5 py-[7px] font-condensed text-[12px] tracking-[0.16em] text-site-accent transition-colors hover:border-site-accent"
      >
        <span className="inline-flex items-center gap-2">
          <span aria-hidden className="h-1.5 w-1.5 bg-site-accent" />
          {t(current.locale)}
        </span>
        <ChevronDown
          aria-hidden
          className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={t('menuLabel')}
          className="absolute right-0 top-full z-50 mt-1 min-w-full border border-site-line-strong bg-site-canvas"
        >
          {options.map((option, index) => (
            <Link
              key={option.locale}
              ref={(node) => {
                optionRefs.current[index] = node
              }}
              href={pathname}
              locale={option.locale}
              role="menuitem"
              tabIndex={focusIndex === index ? 0 : -1}
              aria-current={option.active ? 'true' : undefined}
              onFocus={() => setFocusIndex(index)}
              onClick={() => setOpen((value) => nextLocaleMenuOpen(value, 'select'))}
              className={`flex w-full items-center gap-2 border-b border-site-line px-3 py-2.5 font-condensed text-[13px] tracking-[0.16em] transition-colors last:border-b-0 hover:bg-site-panel hover:text-site-accent ${option.active ? 'text-site-accent' : 'text-site-fg/60'}`}
            >
              <span
                aria-hidden
                className={`h-1.5 w-1.5 ${
                  option.active ? 'bg-site-accent' : 'bg-transparent'
                }`}
              />
              {t(option.locale)}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
