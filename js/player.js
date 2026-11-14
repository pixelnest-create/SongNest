// 播放器：整个应用只有这个文件直接操作 <audio>。
// 界面通过下面导出的函数控制播放，通过监听事件得知变化：
//   'player:change'  歌曲、播放/暂停、模式等状态变了（detail 是 getState() 的结果）
//   'player:time'    播放进度变了（每秒触发几次）
//   'player:error'   某首歌无法播放
import { getAudio, getSongsByIds, updateSong } from './db.js';

const audio = new Audio();
audio.preload = 'auto';

/** 播放模式，按「循环切换」的顺序排列。规则见 docs/design.md 第 9 节 */
export const MODES = ['loop', 'one', 'shuffle', 'order'];
export const MODE_LABELS = { loop: '列表循环', one: '单曲循环', shuffle: '随机播放', order: '顺序播放' };
const MODE_KEY = 'songnest.mode';
const SESSION_KEY = 'songnest.session';   // 上次的播放队列和当前歌曲
const POSITION_KEY = 'songnest.position'; // 上次播到第几秒

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
let prefetched = null; // 提前读好的下一首：{ id, url }
let prefetching = null; // 正在提前读取的那首歌的 id（避免重复读取）
let silenceURL = null;  // 一段静音的网址，第一次用到时才生成
let pausedAt = 0;       // 什么时候暂停的（判断是不是「暂停了很久」）
const STALE_PAUSE_MS = 5 * 60 * 1000; // 暂停超过 5 分钟，继续播放前先重新装一次歌
let loading = false;  // 正在从数据库读取新歌
let wantPlay = false; // 读完之后要不要自动播放（读取期间用户可能按了暂停）
let pendingSeek = null; // 音频还没加载时要跳到的位置（恢复上次进度时用），加载好后再真正跳过去
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
    // 只有 <audio> 里装的正是当前这首歌时，才用它的进度和时长（等待期间可能在播静音）
    // 「待跳转位置」只在音频还没加载时显示；音频已经能用了，就以它的真实进度为准
    currentTime: !song ? 0
      : pendingSeek != null && audio.readyState < 1 ? pendingSeek
      : audio.src === objectURL ? audio.currentTime || 0
      : pendingSeek ?? 0,
    duration: song
      ? (audio.src === objectURL && Number.isFinite(audio.duration) ? audio.duration : song.duration ?? 0)
      : 0,
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

/** 播放 / 暂停 */
export function toggle() {
  if (getState().playing) pause();
  else play();
}

/** 播放（已经在播就什么都不做）。锁屏界面的「播放」按钮用 */
export function play() {
  if (!currentSong()) return;
  unlock();
  if (loading) {
    // 新歌还没读完：只记下用户的意思，读完后按这个决定播不播
    wantPlay = true;
    emit();
    return;
  }
  if (!audio.paused) return;
  // 暂停了很久：iPhone 可能已经在后台悄悄释放了这首歌，<audio> 只剩个空壳
  // （表现为：声音从头开始，进度条却卡在中间不动、拖动也没用）。
  // 所以重新装一次这首歌，再跳回暂停时的位置
  // 只在 App 开在屏幕上时这样做：锁屏时 iPhone 不允许重新装歌，装了反而没声音，
  // 要等打开 App 才会响（v4 的问题）
  if (pausedAt && Date.now() - pausedAt > STALE_PAUSE_MS && objectURL && audio.src === objectURL
      && document.visibilityState === 'visible') {
    reloadAt(pendingSeek ?? audio.currentTime);
    return;
  }
  applyPendingSeek();
  audio.play().catch(reportError);
}

/** 暂停 */
export function pause() {
  if (!currentSong()) return;
  if (loading) {
    wantPlay = false;
    emit();
    return;
  }
  audio.pause();
}

/**
 * 下一首。
 * @param {boolean} auto 是不是一首歌自然放完后自动调用的
 */
export function next(auto = false) {
  if (!currentSong()) return;
  if (!auto) unlock();
  const before = currentSong();

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
  // 下一首还是同一首歌（队列里只有一首）：直接从头再放，不用重新从数据库读
  if (currentSong() === before && !loading && objectURL && audio.src === objectURL) {
    saveSession();
    audio.currentTime = 0;
    audio.play().catch(reportError);
    return;
  }
  return load(true);
}

