// 播放器：整个应用只有这个文件直接操作 <audio>。
// 界面通过下面导出的函数控制播放，通过监听事件得知变化：
//   'player:change'  歌曲、播放/暂停、模式等状态变了（detail 是 getState() 的结果）
//   'player:time'    播放进度变了（每秒触发几次）
//   'player:error'   某首歌无法播放
import { getAudio, updateSong } from './db.js';

const audio = new Audio();
audio.preload = 'auto';

/** 播放模式，按「循环切换」的顺序排列。规则见 docs/design.md 第 9 节 */
export const MODES = ['loop', 'one', 'shuffle', 'order'];
export const MODE_LABELS = { loop: '列表循环', one: '单曲循环', shuffle: '随机播放', order: '顺序播放' };
const MODE_KEY = 'songnest.mode';

// 队列的两层结构：
//   queue  —— 歌曲本身，保持用户看到的顺序（歌曲库或歌单的顺序）
//   order  —— 播放顺序，是 queue 的下标数组。普通模式下是 [0,1,2,...]，随机模式下被打乱
//   pos    —— 当前播到 order 里的第几个
// 所以当前歌曲是 queue[order[pos]]。这样切换随机模式时不用改动 queue。
let queue = [];
let order = [];
let pos = -1;
let mode = loadMode();

let objectURL = null; // 当前歌曲的临时网址，换歌时要释放
let loadToken = 0;    // 用来丢弃过期的加载（用户连续快速点了好几首歌）
let loading = false;  // 正在从数据库读取新歌
let wantPlay = false; // 读完之后要不要自动播放（读取期间用户可能按了暂停）
let unlocked = false;

// ---------- 对外接口 ----------

function currentSong() {
  return queue[order[pos]] ?? null;
}

/** 当前状态的快照 */
export function getState() {
  const song = currentSong();
  return {
    song,
    // 读取新歌期间，按「用户想不想播放」显示，避免播放按钮闪一下
    playing: Boolean(song) && (loading ? wantPlay : !audio.paused),
    currentTime: song ? audio.currentTime || 0 : 0,
    duration: song ? (Number.isFinite(audio.duration) ? audio.duration : song.duration ?? 0) : 0,
    mode,
    // 只有「顺序播放」到了最后一首时，才没有下一首
    hasNext: Boolean(song) && (mode !== 'order' || pos < order.length - 1),
    position: pos + 1,
    total: queue.length,
  };
}

/**
 * 把一组歌曲作为播放队列，从第 start 首开始播放。
 * 必须在点击事件里直接调用（iOS 要求播放由用户操作触发）。
 */
export function playQueue(songs, start = 0) {
  unlock();
  queue = [...songs];
  buildOrder(start);
  return load(true);
}

/** 切换到随机模式，并从随机的一首开始播放（歌单页的「随机」按钮） */
export function playShuffled(songs) {
  setMode('shuffle', { silent: true });
  return playQueue(songs, Math.floor(Math.random() * songs.length));
}

/** 播放 / 暂停 */
export function toggle() {
  if (!currentSong()) return;
  unlock();
  if (loading) {
    // 新歌还没读完：只记下用户的意思，读完后按这个决定播不播
    wantPlay = !wantPlay;
    emit();
    return;
  }
  if (audio.paused) audio.play().catch(reportError);
  else audio.pause();
}

/**
 * 下一首。
 * @param {boolean} auto 是不是一首歌自然放完后自动调用的
 */
export function next(auto = false) {
  if (!currentSong()) return;
  if (!auto) unlock();

  if (pos < order.length - 1) {
    pos++;
  } else if (mode === 'order') {
    emit(); // 顺序播放：最后一首放完就停下
    return;
  } else if (mode === 'shuffle') {
    // 随机：一轮放完，重新打乱再来一轮（尽量不让刚放完的歌马上又是第一首）
    const last = order[pos];
    order = shuffledIndexes(queue.length, last);
    pos = 0;
  } else {
    pos = 0; // 列表循环、单曲循环：回到第一首
  }
  return load(true);
}

