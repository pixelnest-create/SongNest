// 音频元数据解析器：从文件字节里读出 标题 / 歌手 / 专辑 / 封面 / 时长。
// 支持 MP3（ID3v2.2/2.3/2.4 + ID3v1）、M4A/AAC（MP4 容器）、FLAC、WAV。
//
// 这是一个「纯函数」模块：只处理字节，不碰页面、不碰数据库，
// 所以可以直接在 Node.js 里做单元测试（见 tests/metadata.test.mjs）。

/**
 * @param {ArrayBuffer} buffer 整个音频文件
 * @returns {{title: string|null, artist: string|null, album: string|null,
 *            cover: {data: Uint8Array, mime: string}|null, duration: number|null}}
 */
export function parseMetadata(buffer) {
  const bytes = new Uint8Array(buffer);
  const out = { title: null, artist: null, album: null, cover: null, duration: null };

  try {
    if (ascii(bytes, 0, 4) === 'fLaC') fill(out, parseFLAC(bytes));
    else if (ascii(bytes, 4, 4) === 'ftyp') fill(out, parseMP4(bytes));
    else if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WAVE') fill(out, parseWAV(bytes));
    else fill(out, parseMP3(bytes)); // MP3 可能以 ID3 开头，也可能直接是音频帧
  } catch (err) {
    // 文件格式不规范时不要让整个导入失败，能读多少算多少
    console.warn('元数据解析出错：', err);
  }
  return out;
}

/** 只填补还没有值的字段 */
function fill(target, source) {
  for (const key of Object.keys(target)) {
    if ((target[key] == null || target[key] === '') && source?.[key] != null && source[key] !== '') {
      target[key] = source[key];
    }
  }
}

// =========================================================
// 通用小工具
// =========================================================

