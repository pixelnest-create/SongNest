// 备份文件格式：把所有歌曲（含音频、封面）和歌单打包成一个文件，以及把它解开。
//
// 文件结构：
//   [8 字节 "SONGNEST"] [4 字节 格式版本] [4 字节 目录长度]
//   [目录：JSON 文本，记录每首歌的信息、歌单，以及每段数据在文件里的位置]
//   [数据：歌曲 1 的音频][歌曲 1 的封面][歌曲 2 的音频]……
//
// 目录在前、数据在后：恢复时先读目录，再按位置一首一首取出音频，
// 不需要把整个文件（可能好几百 MB）一次读进内存。
//
// 这个模块只处理 Blob，不碰数据库和页面，可以直接在 Node.js 里测试（tests/backup.test.mjs）。

const MAGIC = 'SONGNEST';
const FORMAT_VERSION = 1;
const HEADER_SIZE = 16;

export const BACKUP_EXTENSION = '.songnest';

export class BackupError extends Error {}

/**
 * 生成备份文件。
 * @param {{ songs: Array<object & { audio: Blob, cover: Blob|null }>, playlists: object[] }} data
 * @returns {Blob}
 */
export function buildBackup({ songs, playlists }) {
  const parts = []; // 数据部分，按顺序排列
  let offset = 0;
  const place = (blob) => {
    if (!(blob instanceof Blob)) return null;
    const entry = { offset, length: blob.size, type: blob.type };
    parts.push(blob);
    offset += blob.size;
    return entry;
  };

  const catalog = {
    app: 'SongNest',
    createdAt: Date.now(),
    songs: songs.map(({ audio, cover, ...info }) => ({ ...info, audio: place(audio), cover: place(cover) })),
    playlists,
  };

  const json = new TextEncoder().encode(JSON.stringify(catalog));
  const header = new Uint8Array(HEADER_SIZE);
  header.set(new TextEncoder().encode(MAGIC), 0);
  const view = new DataView(header.buffer);
  view.setUint32(8, FORMAT_VERSION);
  view.setUint32(12, json.length);

  // Blob 由多段拼成时不会真的复制数据，音频文件再大也不占额外内存
  return new Blob([header, json, ...parts], { type: 'application/octet-stream' });
}

/**
 * 解开备份文件。音频和封面是原文件的「切片」，用到时才真正读取。
 * @param {Blob} file
 * @returns {Promise<{ createdAt: number, songs: Array<object & { audio: Blob, cover: Blob|null }>, playlists: object[] }>}
 */
export async function parseBackup(file) {
  if (file.size < HEADER_SIZE) throw new BackupError('这不是 SongNest 的备份文件');
  const header = new Uint8Array(await file.slice(0, HEADER_SIZE).arrayBuffer());
  if (new TextDecoder().decode(header.subarray(0, 8)) !== MAGIC) {
    throw new BackupError('这不是 SongNest 的备份文件');
  }
  const view = new DataView(header.buffer);
  const version = view.getUint32(8);
  if (version > FORMAT_VERSION) throw new BackupError('这个备份来自更新版本的 SongNest，请先更新应用');
  const jsonLength = view.getUint32(12);
  const dataStart = HEADER_SIZE + jsonLength;
  if (dataStart > file.size) throw new BackupError('备份文件不完整');

  let catalog;
  try {
    catalog = JSON.parse(await file.slice(HEADER_SIZE, dataStart).text());
  } catch {
    throw new BackupError('备份文件已损坏');
  }

  const take = (entry) => {
    if (!entry) return null;
    const start = dataStart + entry.offset;
    if (start + entry.length > file.size) throw new BackupError('备份文件不完整');
    return file.slice(start, start + entry.length, entry.type);
  };

  return {
    createdAt: catalog.createdAt,
    songs: (catalog.songs ?? []).map((s) => ({ ...s, audio: take(s.audio), cover: take(s.cover) })),
    playlists: catalog.playlists ?? [],
  };
}

/** 文件名，例如 SongNest-备份-2026-11-07.songnest */
export function backupFileName(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `SongNest-备份-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}${BACKUP_EXTENSION}`;
}
