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
    tx.onerror = () => reject(tx.error);
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

/** 读取一首歌的音频文件（播放时用） */
export async function getAudio(id) {
  const db = await openDB();
  const row = await result(db.transaction('audio').objectStore('audio').get(id));
  return row?.blob ?? null;
}