function ascii(bytes, start, length) {
  let s = '';
  for (let i = start; i < start + length && i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

function u32be(b, i) { return ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3]; }
function u32le(b, i) { return b[i] + (b[i + 1] << 8) + (b[i + 2] << 16) + ((b[i + 3] << 24) >>> 0); }
function u24be(b, i) { return (b[i] << 16) + (b[i + 1] << 8) + b[i + 2]; }
/** ID3 的「同步安全整数」：每个字节只用低 7 位 */
function synchsafe(b, i) { return (b[i] << 21) | (b[i + 1] << 14) | (b[i + 2] << 7) | b[i + 3]; }

function decoder(label, fatal = false) {
  try { return new TextDecoder(label, { fatal }); } catch { return null; }
}
const UTF8 = decoder('utf-8');
const UTF8_STRICT = decoder('utf-8', true);
const GBK_STRICT = decoder('gbk', true);
const LATIN1 = decoder('latin1');
const UTF16LE = decoder('utf-16le');
const UTF16BE = decoder('utf-16be');

/** 去掉末尾的 \0 和空格；多个值用 \0 分隔时只取第一个 */
function clean(text) {
  const s = text.split('\0')[0].trim();
  return s || null;
}

/**
 * 「老式」编码的文字：标准上应该是 Latin-1，
 * 但很多中文 MP3 实际写的是 GBK，或者干脆是 UTF-8。依次尝试。
 */
function decodeLegacy(bytes) {
  if (bytes.every((b) => b < 0x80)) return LATIN1.decode(bytes);
  for (const d of [UTF8_STRICT, GBK_STRICT]) {
    if (!d) continue;
    try { return d.decode(bytes); } catch { /* 不是这种编码，试下一个 */ }
  }
  return LATIN1.decode(bytes);
}

/** 根据文件开头的几个字节判断图片类型 */
function sniffImage(data, fallback = 'image/jpeg') {
  if (data[0] === 0xff && data[1] === 0xd8) return 'image/jpeg';
  if (data[0] === 0x89 && data[1] === 0x50) return 'image/png';
  return fallback;
}

// =========================================================
// MP3：ID3v2 标签 + 音频帧（算时长）+ ID3v1 标签
// =========================================================

function parseMP3(bytes) {
  const out = { title: null, artist: null, album: null, cover: null, duration: null };
  let audioStart = 0;

  if (ascii(bytes, 0, 3) === 'ID3') {
    const tagSize = synchsafe(bytes, 6);
    const hasFooter = bytes[3] === 4 && (bytes[5] & 0x10);
    audioStart = 10 + tagSize + (hasFooter ? 10 : 0);
    fill(out, parseID3v2(bytes));
  }

  const hasV1 = bytes.length >= 128 && ascii(bytes, bytes.length - 128, 3) === 'TAG';
  if (hasV1) fill(out, parseID3v1(bytes.subarray(bytes.length - 128)));

  const audioEnd = bytes.length - (hasV1 ? 128 : 0);
  out.duration = mp3Duration(bytes, audioStart, audioEnd);
  return out;
}

/** 去掉「反同步」插入的字节：FF 00 → FF */
function removeUnsync(data) {
  const out = [];
  for (let i = 0; i < data.length; i++) {
    out.push(data[i]);
    if (data[i] === 0xff && data[i + 1] === 0x00) i++;
  }
  return Uint8Array.from(out);
}

const ID3_TEXT_FRAMES = {
  TIT2: 'title', TT2: 'title',
  TPE1: 'artist', TP1: 'artist',
  TALB: 'album', TAL: 'album',
};

function parseID3v2(bytes) {
  const major = bytes[3]; // 2、3 或 4
  const flags = bytes[5];
  let tag = bytes.subarray(10, 10 + synchsafe(bytes, 6));
  if (major < 4 && (flags & 0x80)) tag = removeUnsync(tag);

  let pos = 0;
  if (major >= 3 && (flags & 0x40)) {
    // 跳过扩展头
    pos = major === 4 ? synchsafe(tag, 0) : u32be(tag, 0) + 4;
  }

  const idLen = major === 2 ? 3 : 4;
  const headerLen = major === 2 ? 6 : 10;
  const out = {};
  let coverType = -1;

  while (pos + headerLen <= tag.length) {
    const id = ascii(tag, pos, idLen);
    if (!/^[A-Z0-9]+$/.test(id)) break; // 到了填充区（全是 0）

    const size = major === 2 ? u24be(tag, pos + 3) : major === 4 ? synchsafe(tag, pos + 4) : u32be(tag, pos + 4);
    const formatFlags = major === 2 ? 0 : tag[pos + 9];
    const start = pos + headerLen;
    const end = start + size;
    if (size <= 0 || end > tag.length) break;

    let data = tag.subarray(start, end);
    // 被压缩或加密的帧直接跳过（很少见）
    const skip = major === 3 ? formatFlags & 0xc0 : major === 4 ? formatFlags & 0x0c : 0;
    if (!skip) {
      if (major === 4 && (formatFlags & 0x01)) data = data.subarray(4); // 「数据长度」字段
      if (major === 4 && (formatFlags & 0x02)) data = removeUnsync(data);

      const field = ID3_TEXT_FRAMES[id];
      if (field && !out[field]) {
        out[field] = clean(decodeID3Text(data[0], data.subarray(1)));
      } else if (id === 'APIC' || id === 'PIC') {
        const pic = parseID3Picture(data, id === 'PIC');
        // 优先用「封面（正面）」类型（3）的图片
        if (pic && (coverType !== 3) && (!out.cover || pic.type === 3)) {
          out.cover = { data: pic.data, mime: pic.mime };
          coverType = pic.type;
        }
      }
    }
    pos = end;
  }
  return out;
}

/** ID3 文字帧的第一个字节表示编码 */
function decodeID3Text(encoding, data) {
  switch (encoding) {
    case 1: { // UTF-16，带 BOM 指明字节序
      if (data[0] === 0xfe && data[1] === 0xff) return UTF16BE.decode(data.subarray(2));
      if (data[0] === 0xff && data[1] === 0xfe) return UTF16LE.decode(data.subarray(2));
      return UTF16LE.decode(data);
    }
    case 2: return UTF16BE.decode(data);
    case 3: return UTF8.decode(data);
    default: return decodeLegacy(data);
  }
}

/** 从 start 开始找字符串结束符；UTF-16 的结束符是两个 0 */
function skipTerminated(data, start, encoding) {
  if (encoding === 1 || encoding === 2) {
    for (let i = start; i + 1 < data.length; i += 2) if (data[i] === 0 && data[i + 1] === 0) return i + 2;
  } else {
    for (let i = start; i < data.length; i++) if (data[i] === 0) return i + 1;
  }
  return data.length;
}

function parseID3Picture(data, isV22) {
  const encoding = data[0];
  let pos;
  let mime;
  if (isV22) {
    mime = ascii(data, 1, 3).toUpperCase() === 'PNG' ? 'image/png' : 'image/jpeg';
    pos = 4;
  } else {
    const mimeEnd = skipTerminated(data, 1, 0);
    mime = ascii(data, 1, mimeEnd - 2).toLowerCase();
    pos = mimeEnd;
  }
  const type = data[pos];
  pos = skipTerminated(data, pos + 1, encoding); // 跳过图片描述
  const img = data.subarray(pos);
  if (img.length < 4) return null;
  return { type, data: img, mime: sniffImage(img, mime.startsWith('image/') ? mime : 'image/jpeg') };
}

function parseID3v1(tag) {
  const field = (start, len) => clean(decodeLegacy(tag.subarray(start, start + len)));
  return { title: field(3, 30), artist: field(33, 30), album: field(63, 30) };
}

const MP3_BITRATES = {
  v1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  v2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const MP3_SAMPLE_RATES = [44100, 48000, 32000];

/** 读取一个 MP3 帧头；不是合法帧头时返回 null。只处理最常见的 Layer III */
function readFrameHeader(b, i) {
  if (b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) return null;
  const versionBits = (b[i + 1] >> 3) & 0x03; // 3=MPEG1, 2=MPEG2, 0=MPEG2.5
  const layerBits = (b[i + 1] >> 1) & 0x03; // 1=Layer III
  const bitrateIndex = b[i + 2] >> 4;
  const rateIndex = (b[i + 2] >> 2) & 0x03;
  if (versionBits === 1 || layerBits !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) return null;

  const mpeg1 = versionBits === 3;
  const divisor = mpeg1 ? 1 : versionBits === 2 ? 2 : 4;
  const sampleRate = MP3_SAMPLE_RATES[rateIndex] / divisor;
  const bitrate = (mpeg1 ? MP3_BITRATES.v1 : MP3_BITRATES.v2)[bitrateIndex] * 1000;
  const mono = (b[i + 3] >> 6) === 3;
  const samplesPerFrame = mpeg1 ? 1152 : 576;
  const sideInfo = mpeg1 ? (mono ? 17 : 32) : (mono ? 9 : 17);
  return { sampleRate, bitrate, samplesPerFrame, sideInfo };
}

function mp3Duration(b, start, end) {
  // 找第一个合法帧（最多往后找 64KB）
  let i = start;
  const limit = Math.min(end - 4, start + 65536);
  let h = null;
  for (; i < limit; i++) {
    h = readFrameHeader(b, i);
    if (h) break;
  }
  if (!h) return null;

  // VBR 文件开头的第一帧里会写总帧数（Xing / Info 或 VBRI 头）
  const xing = i + 4 + h.sideInfo;
  const tag = ascii(b, xing, 4);
  if ((tag === 'Xing' || tag === 'Info') && (b[xing + 7] & 0x01)) {
    const frames = u32be(b, xing + 8);
    if (frames > 0) return (frames * h.samplesPerFrame) / h.sampleRate;
  }
  if (ascii(b, i + 36, 4) === 'VBRI') {
    const frames = u32be(b, i + 36 + 14);
    if (frames > 0) return (frames * h.samplesPerFrame) / h.sampleRate;
  }

  // 没有 VBR 头：按固定码率估算
  return ((end - i) * 8) / h.bitrate;
}

// =========================================================
// M4A / MP4：由一层层「盒子（box）」组成
// =========================================================

/** 在 [start, end) 范围里找名为 name 的子盒子，返回它内容的范围 */
function findBox(b, start, end, name) {
  for (const box of boxes(b, start, end)) if (box.type === name) return box;
  return null;
}

function* boxes(b, start, end) {
  let pos = start;
  while (pos + 8 <= end) {
    let size = u32be(b, pos);
    const type = ascii(b, pos + 4, 4);
    let header = 8;
    if (size === 1) { // 64 位长度
      size = u32be(b, pos + 8) * 2 ** 32 + u32be(b, pos + 12);
      header = 16;
    } else if (size === 0) {
      size = end - pos; // 一直到结尾
    }
    if (size < header || pos + size > end) return;
    yield { type, start: pos + header, end: pos + size };
    pos += size;
  }
}

function parseMP4(b) {
  const out = {};
  const moov = findBox(b, 0, b.length, 'moov');
  if (!moov) return out;

  // 时长：moov > mvhd
  const mvhd = findBox(b, moov.start, moov.end, 'mvhd');
  if (mvhd) {
    const v = b[mvhd.start];
    const timescale = v === 1 ? u32be(b, mvhd.start + 20) : u32be(b, mvhd.start + 12);
    const duration = v === 1
      ? u32be(b, mvhd.start + 24) * 2 ** 32 + u32be(b, mvhd.start + 28)
      : u32be(b, mvhd.start + 16);
    if (timescale > 0) out.duration = duration / timescale;
  }

  // 标签：moov > udta > meta > ilst
  const udta = findBox(b, moov.start, moov.end, 'udta');
  const meta = udta && findBox(b, udta.start, udta.end, 'meta');
  if (!meta) return out;
  // 标准的 meta 盒子开头有 4 字节版本号；QuickTime 风格的没有
  const metaStart = ascii(b, meta.start + 4, 4) === 'hdlr' ? meta.start : meta.start + 4;
  const ilst = findBox(b, metaStart, meta.end, 'ilst');
  if (!ilst) return out;

  for (const item of boxes(b, ilst.start, ilst.end)) {
    const data = findBox(b, item.start, item.end, 'data');
    if (!data) continue;
    const kind = u32be(b, data.start) & 0xffffff; // 1=文字，13=JPEG，14=PNG
    const payload = b.subarray(data.start + 8, data.end);

    switch (item.type) {
      case '©nam': out.title ??= clean(UTF8.decode(payload)); break;
      case '©ART': out.artist ??= clean(UTF8.decode(payload)); break;
      case 'aART': out.albumArtist = clean(UTF8.decode(payload)); break;
      case '©alb': out.album ??= clean(UTF8.decode(payload)); break;
      case 'covr':
        if (!out.cover && payload.length > 4) {
          out.cover = { data: payload, mime: sniffImage(payload, kind === 14 ? 'image/png' : 'image/jpeg') };
        }
        break;
    }
  }
  out.artist ??= out.albumArtist ?? null;
  return out;
}

// =========================================================
// FLAC：若干个「元数据块」
// =========================================================

function parseFLAC(b) {
  const out = {};
  let pos = 4;
  while (pos + 4 <= b.length) {
    const isLast = b[pos] & 0x80;
    const type = b[pos] & 0x7f;
    const len = u24be(b, pos + 1);
    const block = b.subarray(pos + 4, pos + 4 + len);

    if (type === 0 && block.length >= 18) { // STREAMINFO：采样率 + 总采样数
      const sampleRate = (block[10] << 12) | (block[11] << 4) | (block[12] >> 4);
      const totalSamples = (block[13] & 0x0f) * 2 ** 32 + u32be(block, 14);
      if (sampleRate > 0 && totalSamples > 0) out.duration = totalSamples / sampleRate;
    } else if (type === 4) { // VORBIS_COMMENT：KEY=value 形式的标签（小端序）
      let p = 4 + u32le(block, 0); // 跳过 vendor 字符串
      const count = u32le(block, p);
      p += 4;
      for (let i = 0; i < count && p + 4 <= block.length; i++) {
        const n = u32le(block, p);
        const text = UTF8.decode(block.subarray(p + 4, p + 4 + n));
        p += 4 + n;
        const eq = text.indexOf('=');
        const key = text.slice(0, eq).toUpperCase();
        const value = clean(text.slice(eq + 1));
        if (key === 'TITLE') out.title ??= value;
        else if (key === 'ARTIST') out.artist ??= value;
        else if (key === 'ALBUM') out.album ??= value;
      }
    } else if (type === 6 && !out.cover) { // PICTURE（大端序）
      let p = 4;
      const mimeLen = u32be(block, p); p += 4;
      const mime = ascii(block, p, mimeLen); p += mimeLen;
      const descLen = u32be(block, p); p += 4 + descLen;
      p += 16; // 宽、高、色深、颜色数
      const dataLen = u32be(block, p); p += 4;
      const data = block.subarray(p, p + dataLen);
      if (data.length > 4) out.cover = { data, mime: sniffImage(data, mime || 'image/jpeg') };
    }

    pos += 4 + len;
    if (isLast) break;
  }
  return out;
}

// =========================================================
// WAV：只能算时长（WAV 基本不带标签）
// =========================================================

function parseWAV(b) {
  let byteRate = 0;
  let pos = 12;
  while (pos + 8 <= b.length) {
    const id = ascii(b, pos, 4);
    const size = u32le(b, pos + 4);
    if (id === 'fmt ') byteRate = u32le(b, pos + 8 + 8);
    if (id === 'data') {
      return { duration: byteRate > 0 ? Math.min(size, b.length - pos - 8) / byteRate : null };
    }
    pos += 8 + size + (size % 2); // 块按 2 字节对齐
  }
  return {};
}
