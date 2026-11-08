// IndexedDB 封装：整个应用只有这个文件直接操作数据库。
// 数据结构见 docs/design.md 第 6 节。

const DB_NAME = 'songnest';
const DB_VERSION = 1;

let dbPromise = null;

/** 打开数据库（只打开一次，之后复用） */
function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      // 第一次打开、或者版本号升高时，在这里建表
      req.onupgradeneeded = () => {
        const db = req.result;
        const songs = db.createObjectStore('songs', { keyPath: 'id' });
        songs.createIndex('addedAt', 'addedAt');
        songs.createIndex('fileKey', 'fileKey', { unique: true });
        db.createObjectStore('audio', { keyPath: 'id' });
        const playlists = db.createObjectStore('playlists', { keyPath: 'id' });
        playlists.createIndex('createdAt', 'createdAt');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

/** 把 IndexedDB 的请求包装成 Promise，这样就能用 await */
function result(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** 等一个事务全部完成（写入真正落盘） */
function finished(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    // 出错时，具体原因记在出错的那个请求上（event.target），事务自己的 error 这时可能还是 null
    tx.onerror = (event) => reject(event.target.error ?? tx.error);
    tx.onabort = () => reject(tx.error ?? new DOMException('事务被中止', 'AbortError'));
  });
}

/** 生成唯一 id。crypto.randomUUID 只在 HTTPS 下可用，手机用局域网 http 访问时要退回到手动生成 */
export function newId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// ---------- 歌曲 ----------

/** 所有歌曲的元数据（不含音频），最新导入的在前 */
export async function getAllSongs() {
  const db = await openDB();
  const songs = await result(db.transaction('songs').objectStore('songs').getAll());
  return songs.sort((a, b) => b.addedAt - a.addedAt);
}

/** 这个文件（文件名 + 大小）是否已经导入过 */
export async function hasFileKey(fileKey) {
  const db = await openDB();
  const key = await result(db.transaction('songs').objectStore('songs').index('fileKey').getKey(fileKey));
  return key !== undefined;
}

/** 保存一首歌：元数据和音频在同一个事务里写入，要么都成功，要么都失败 */
export async function addSong(song, audioBlob) {
  const db = await openDB();
  const tx = db.transaction(['songs', 'audio'], 'readwrite');
  tx.objectStore('songs').add(song);
  tx.objectStore('audio').add({ id: song.id, blob: audioBlob });
  await finished(tx);
}

/** 修改一首歌的部分字段，例如补上时长：updateSong(id, { duration: 200 }) */
export async function updateSong(id, patch) {
  const db = await openDB();
  const tx = db.transaction('songs', 'readwrite');
  const store = tx.objectStore('songs');
  const song = await result(store.get(id));
  if (song) store.put({ ...song, ...patch });
  await finished(tx);
  return song ? { ...song, ...patch } : null;
}

/**
 * 替换一首歌的音频文件，同时更新歌曲信息（文件名、时长等）。
 * 歌曲 id 不变，所以它在所有歌单里的位置都不受影响。
 * 新文件如果已经作为另一首歌导入过，会抛出 ConstraintError。
 */
export async function replaceSongAudio(id, audioBlob, patch) {
  const db = await openDB();
  const tx = db.transaction(['songs', 'audio'], 'readwrite');
  const songs = tx.objectStore('songs');
  const song = await result(songs.get(id));
  if (!song) throw new Error('歌曲不存在');
  const updated = { ...song, ...patch };
  songs.put(updated);
  tx.objectStore('audio').put({ id, blob: audioBlob });
  await finished(tx);
  return updated;
}

/**
 * 从歌曲库删除一首歌：歌曲信息、音频文件一起删，并从所有歌单里移除。
 * 三张表在同一个事务里修改，不会出现「歌删了但歌单里还留着」的情况。
 */
export async function deleteSong(id) {
  const db = await openDB();
  const tx = db.transaction(['songs', 'audio', 'playlists'], 'readwrite');
  tx.objectStore('songs').delete(id);
  tx.objectStore('audio').delete(id);
  const playlists = tx.objectStore('playlists');
  for (const p of await result(playlists.getAll())) {
    if (p.songIds.includes(id)) {
      playlists.put({ ...p, songIds: p.songIds.filter((s) => s !== id), updatedAt: Date.now() });
    }
  }
  await finished(tx);
  notifyChange();
}

/** 读取一首歌的音频文件（播放时用） */
export async function getAudio(id) {
  const db = await openDB();
  const row = await result(db.transaction('audio').objectStore('audio').get(id));
  return row?.blob ?? null;
}

/** 按 id 列表读取多首歌，保持列表顺序；已经不存在的歌会被跳过 */
export async function getSongsByIds(ids) {
  const db = await openDB();
  const store = db.transaction('songs').objectStore('songs');
  const songs = await Promise.all(ids.map((id) => result(store.get(id))));
  return songs.filter(Boolean);
}

// ---------- 歌单 ----------
// 每次修改歌单后都会发出 'library:change' 事件，让页面自动刷新。

function notifyChange() {
  window.dispatchEvent(new Event('library:change'));
}

/** 所有歌单，先建的在前 */
export async function getAllPlaylists() {
  const db = await openDB();
  const list = await result(db.transaction('playlists').objectStore('playlists').getAll());
  return list.sort((a, b) => a.createdAt - b.createdAt);
}

