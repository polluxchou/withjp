import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

test('dashboard server page does not import currency helpers from the client provider module', () => {
  const source = fs.readFileSync('src/app/[locale]/(app)/page.tsx', 'utf8')

  assert.equal(
    source.includes("from '@/lib/currency'"),
    false,
    'Server Components must import pure currency helpers from a server-safe module, not the client provider module.',
  )
})
