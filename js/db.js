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

/** 删除歌单（歌曲本身不会被删除） */
export async function deletePlaylist(id) {
  const db = await openDB();
  const tx = db.transaction('playlists', 'readwrite');
  tx.objectStore('playlists').delete(id);
  await finished(tx);
  notifyChange();
}
