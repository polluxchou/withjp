import test from 'node:test'
import assert from 'node:assert/strict'

import { buildZip, crc32 } from './zip.ts'

const bytes = (s: string) => new TextEncoder().encode(s)

test('crc32: 对照公开测试向量', () => {
  // 这几个值是 CRC-32/ISO-HDLC 的标准向量，写错一个位就对不上
  assert.equal(crc32(bytes('')) >>> 0, 0x00000000)
  assert.equal(crc32(bytes('a')) >>> 0, 0xe8b7be43)
  assert.equal(crc32(bytes('abc')) >>> 0, 0x352441c2)
  assert.equal(crc32(bytes('123456789')) >>> 0, 0xcbf43926)
})

test('crc32: 对二进制字节也成立，不只是 ASCII', () => {
  // 期望值取自 node:zlib 的 crc32（独立实现），不是本文件产出的回填
  assert.equal(crc32(new Uint8Array([0x00, 0xff, 0x80, 0x7f])) >>> 0, 0x64e51f17)
})

test('buildZip: 头尾魔数与条目数', () => {
  const zip = buildZip([{ name: 'a.txt', data: bytes('hello') }])
  // 本地文件头 PK\x03\x04
  assert.deepEqual(Array.from(zip.slice(0, 4)), [0x50, 0x4b, 0x03, 0x04])
  // 中央目录结束记录 PK\x05\x06 —— 从尾部找，EOCD 是最后 22 字节（无注释）
  const eocd = zip.length - 22
  assert.deepEqual(Array.from(zip.slice(eocd, eocd + 4)), [0x50, 0x4b, 0x05, 0x06])
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  assert.equal(view.getUint16(eocd + 8, true), 1, '本盘条目数')
  assert.equal(view.getUint16(eocd + 10, true), 1, '总条目数')
})

test('buildZip: 多个条目都记进中央目录', () => {
  const zip = buildZip([
    { name: 'a.txt', data: bytes('aaa') },
    { name: 'b.txt', data: bytes('bbbb') },
    { name: 'c.txt', data: bytes('') },
  ])
  const eocd = zip.length - 22
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  assert.equal(view.getUint16(eocd + 10, true), 3)
})

test('buildZip: 存储法不压缩，原样落盘', () => {
  // 图片本来就压过了，再 deflate 一遍既慢又基本不省 —— 所以用 method 0。
  // method 写错成 8 而数据没 deflate 过，解压时才会炸，这里直接钉死。
  const zip = buildZip([{ name: 'a.bin', data: new Uint8Array([1, 2, 3, 4, 5]) }])
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  assert.equal(view.getUint16(8, true), 0, '压缩方法必须是 0(store)')
  assert.equal(view.getUint32(18, true), 5, '压缩后大小')
  assert.equal(view.getUint32(22, true), 5, '原始大小')
})

test('buildZip: 中文文件名走 UTF-8 并置语言编码标志位', () => {
  // 不置 bit 11 的话，解压端会按本地代码页解，Windows 上就是一串乱码
  const zip = buildZip([{ name: '竞品_2026-09-13_1.webp', data: bytes('x') }])
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  const flags = view.getUint16(6, true)
  assert.equal((flags >> 11) & 1, 1, 'bit 11 (UTF-8) 必须置位')
  const nameLen = view.getUint16(26, true)
  const name = new TextDecoder().decode(zip.slice(30, 30 + nameLen))
  assert.equal(name, '竞品_2026-09-13_1.webp')
})

test('buildZip: 空列表也产出合法空包', () => {
  const zip = buildZip([])
  assert.equal(zip.length, 22, '只有一个 EOCD')
  assert.deepEqual(Array.from(zip.slice(0, 4)), [0x50, 0x4b, 0x05, 0x06])
})

test('buildZip: 中央目录里记的偏移能定位回本地头', () => {
  const zip = buildZip([
    { name: 'a.txt', data: bytes('aaa') },
    { name: 'b.txt', data: bytes('bbbb') },
  ])
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  const eocd = zip.length - 22
  const cdOffset = view.getUint32(eocd + 16, true)
  // 第二条中央目录记录里的 relative offset 必须指向第二个本地头
  const first = cdOffset
  const firstNameLen = view.getUint16(first + 28, true)
  const second = first + 46 + firstNameLen
  const rel = view.getUint32(second + 42, true)
  assert.deepEqual(Array.from(zip.slice(rel, rel + 4)), [0x50, 0x4b, 0x03, 0x04])
  const nameLen = view.getUint16(rel + 26, true)
  assert.equal(new TextDecoder().decode(zip.slice(rel + 30, rel + 30 + nameLen)), 'b.txt')
})

test('buildZip: 写合法的 DOS 日期而不是 0', () => {
  // 0 解出来是「0 月 0 日」，unzip -l 会列成 00-00-1980，部分工具会告警
  const zip = buildZip([{ name: 'a.txt', data: bytes('x') }])
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  const dosDate = view.getUint16(12, true)
  assert.equal((dosDate >> 5) & 0xf, 1, '月份必须 ≥1')
  assert.equal(dosDate & 0x1f, 1, '日必须 ≥1')
})