/** 上一首：当前歌已经放了 3 秒以上时，先回到这首歌的开头 */
export function prev() {
  if (!currentSong()) return;
  unlock();

  if (loading) return; // 新歌还没读完，忽略
  if (getState().currentTime > 3 || order.length === 1) {
    seek(0);
    if (audio.paused) audio.play().catch(reportError);
    return;
  }
  if (pos > 0) {
    pos--;
  } else if (mode === 'loop' || mode === 'one') {
    pos = order.length - 1; // 第一首再往前，绕到最后一首
  } else {
    seek(0); // 随机、顺序模式下没有「更前面」了，回到开头
    return;
  }
  return load(true);
}

/** 跳到第 seconds 秒 */
export function seek(seconds) {
  if (!currentSong() || !Number.isFinite(seconds)) return;
  if (audio.readyState >= 1) {
    pendingSeek = null;
    audio.currentTime = seconds;
  } else {
    // 音频还没加载（比如刚恢复上次的歌、还没按播放）：先记下来，加载好再跳
    pendingSeek = seconds;
    window.dispatchEvent(new CustomEvent('player:time', { detail: getState() }));
  }
}

// ---------- 记住和恢复上次的播放 ----------

function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 存不了就算了 */ }
}
function readJSON(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}

/** 记住播放队列和当前歌曲（换歌、切换模式时调用） */
function saveSession() {
  const song = currentSong();
  if (!song) return;
  writeJSON(SESSION_KEY, {
    queueIds: queue.map((s) => s.id),
    // 随机模式下还要记住打乱后的顺序，否则恢复后「下一首」会变
    orderIds: mode === 'shuffle' ? order.map((i) => queue[i].id) : null,
    currentId: song.id,
  });
}

/** 记住播到第几秒（播放中每 5 秒一次，以及暂停、离开应用时） */
let lastPositionSave = 0;
function savePosition() {
  const song = currentSong();
  if (!song || loading) return;
  lastPositionSave = Date.now();
  writeJSON(POSITION_KEY, { id: song.id, time: getState().currentTime });
}

/**
 * 应用启动时调用：恢复上次的播放队列、当前歌曲和进度，但不自动播放
 * （iOS 和浏览器都不允许网页没经过用户点击就出声）。
 */
export async function restoreSession() {
  const saved = readJSON(SESSION_KEY);
  if (!saved?.queueIds?.length || queue.length) return;

  // 已经被删除的歌会被自动跳过
  const songs = await getSongsByIds(saved.queueIds);
  if (!songs.length || queue.length) return; // 读取期间用户已经点了别的歌

  queue = songs;
  const indexOf = new Map(songs.map((s, i) => [s.id, i]));
  if (mode === 'shuffle' && saved.orderIds) {
    const restored = saved.orderIds.map((id) => indexOf.get(id)).filter((i) => i !== undefined);
    const missing = songs.map((_, i) => i).filter((i) => !restored.includes(i));
    order = [...restored, ...missing];
  } else {
    order = songs.map((_, i) => i);
  }
  const current = indexOf.get(saved.currentId);
  pos = current === undefined ? 0 : order.indexOf(current);

  // 进度：只有当前歌曲没变时才恢复；快放完了就从头开始
  const position = readJSON(POSITION_KEY);
  const song = currentSong();
  let time = position?.id === song.id ? Number(position.time) || 0 : 0;
  if (song.duration && time > song.duration - 3) time = 0;

  load(false);
  pendingSeek = time > 0 ? time : null;
  emit();
}

/**
 * 一首歌的信息被修改后调用，让播放队列里的这首歌也换成新信息。
 * audioChanged：音频文件被替换了。如果正好是当前这首，就重新加载（从头播放）
 */
export function refreshSong(updated, { audioChanged = false } = {}) {
  let isCurrent = false;
  queue = queue.map((s, i) => {
    if (s.id !== updated.id) return s;
    if (i === order[pos]) isCurrent = true;
    return updated;
  });
  if (audioChanged && prefetched?.id === updated.id) {
    URL.revokeObjectURL(prefetched.url); // 提前读好的是旧文件，作废
    prefetched = null;
  }
  if (isCurrent && audioChanged) return load(getState().playing);
  if (isCurrent) emit();
}

