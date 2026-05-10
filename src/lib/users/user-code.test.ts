import test from 'node:test'
import assert from 'node:assert/strict'

import { buildUserCode, buildUniqueUserCode } from './user-code.ts'

test('buildUserCode creates three to six letters followed by up to six digits', () => {
  const code = buildUserCode({
    email: 'operations.lead@example.com',
    name: 'Operations Lead',
    number: 482913,
  })

  assert.equal(code, 'operat482913')
  assert.match(code, /^[a-z]{3,6}\d{1,6}$/)
})

test('buildUserCode falls back when email and name do not contain enough letters', () => {
  const code = buildUserCode({
    email: '12@withjp.example',
    name: '李四',
    number: 7,
  })

  assert.equal(code, 'usr7')
  assert.match(code, /^[a-z]{3,6}\d{1,6}$/)
})

test('buildUniqueUserCode retries when generated codes already exist', async () => {
  const attempted: string[] = []
  const numbers = [100, 101, 102]
  const code = await buildUniqueUserCode(
    { email: 'ops@example.com', name: 'Ops', nextNumber: () => numbers.shift() ?? 999 },
    async (candidate) => {
      attempted.push(candidate)
      return candidate !== 'ops100' && candidate !== 'ops101'
    },
  )

  assert.deepEqual(attempted, ['ops100', 'ops101', 'ops102'])
  assert.equal(code, 'ops102')
})
