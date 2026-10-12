// 本地暂存区的 IndexedDB 外壳：只做读写，规则全在 stash.js。
// node 没有 IndexedDB，这一层靠真机验收（见第二版设计第 8 节）。
// 全部用回调式请求：事务在没有挂起请求时会自动提交，不能在中间夹 await。
import { planInsert } from './stash.js'

const DB_NAME = 'live-shot'
const STORE = 'stash'

let dbPromise = null
function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' })
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
      req.onblocked = () => reject(new Error('indexedDB open blocked'))
    }).catch((e) => {
      dbPromise = null // 下次再试，别把一次失败缓存成永久失败
      throw e
    })
  }
  return dbPromise
}

// 在一个事务里跑 body(store, out)，事务提交后才 resolve(out.value)
function run(mode, body) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode)
        const out = { value: undefined }
        t.oncomplete = () => resolve(out.value)
        t.onerror = () => reject(t.error)
        t.onabort = () => reject(t.error || new Error('stash transaction aborted'))
        body(t.objectStore(STORE), out)
      }),
  )
}

export function listStash() {
  return run('readonly', (store, out) => {
    const r = store.getAll()
    r.onsuccess = () => { out.value = r.result }
  })
}

// 写入新记录并挤掉超出上限的旧记录，同一个 readwrite 事务：两个窗口同时截图时事务排队，不会多出或删错。
// 返回被挤掉的记录。
export function insertStash(item) {
  return run('readwrite', (store, out) => {
    const r = store.getAll()
    r.onsuccess = () => {
      const evicted = planInsert(r.result, item)
      store.put(item)
      for (const e of evicted) store.delete(e.id)
      out.value = evicted
    }
  })
}

export function markPartial(id) {
  return run('readwrite', (store) => {
    const r = store.get(id)
    r.onsuccess = () => {
      if (r.result) store.put({ ...r.result, partial: true })
    }
  })
}

export function removeStash(id) {
  return run('readwrite', (store) => {
    store.delete(id)
  })
}