/** 上一首：当前歌已经放了 3 秒以上时，先回到这首歌的开头 */
export function prev() {
  if (!currentSong()) return;
  unlock();

  if (loading) return; // 新歌还没读完，忽略
  if (audio.currentTime > 3 || order.length === 1) {
    audio.currentTime = 0;
    if (audio.paused) audio.play().catch(reportError);
    return;
  }
  if (pos > 0) {
    pos--;
  } else if (mode === 'loop' || mode === 'one') {
    pos = order.length - 1; // 第一首再往前，绕到最后一首
  } else {
    audio.currentTime = 0; // 随机、顺序模式下没有「更前面」了，回到开头
    return;
  }
  return load(true);
}

/** 跳到第 seconds 秒 */
export function seek(seconds) {
  if (currentSong() && Number.isFinite(seconds)) audio.currentTime = seconds;
}

/** 切换到下一种播放模式，返回新模式 */
export function cycleMode() {
  const nextMode = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
  setMode(nextMode);
  return nextMode;
}

function setMode(newMode, { silent = false } = {}) {
  if (!MODES.includes(newMode)) return;
  const wasShuffle = mode === 'shuffle';
  mode = newMode;
  audio.loop = mode === 'one'; // 单曲循环交给浏览器自己处理，最可靠

  // 进入或离开随机模式时，重新排播放顺序，但当前这首歌保持不变
  if (queue.length && wasShuffle !== (mode === 'shuffle')) {
    buildOrder(order[pos]);
  }
  try { localStorage.setItem(MODE_KEY, mode); } catch { /* 隐私模式下可能无法保存，忽略 */ }
  if (!silent) emit();
}

// ---------- 内部实现 ----------

function loadMode() {
  try {
    const saved = localStorage.getItem(MODE_KEY);
    if (MODES.includes(saved)) return saved;
  } catch { /* 读不到就用默认值 */ }
  return 'loop';
}

/** 根据当前模式生成播放顺序，并让 startIndex 这首成为当前歌曲 */
function buildOrder(startIndex) {
  if (mode === 'shuffle') {
    // 当前歌放在第一位，其余的打乱排在后面
    order = [startIndex, ...shuffledIndexes(queue.length).filter((i) => i !== startIndex)];
    pos = 0;
  } else {
    order = queue.map((_, i) => i);
    pos = startIndex;
  }
}

/** 0..n-1 打乱后的数组（Fisher–Yates 洗牌）。avoidFirst：尽量不让这个下标排在第一位 */
function shuffledIndexes(n, avoidFirst = -1) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  if (n > 1 && a[0] === avoidFirst) [a[0], a[1]] = [a[1], a[0]];
  return a;
}

/** 读取当前歌曲的音频文件并开始播放 */
async function load(autoplay) {
  const token = ++loadToken;
  const song = currentSong();
  loading = true;
  wantPlay = autoplay;
  // 换歌时旧歌立刻停下。但不要打断刚开始的「解锁静音」，那是 iOS 允许播放的关键
  if (objectURL && audio.src === objectURL) audio.pause();
  emit(); // 先让界面立刻显示新歌名，不用等文件读完

  const blob = await getAudio(song.id);
  if (token !== loadToken) return; // 读取期间用户又换了歌，放弃这次
  loading = false;
  if (!blob) {
    reportError(new Error('找不到音频文件'));
    return;
  }

  if (objectURL) URL.revokeObjectURL(objectURL);
  objectURL = URL.createObjectURL(blob);
  audio.src = objectURL;
  audio.loop = mode === 'one';

  if (wantPlay) {
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
  window.dispatchEvent(new CustomEvent('player:error', { detail: { song: currentSong(), error } }));
}

// ---------- 监听 <audio> 自己的事件 ----------

for (const type of ['play', 'pause', 'emptied']) audio.addEventListener(type, emit);

audio.addEventListener('timeupdate', () => {
  window.dispatchEvent(new CustomEvent('player:time', { detail: getState() }));
});

// 一首自然放完（单曲循环时 audio.loop 为 true，不会触发这个事件）
audio.addEventListener('ended', () => next(true));

// 导入时没算出时长（或算得不准）的歌，播放时用浏览器给出的真实时长补上
audio.addEventListener('loadedmetadata', () => {
  const song = currentSong();
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
