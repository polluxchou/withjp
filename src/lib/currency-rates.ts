// Fixed cross-rates expressed as "1 CNY = N <target>":
//   USD: 1 USD = 7 CNY  →  1 CNY = 1/7 USD
//   JPY: 1 CNY = 20 JPY
export const CURRENCY_RATES = {
  CNY: 1,
  USD: 1 / 7,
  JPY: 20,
} as const

export type CurrencyKey = keyof typeof CURRENCY_RATES