/**
 * 一首歌被删除后调用：从播放队列里去掉它。
 * 正在播放的就是这首 → 接着放队列里的下一首；队列空了 → 回到「未在播放」。
 */
export function removeSong(id) {
  const removed = queue.findIndex((s) => s.id === id);
  if (removed === -1) return;
  const wasCurrent = currentSong()?.id === id;
  const wasPlaying = getState().playing;

  if (prefetched?.id === id) {
    URL.revokeObjectURL(prefetched.url);
    prefetched = null;
  }

  // 去掉这首；order 里比它大的下标都要减 1；如果它在当前位置之前，当前位置也往前挪一格
  const removedAt = order.indexOf(removed);
  queue.splice(removed, 1);
  order = order.filter((i) => i !== removed).map((i) => (i > removed ? i - 1 : i));
  if (removedAt < pos) pos--;

  if (!queue.length) {
    stopAndClear();
    return;
  }
  if (wasCurrent) {
    if (pos >= order.length) pos = 0; // 删的是最后一首：回到第一首
    load(wasPlaying);
  } else {
    saveSession();
    emit();
  }
}

/** 清空播放器：停止播放、清空队列、忘掉上次的播放记录 */
function stopAndClear() {
  loadToken++; // 作废正在进行的加载
  loading = false;
  pendingSeek = null;
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  if (objectURL) URL.revokeObjectURL(objectURL);
  objectURL = null;
  queue = [];
  order = [];
  pos = -1;
  try {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(POSITION_KEY);
  } catch { /* 忽略 */ }
  emit();
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
    saveSession();
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

/** 下一首会是哪首（不改变当前状态）。随机模式一轮结束时还没洗牌，算不出来，返回 null */
function peekNextSong() {
  if (!currentSong() || mode === 'one') return null; // 单曲循环自然放完不换歌
  if (pos < order.length - 1) return queue[order[pos + 1]];
  if (mode === 'loop') return queue[order[0]];
  return null;
}

/** 提前把下一首的音频文件从数据库读出来，准备好网址 */
async function prefetchNext() {
  const song = peekNextSong();
  if (!song || prefetched?.id === song.id || prefetching === song.id || song.id === currentSong()?.id) return;
  prefetching = song.id;
  const blob = await getAudio(song.id).catch(() => null);
  if (prefetching === song.id) prefetching = null;
  if (!blob || peekNextSong()?.id !== song.id) return; // 读完时「下一首」已经变了
  if (prefetched) URL.revokeObjectURL(prefetched.url);
  prefetched = { id: song.id, url: URL.createObjectURL(blob) };
}

/** 读取当前歌曲的音频文件并开始播放 */
async function load(autoplay) {
  const token = ++loadToken;
  const song = currentSong();
  loading = true;
  wantPlay = autoplay;
  pendingSeek = null;
  // 换歌时旧歌立刻停下。但不要打断刚开始的「解锁静音」，那是 iOS 允许播放的关键
  if (objectURL && audio.src === objectURL) audio.pause();
  saveSession();
  emit(); // 先让界面立刻显示新歌名，不用等文件读完

  let url;
  if (prefetched?.id === song.id) {
    // 下一首已经提前读好了：直接用，中间没有任何等待。
    // 锁屏时一首歌放完，iOS 只给很短的时间切到下一首，有等待就可能被系统停掉
    url = prefetched.url;
    prefetched = null;
  } else {
    // 下一首没提前读好，要等数据库。锁屏或在别的 App 时，这段没有声音的空档
    // 可能让 iOS 以为播放结束了、把应用挂起，于是歌就停了。先播静音把这段空档撑住
    if (autoplay && document.visibilityState === 'hidden') playSilence();
    const blob = await getAudio(song.id).catch(() => null);
    if (token !== loadToken) return; // 读取期间用户又换了歌，放弃这次
    if (!blob) {
      loading = false;
      if (audio.src === silenceURL) audio.pause();
      reportError(new Error('找不到音频文件'));
      return;
    }
    url = URL.createObjectURL(blob);
  }
  loading = false;

  if (objectURL && objectURL !== url) URL.revokeObjectURL(objectURL);
  objectURL = url;
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
  // 已经装好了一首真正的歌（比如恢复了上次的歌）：接下来对它调用 play() 本身就能解锁，
  // 不要用静音把它换掉
  if (objectURL && audio.src === objectURL) return;
  const silence = getSilenceURL();
  audio.src = silence;
  audio.play().then(() => {
    if (audio.src === silence) audio.pause();
  }).catch(() => {});
}

/** 重新装一次当前这首歌，从第 time 秒开始播放（音频加载好后由 applyPendingSeek 跳过去） */
function reloadAt(time) {
  pendingSeek = Number.isFinite(time) && time > 0 ? time : null;
  pausedAt = 0;
  audio.src = objectURL; // 即使网址一样，重新赋值也会让 <audio> 从头加载
  audio.loop = mode === 'one';
  audio.play().catch((err) => {
    if (err.name !== 'AbortError') reportError(err);
  });
  emit();
}

/** 音频已经能用了，就把记下的「待跳转位置」真正跳过去 */
function applyPendingSeek() {
  if (pendingSeek == null || audio.src !== objectURL || audio.readyState < 1) return;
  const time = pendingSeek;
  pendingSeek = null;
  audio.currentTime = time;
}

/** 循环播放静音，直到换成真正的歌（load 里会重新设置 src 和 loop） */
function playSilence() {
  audio.src = getSilenceURL();
  audio.loop = true;
  audio.play().catch(() => {});
}

function getSilenceURL() {
  if (!silenceURL) silenceURL = silentWavURL();
  return silenceURL;
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

for (const type of ['play', 'pause', 'emptied', 'seeked']) audio.addEventListener(type, emit);

// 一首歌开始播放后，趁空闲提前读好下一首
audio.addEventListener('playing', () => {
  applyPendingSeek(); // 保险：万一 loadedmetadata 时没跳成功
  if (audio.src === objectURL) prefetchNext();
});

audio.addEventListener('pause', () => {
  if (audio.src === objectURL) pausedAt = Date.now();
});
audio.addEventListener('play', () => { pausedAt = 0; });

// 看门狗：明明在播放，进度却 3 秒都没动，说明 <audio> 卡死了（iPhone 后台久了偶尔会这样）。
// 重新装一次这首歌，从卡住的位置接着放。30 秒内最多补救一次，避免反复重来。
// 只在 App 开在屏幕上时检查：锁屏时按「继续」，iPhone 恢复出声可能要好几秒，
// 这时重新装歌会被系统拦下，反而彻底没声音
let lastTime = -1;
let lastMoveAt = 0;
let lastRescueAt = 0;
setInterval(() => {
  if (audio.paused || loading || audio.seeking || !objectURL || audio.src !== objectURL
      || document.visibilityState !== 'visible') {
    lastTime = -1;
    return;
  }
  const now = Date.now();
  if (audio.currentTime !== lastTime) {
    lastTime = audio.currentTime;
    lastMoveAt = now;
    return;
  }
  if (now - lastMoveAt > 3000 && now - lastRescueAt > 30000) {
    lastRescueAt = now;
    console.warn('播放卡住了，重新加载这首歌');
    reloadAt(pendingSeek ?? audio.currentTime);
  }
}, 1000);

audio.addEventListener('timeupdate', () => {
  applyPendingSeek();
  window.dispatchEvent(new CustomEvent('player:time', { detail: getState() }));
  if (!audio.paused && Date.now() - lastPositionSave > 5000) savePosition();
  // 补救：锁屏时 'playing' 事件有时不来，或者上次提前读取失败了，播放中再检查一次。
  // 已经读好时这里几乎不花时间
  if (!audio.paused && !loading && audio.src === objectURL) prefetchNext();
});

// 暂停、拖动进度、离开应用（切到后台、关闭）时，立刻记住进度
audio.addEventListener('pause', savePosition);
audio.addEventListener('seeked', savePosition);
window.addEventListener('pagehide', savePosition);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') savePosition();
});

// 一首自然放完（单曲循环时 audio.loop 为 true，不会触发这个事件）
audio.addEventListener('ended', () => next(true));

// 导入时没算出时长（或算得不准）的歌，播放时用浏览器给出的真实时长补上
audio.addEventListener('loadedmetadata', () => {
  if (audio.src !== objectURL) return; // 加载的是静音，不是歌
  applyPendingSeek(); // 恢复上次的进度：音频加载好了，现在可以真正跳过去
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
