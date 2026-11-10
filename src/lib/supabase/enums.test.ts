import test from 'node:test'
import assert from 'node:assert/strict'
import { dbEnumValues, isDbEnum, optionalDbEnum } from './enums.ts'

test('accepts every value of the enum and nothing else', () => {
  for (const v of dbEnumValues('creator_status')) assert.equal(isDbEnum('creator_status', v), true)
  assert.equal(isDbEnum('creator_status', 'prospect'), true)
  assert.equal(isDbEnum('creator_status', 'Prospect'), false)
  assert.equal(isDbEnum('creator_status', 'bd'), false)
  assert.equal(isDbEnum('creator_status', ''), false)
})

test('rejects non-strings', () => {
  for (const v of [null, undefined, 1, ['prospect'], { prospect: true }]) {
    assert.equal(isDbEnum('creator_status', v), false)
  }
})

test('enum values come from the generated file, in database order', () => {
  assert.deepEqual(dbEnumValues('work_task_type'), ['fixed', 'adhoc'])
  assert.deepEqual(dbEnumValues('task_status'), ['pending', 'running', 'done', 'failed'])
})

test('optionalDbEnum: empty means no filter, invalid means undefined', () => {
  assert.equal(optionalDbEnum('task_status', null), null)
  assert.equal(optionalDbEnum('task_status', undefined), null)
  assert.equal(optionalDbEnum('task_status', ''), null)
  assert.equal(optionalDbEnum('task_status', 'done'), 'done')
  assert.equal(optionalDbEnum('task_status', 'DONE'), undefined)
  assert.equal(optionalDbEnum('task_status', 'live'), undefined)
})
