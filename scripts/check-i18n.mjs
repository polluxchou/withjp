import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const locales = ['zh', 'en']

function readMessages(locale) {
  return JSON.parse(fs.readFileSync(path.join(root, 'messages', `${locale}.json`), 'utf8'))
}

function flattenKeys(value, prefix = '') {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.entries(value).flatMap(([key, child]) =>
      flattenKeys(child, prefix ? `${prefix}.${key}` : key)
    )
  }

  // Arrays of strings (e.g. month-name lists) are valid leaf values. We
  // record one key per index so parity across locales still requires the
  // same length and shape.
  if (Array.isArray(value)) {
    return value.flatMap((child, index) => flattenKeys(child, `${prefix}[${index}]`))
  }

  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Invalid message value at ${prefix}`)
  }

  return [prefix]
}

const [baseLocale, ...otherLocales] = locales
const baseMessages = readMessages(baseLocale)
const baseKeys = new Set(flattenKeys(baseMessages))

let hasError = false

for (const locale of otherLocales) {
  const keys = new Set(flattenKeys(readMessages(locale)))

  for (const key of baseKeys) {
    if (!keys.has(key)) {
      console.error(`${locale} is missing key: ${key}`)
      hasError = true
    }
  }

  for (const key of keys) {
    if (!baseKeys.has(key)) {
      console.error(`${locale} has extra key: ${key}`)
      hasError = true
    }
  }
}

if (hasError) {
  process.exit(1)
}

console.log(`i18n key parity OK for ${locales.join(', ')}`)
