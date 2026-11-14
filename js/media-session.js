// 锁屏控制：通过 Media Session API 告诉系统「正在播放什么」，
// 并接收锁屏界面、控制中心、耳机按钮的操作。
// iPhone 锁屏、控制中心，电脑浏览器的媒体控制面板都会用到这些信息。
import { getState, next, pause, play, prev, seek } from './player.js';
import { toneFor } from './ui.js';

const supported = 'mediaSession' in navigator;

/** 系统按钮 → 播放器函数。导出是为了方便测试 */
export const actions = {
  play: () => play(),
  pause: () => pause(),
  stop: () => pause(),
  previoustrack: () => prev(),
  nexttrack: () => next(),
  seekto: (details) => seek(details.seekTime),
};

export function setupMediaSession() {
  if (!supported) return;

  for (const [action, handler] of Object.entries(actions)) {
    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch {
      // 某些浏览器不支持其中一些按钮，忽略即可
    }
  }
  // 明确不提供「快退 / 快进 10 秒」，这样 iPhone 锁屏上显示的是「上一首 / 下一首」
  for (const action of ['seekbackward', 'seekforward']) {
    try { navigator.mediaSession.setActionHandler(action, null); } catch { /* 忽略 */ }
  }

  // 告诉系统的信息有变化（换歌、编辑了歌名歌手、换了封面）时才更新
  let shownKey;
  // 封面换成了另一张图（key 里只记了「有没有封面」）：下次一定更新
  window.addEventListener('cover:change', (e) => {
    if (shownKey?.startsWith(`${e.detail.songId}|`)) shownKey = null;
  });
  window.addEventListener('player:change', async (e) => {
    const state = e.detail;
    const { song } = state;
    const key = song && [song.id, song.title, song.artist, song.album, Boolean(song.cover)].join('|');
    if (song && key !== shownKey) {
      shownKey = key;
      await updateMetadata(song);
    }
    if (!song && shownKey) {
      // 没有歌了（比如正在播放的歌被删除、队列空了）：锁屏界面不再显示
      shownKey = null;
      navigator.mediaSession.metadata = null;
    }
    navigator.mediaSession.playbackState = !state.song ? 'none' : state.playing ? 'playing' : 'paused';
    updatePosition(state);
  });
}

async function updateMetadata(song) {
  const src = song.cover instanceof Blob ? await toDataURL(song.id, song.cover) : placeholderArtwork(toneFor(song.id));
  if (getState().song?.id !== song.id) return; // 准备封面期间已经换歌了
  navigator.mediaSession.metadata = new MediaMetadata({
    title: song.title,
    artist: song.artist ?? '未知歌手',
    album: song.album ?? 'SongNest',
    artwork: [{ src, sizes: '300x300', type: 'image/jpeg' }],
  });
}

/** 告诉系统当前进度，锁屏上的进度条才会走动、才能拖动 */
function updatePosition({ song, duration, currentTime }) {
  if (!song || !navigator.mediaSession.setPositionState) return;
  if (!(duration > 0) || !Number.isFinite(duration)) return;
  try {
    navigator.mediaSession.setPositionState({
      duration,
      position: Math.min(Math.max(0, currentTime), duration),
      playbackRate: 1, // 暂停状态由 playbackState 表示
    });
  } catch {
    // 参数不合法时浏览器会报错，忽略这一次即可
  }
}

// ---------- 封面图 ----------

const dataURLCache = new Map(); // 歌曲 id → data: 网址（每次从数据库读出的 Blob 都是新对象，所以用 id 做键）
window.addEventListener('cover:change', (e) => dataURLCache.delete(e.detail.songId));

/**
 * Blob → data: 网址。
 * 用 data: 而不是 blob: 网址，因为 iPhone 锁屏有时显示不出 blob: 网址的图片。
 * 封面已经压缩到 300px，转出来只有几十 KB。
 */
function toDataURL(songId, blob) {
  if (!dataURLCache.has(songId)) {
    dataURLCache.set(songId, new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    }));
  }
  return dataURLCache.get(songId);
}

const PLACEHOLDER_COLORS = { 1: '#F6D9B8', 2: '#E6D3C6', 3: '#D8E3CF' };
const placeholderCache = new Map();

/** 没有封面的歌：画一张「暖色底 + 音符」的图，和应用里的占位封面一致 */
function placeholderArtwork(tone) {
  if (!placeholderCache.has(tone)) {
    const size = 300;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = PLACEHOLDER_COLORS[tone];
    ctx.fillRect(0, 0, size, size);
    // 音符图标（和 icons.js 里的 music 一样），放大到 120px 画在中间
    ctx.translate(90, 90);
    ctx.scale(5, 5);
    ctx.strokeStyle = '#7D6A58';
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const d of ['M3 17a3 3 0 1 0 6 0a3 3 0 0 0 -6 0', 'M13 17a3 3 0 1 0 6 0a3 3 0 0 0 -6 0', 'M9 17v-13h10v13', 'M9 8h10']) {
      ctx.stroke(new Path2D(d));
    }
    placeholderCache.set(tone, canvas.toDataURL('image/jpeg', 0.9));
  }
  return placeholderCache.get(tone);
}