export async function getPlaylist(id) {
  const db = await openDB();
  return (await result(db.transaction('playlists').objectStore('playlists').get(id))) ?? null;
}

export async function createPlaylist(name) {
  const now = Date.now();
  const playlist = { id: newId(), name, songIds: [], createdAt: now, updatedAt: now };
  const db = await openDB();
  const tx = db.transaction('playlists', 'readwrite');
  tx.objectStore('playlists').add(playlist);
  await finished(tx);
  notifyChange();
  return playlist;
}

/**
 * 修改歌单的通用函数：在同一个事务里「读出 → 修改 → 写回」，
 * 避免两处同时修改时互相覆盖。change 函数接收旧歌单，返回新歌单。
 */
async function updatePlaylist(id, change) {
  const db = await openDB();
  const tx = db.transaction('playlists', 'readwrite');
  const store = tx.objectStore('playlists');
  const old = await result(store.get(id));
  if (!old) throw new Error('歌单不存在');
  const updated = { ...change(old), updatedAt: Date.now() };
  store.put(updated);
  await finished(tx);
  notifyChange();
  return updated;
}

export function renamePlaylist(id, name) {
  return updatePlaylist(id, (p) => ({ ...p, name }));
}

/** 把歌加到歌单末尾，已经在歌单里的会跳过。返回实际新加了几首 */
export async function addSongsToPlaylist(id, songIds) {
  let added = 0;
  await updatePlaylist(id, (p) => {
    const existing = new Set(p.songIds);
    const extra = [...new Set(songIds)].filter((s) => !existing.has(s));
    added = extra.length;
    return { ...p, songIds: [...p.songIds, ...extra] };
  });
  return added;
}

export function removeSongFromPlaylist(id, songId) {
  return updatePlaylist(id, (p) => ({ ...p, songIds: p.songIds.filter((s) => s !== songId) }));
}

/** 把第 from 首移到第 to 的位置 */
export function moveSongInPlaylist(id, from, to) {
  return updatePlaylist(id, (p) => {
    const ids = [...p.songIds];
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    return { ...p, songIds: ids };
  });
}

// ---------- 备份与恢复 ----------

/** 取出备份需要的全部数据：歌曲（带音频）和歌单。音频是 Blob，不会一次全读进内存 */
export async function getEverythingForBackup() {
  const songs = await getAllSongs();
  const withAudio = [];
  for (const song of songs) withAudio.push({ ...song, audio: await getAudio(song.id) });
  return { songs: withAudio, playlists: await getAllPlaylists() };
}

/**
 * 从备份恢复：已经有的歌（同一个 id，或者同一个文件）跳过，没有的加进来；
 * 歌单按 id 合并：已有的歌单补上缺的歌，没有的歌单整个加进来。
 * onProgress(done, total) 用来显示进度。返回 { added, skipped, playlistsAdded, playlistsMerged }
 */
export async function restoreFromBackup({ songs, playlists }, onProgress = () => {}) {
  const db = await openDB();
  const summary = { added: 0, skipped: 0, playlistsAdded: 0, playlistsMerged: 0 };
  const idMap = new Map(); // 备份里的歌曲 id → 歌曲库里实际的 id（同一个文件已经以别的 id 存在时会不同）

  for (const [i, { audio, ...song }] of songs.entries()) {
    onProgress(i, songs.length);
    const [existing] = await getSongsByIds([song.id]);
    const sameFile = existing ? null : await result(db.transaction('songs').objectStore('songs').index('fileKey').get(song.fileKey));
    if (existing || sameFile) {
      idMap.set(song.id, (existing ?? sameFile).id);
      summary.skipped++;
      continue;
    }
    if (!audio) continue;
    // 先把音频从备份文件里读出来，再写入数据库。
    // （IndexedDB 存「文件切片」在部分浏览器上不可靠，存一份独立的 Blob 最稳）
    const blob = new Blob([await audio.arrayBuffer()], { type: audio.type || song.mimeType });
    const cover = song.cover ? new Blob([await song.cover.arrayBuffer()], { type: song.cover.type }) : null;
    await addSong({ ...song, cover }, blob);
    idMap.set(song.id, song.id);
    summary.added++;
  }
  onProgress(songs.length, songs.length);

  for (const p of playlists) {
    const songIds = [...new Set(p.songIds.map((id) => idMap.get(id)).filter(Boolean))];
    const current = await getPlaylist(p.id);
    if (current) {
      const missing = songIds.filter((id) => !current.songIds.includes(id));
      if (missing.length) {
        await updatePlaylist(p.id, (old) => ({ ...old, songIds: [...old.songIds, ...missing] }));
        summary.playlistsMerged++;
      }
    } else {
      const tx = db.transaction('playlists', 'readwrite');
      tx.objectStore('playlists').add({ ...p, songIds });
      await finished(tx);
      summary.playlistsAdded++;
    }
  }

  notifyChange();
  return summary;
}

/** 删除歌单（歌曲本身不会被删除） */
export async function deletePlaylist(id) {
  const db = await openDB();
  const tx = db.transaction('playlists', 'readwrite');
  tx.objectStore('playlists').delete(id);
  await finished(tx);
  notifyChange();
}
