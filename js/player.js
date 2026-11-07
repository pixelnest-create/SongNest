// 播放器：整个应用只有这个文件直接操作 <audio>。
// 界面通过下面导出的函数控制播放，通过监听事件得知变化：
//   'player:change'  歌曲、播放/暂停等状态变了（detail 是 getState() 的结果）
//   'player:time'    播放进度变了（每秒触发几次）
//   'player:error'   某首歌无法播放
import { getAudio, updateSong } from './db.js';

const audio = new Audio();
audio.preload = 'auto';

let queue = [];       // 播放队列：歌曲对象数组
let index = -1;       // 当前播放的是队列里的第几首
let objectURL = null; // 当前歌曲的临时网址，换歌时要释放
let loadToken = 0;    // 用来丢弃过期的加载（用户连续快速点了好几首歌）
let unlocked = false;

// ---------- 对外接口 ----------

/** 当前状态的快照 */
export function getState() {
  const song = queue[index] ?? null;
  return {
    song,
    playing: Boolean(song) && !audio.paused,
    currentTime: song ? audio.currentTime || 0 : 0,
    duration: song ? (Number.isFinite(audio.duration) ? audio.duration : song.duration ?? 0) : 0,
    hasNext: index < queue.length - 1,
  };
}

/**
 * 把一组歌曲作为播放队列，从第 start 首开始播放。
 * 必须在点击事件里直接调用（iOS 要求播放由用户操作触发）。
 */
export function playQueue(songs, start = 0) {
  unlock();
  queue = [...songs];
  index = start;
  return load(true);
}

/** 播放 / 暂停 */
export function toggle() {
  if (!queue[index]) return;
  unlock();
  if (audio.paused) audio.play().catch(reportError);
  else audio.pause();
}

/** 下一首 */
export function next() {
  if (index >= queue.length - 1) return;
  unlock();
  index++;
  return load(true);
}

/** 跳到第 seconds 秒 */
export function seek(seconds) {
  if (queue[index] && Number.isFinite(seconds)) audio.currentTime = seconds;
}

// ---------- 内部实现 ----------

/** 读取当前歌曲的音频文件并开始播放 */
async function load(autoplay) {
  const token = ++loadToken;
  const song = queue[index];
  emit(); // 先让界面立刻显示新歌名，不用等文件读完

  const blob = await getAudio(song.id);
  if (token !== loadToken) return; // 读取期间用户又换了歌，放弃这次
  if (!blob) {
    reportError(new Error('找不到音频文件'));
    return;
  }

  if (objectURL) URL.revokeObjectURL(objectURL);
  objectURL = URL.createObjectURL(blob);
  audio.src = objectURL;

  if (autoplay) {
    try {
      await audio.play();
    } catch (err) {
      // AbortError 表示还没开始播就被换歌打断了，属于正常情况
      if (err.name !== 'AbortError') reportError(err);
    }
  }
  emit();
}

/**
 * iOS 解锁：iOS 只允许在用户点击的那一刻开始播放。
 * 但我们要先从数据库读文件（需要等待），等读完时「点击的那一刻」已经过去了。
 * 解决办法：点击时先用同一个 <audio> 播一段静音，这个元素就被「解锁」了，
 * 之后再让它播放别的内容就不会被拦截。
 */
function unlock() {
  if (unlocked) return;
  unlocked = true;
  const silence = silentWavURL();
  audio.src = silence;
  audio.play().then(() => {
    if (audio.src === silence) audio.pause();
  }).catch(() => {});
}

/** 生成一段 0.1 秒的静音 WAV */
function silentWavURL() {
  const n = 800;
  const buf = new ArrayBuffer(44 + n);
  const v = new DataView(buf);
  const text = (offset, s) => [...s].forEach((c, i) => v.setUint8(offset + i, c.charCodeAt(0)));
  text(0, 'RIFF'); v.setUint32(4, 36 + n, true); text(8, 'WAVE');
  text(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  text(36, 'data'); v.setUint32(40, n, true);
  new Uint8Array(buf, 44).fill(128); // 8 位 PCM 的「静音」是 128
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

function emit() {
  window.dispatchEvent(new CustomEvent('player:change', { detail: getState() }));
}

function reportError(error) {
  console.error('播放出错：', error);
  window.dispatchEvent(new CustomEvent('player:error', { detail: { song: queue[index] ?? null, error } }));
}

// ---------- 监听 <audio> 自己的事件 ----------

for (const type of ['play', 'pause', 'emptied']) audio.addEventListener(type, emit);

audio.addEventListener('timeupdate', () => {
  window.dispatchEvent(new CustomEvent('player:time', { detail: getState() }));
});

// 一首播完：自动接下一首；已经是最后一首就停下
audio.addEventListener('ended', () => {
  if (index < queue.length - 1) next();
  else emit();
});

// 导入时没算出时长（或算得不准）的歌，播放时用浏览器给出的真实时长补上
audio.addEventListener('loadedmetadata', () => {
  const song = queue[index];
  const real = audio.duration;
  if (!song || !Number.isFinite(real)) return;
  if (song.duration == null || Math.abs(song.duration - real) > 1) {
    song.duration = real;
    updateSong(song.id, { duration: real })
      .then(() => window.dispatchEvent(new Event('library:change')))
      .catch(console.error);
  }
  emit();
});

audio.addEventListener('error', () => {
  if (objectURL && audio.src === objectURL) reportError(audio.error ?? new Error('无法解码'));
});
