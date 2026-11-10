import test from 'node:test'
import assert from 'node:assert/strict'
import { pickCreatorFields } from './fields.ts'

const form = {
  name: 'A',
  platform: 'tiktok',
  broadcast_account_id: null,
  operator_user_id: 'u1',
  contact_info: { email: 'a@example.com', wechat: '' },
  profile: { niche: 'dance', followers: 10 },
  notes: 'n',
}

test('keeps every field the creator form sends', () => {
  assert.deepEqual(pickCreatorFields(form), { ok: true, fields: form })
})

test('drops keys outside the whitelist (mass assignment)', () => {
  const r = pickCreatorFields({ ...form, id: 'x', created_by_user_id: 'someone-else', status: 'live', created_at: '2020-01-01' })
  assert.equal(r.ok, true)
  assert.deepEqual(r.ok && Object.keys(r.fields).sort(), Object.keys(form).sort())
})

test('only touches keys that are present (PATCH)', () => {
  assert.deepEqual(pickCreatorFields({ notes: 'x' }), { ok: true, fields: { notes: 'x' } })
  assert.deepEqual(pickCreatorFields({}), { ok: true, fields: {} })
})

test('falsy relation ids clear the link', () => {
  assert.deepEqual(pickCreatorFields({ broadcast_account_id: '', operator_user_id: 0 }), {
    ok: true,
    fields: { broadcast_account_id: null, operator_user_id: null },
  })
})

test('omitted notes stay omitted; explicit null clears them', () => {
  assert.deepEqual(pickCreatorFields({ notes: undefined }), { ok: true, fields: {} })
  assert.deepEqual(pickCreatorFields({ notes: null }), { ok: true, fields: { notes: null } })
})

test('rejects wrong types', () => {
  for (const body of [
    { name: 1 },
    { name: '  ' },
    { platform: ['tiktok'] },
    { contact_info: 'a@example.com' },
    { contact_info: null },
    { profile: [1, 2] },
    { notes: 3 },
  ]) {
    assert.equal(pickCreatorFields(body).ok, false, JSON.stringify(body))
  }
})
