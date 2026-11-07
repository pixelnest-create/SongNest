// 元数据解析器的单元测试。运行：npm test
// 测试用的音频文件都是在这里用代码「拼」出来的，不需要真实的歌曲。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMetadata } from '../js/metadata.js';

// ---------- 拼字节的小工具 ----------
const enc = new TextEncoder();
const concat = (...parts) => {
  const arrays = parts.map((p) => (typeof p === 'string' ? enc.encode(p) : p instanceof Uint8Array ? p : Uint8Array.from(p)));
  const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0));
  let i = 0;
  for (const a of arrays) { out.set(a, i); i += a.length; }
  return out;
};
const latin = (s) => Uint8Array.from([...s].map((c) => c.charCodeAt(0)));
const be32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const le32 = (n) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
const be24 = (n) => [(n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const synch = (n) => [(n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127];
const utf16le = (s) => { const a = []; for (const c of s) { const x = c.charCodeAt(0); a.push(x & 255, x >> 8); } return a; };

const FAKE_JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5]);

/** n 个 128kbps / 44.1kHz 的 MP3 帧（内容全 0 = 静音） */
function mp3Frames(n, firstFrameExtra = null) {
  const frame = () => { const f = new Uint8Array(417); f.set([0xff, 0xfb, 0x90, 0x00]); return f; };
  const frames = Array.from({ length: n }, frame);
  if (firstFrameExtra) frames[0].set(firstFrameExtra, 4 + 32);
  return concat(...frames);
}

function id3v2(major, frames) {
  const body = concat(...frames);
  return concat('ID3', [major, 0, 0], synch(body.length), body);
}
function frame23(id, data) { return concat(id, be32(data.length), [0, 0], data); }
function frame24(id, data) { return concat(id, synch(data.length), [0, 0], data); }

// ---------- MP3 ----------

test('ID3v2.3：UTF-16 中文标题、歌手、封面，CBR 时长', () => {
  const file = concat(
    id3v2(3, [
      frame23('TIT2', concat([1, 0xff, 0xfe], utf16le('晴天'), [0, 0])),
      frame23('TPE1', concat([1, 0xff, 0xfe], utf16le('小林'))),
      frame23('APIC', concat([0], 'image/jpeg', [0, 3], 'desc', [0], FAKE_JPEG)),
    ]),
    mp3Frames(100),
  );
  const m = parseMetadata(file.buffer);
  assert.equal(m.title, '晴天');
  assert.equal(m.artist, '小林');
  assert.equal(m.cover.mime, 'image/jpeg');
  assert.deepEqual([...m.cover.data], [...FAKE_JPEG]);
  assert.ok(Math.abs(m.duration - 2.61) < 0.05, `duration=${m.duration}`);
});

test('ID3v2.4：UTF-8 文字，同步安全帧长度', () => {
  const file = concat(
    id3v2(4, [frame24('TIT2', concat([3], '雨后')), frame24('TALB', concat([3], '专辑一'))]),
    mp3Frames(10),
  );
  const m = parseMetadata(file.buffer);
  assert.equal(m.title, '雨后');
  assert.equal(m.album, '专辑一');
});

test('ID3v2.3：标注为 Latin-1 但实际是 GBK 的中文', () => {
  const gbkQingTian = [0xc7, 0xe7, 0xcc, 0xec]; // 「晴天」的 GBK 编码
  const file = concat(id3v2(3, [frame23('TIT2', concat([0], gbkQingTian))]), mp3Frames(5));
  assert.equal(parseMetadata(file.buffer).title, '晴天');
});

test('ID3v1：文件末尾 128 字节的老标签', () => {
  const v1 = new Uint8Array(128);
  v1.set(latin('TAG'), 0);
  v1.set(latin('Old Song'), 3);
  v1.set(latin('Old Artist'), 33);
  const file = concat(mp3Frames(10), v1);
  const m = parseMetadata(file.buffer);
  assert.equal(m.title, 'Old Song');
  assert.equal(m.artist, 'Old Artist');
});

test('MP3 VBR：从 Xing 头读取总帧数', () => {
  const xing = concat('Xing', be32(0x01), be32(1000));
  const m = parseMetadata(mp3Frames(3, xing).buffer);
  assert.ok(Math.abs(m.duration - (1000 * 1152) / 44100) < 0.01, `duration=${m.duration}`);
});

test('没有任何标签：全部为 null，不报错', () => {
  const m = parseMetadata(new Uint8Array(1000).buffer);
  assert.deepEqual(m, { title: null, artist: null, album: null, cover: null, duration: null });
});

// ---------- M4A ----------

test('M4A：标题、歌手、封面、时长', () => {
  const box = (type, ...children) => { const body = concat(...children); return concat(be32(body.length + 8), latin(type), body); };
  const dataBox = (kind, payload) => box('data', be32(kind), be32(0), payload);
  const mvhd = box('mvhd', [0, 0, 0, 0], be32(0), be32(0), be32(1000), be32(180500), new Uint8Array(80));
  const ilst = box('ilst',
    box('©nam', dataBox(1, '夜的钢琴曲')),
    box('©ART', dataBox(1, '某位歌手')),
    box('covr', dataBox(13, FAKE_JPEG)),
  );
  const file = concat(
    box('ftyp', 'M4A ', be32(0)),
    box('moov', mvhd, box('udta', box('meta', [0, 0, 0, 0], box('hdlr', new Uint8Array(25)), ilst))),
  );
  const m = parseMetadata(file.buffer);
  assert.equal(m.title, '夜的钢琴曲');
  assert.equal(m.artist, '某位歌手');
  assert.equal(m.cover.mime, 'image/jpeg');
  assert.equal(m.duration, 180.5);
});

// ---------- FLAC ----------

test('FLAC：Vorbis 注释、封面、时长', () => {
  const block = (type, last, data) => concat([(last ? 0x80 : 0) | type], be24(data.length), data);
  const streaminfo = new Uint8Array(34);
  // 采样率 44100（20 位）、总采样数 44100*200（36 位）
  const sr = 44100;
  const total = 44100 * 200;
  streaminfo[10] = sr >> 12;
  streaminfo[11] = (sr >> 4) & 255;
  streaminfo[12] = (sr & 15) << 4;
  streaminfo[13] = Math.floor(total / 2 ** 32) & 15;
  streaminfo.set(be32(total >>> 0), 14);
  const comment = (s) => { const b = enc.encode(s); return concat(le32(b.length), b); };
  const vorbis = concat(le32(3), 'abc', le32(2), comment('TITLE=回家路上'), comment('artist=小林'));
  const picture = concat(be32(3), be32(10), 'image/jpeg', be32(0), new Uint8Array(16), be32(FAKE_JPEG.length), FAKE_JPEG);
  const file = concat('fLaC', block(0, false, streaminfo), block(4, false, vorbis), block(6, true, picture));
  const m = parseMetadata(file.buffer);
  assert.equal(m.title, '回家路上');
  assert.equal(m.artist, '小林');
  assert.equal(m.cover.mime, 'image/jpeg');
  assert.equal(m.duration, 200);
});

// ---------- WAV ----------

test('WAV：根据数据大小算时长', () => {
  const byteRate = 44100 * 2 * 2;
  const fmt = concat('fmt ', le32(16), [1, 0, 2, 0], le32(44100), le32(byteRate), [4, 0, 16, 0]);
  const data = concat('data', le32(byteRate * 3), new Uint8Array(byteRate * 3));
  const file = concat('RIFF', le32(4 + fmt.length + data.length), 'WAVE', fmt, data);
  assert.equal(parseMetadata(file.buffer).duration, 3);
});
