// 导入流程：选择文件 → 读取元数据 → 生成封面缩略图 → 存入数据库
import { addSong, hasFileKey, newId } from './db.js';
import { parseMetadata } from './metadata.js';
import { toast } from './ui.js';

const MIME_BY_EXT = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
};
const ACCEPT = 'audio/*,.mp3,.m4a,.aac,.wav,.flac';
const COVER_SIZE = 300; // 封面缩略图的最长边（像素）

class ImportError extends Error {}

let importing = false;

/** 打开系统的文件选择器（iPhone 上是「文件」App），选完后自动导入 */
export function pickAndImport() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = ACCEPT;
  input.multiple = true;
  input.hidden = true;
  input.addEventListener('change', () => {
    const files = [...input.files];
    input.remove();
    if (files.length) importFiles(files);
  });
  document.body.append(input); // iOS 上 input 要在页面里才能可靠地弹出选择器
  input.click();
}

/**
 * 依次导入多个文件。完成后在 window 上发出 'library:change' 事件。
 * @param {File[]} files
 */
export async function importFiles(files) {
  if (importing) {
    toast('正在导入，请稍等');
    return null;
  }
  importing = true;
  const result = { added: 0, duplicate: 0, failed: [] };

  // 请求「持久存储」，降低浏览器清理数据的可能（不支持时忽略）
  navigator.storage?.persist?.().catch(() => {});

  try {
    for (const [i, file] of files.entries()) {
      if (files.length > 1) toast(`正在导入 ${i + 1}/${files.length}…`, { sticky: true });
      try {
        result[await importOne(file)]++;
      } catch (err) {
        console.error(`导入失败：${file.name}`, err);
        result.failed.push({ name: file.name, reason: reasonFor(err) });
        if (err?.name === 'QuotaExceededError') break; // 空间满了，后面的也存不下
      }
    }
  } finally {
    importing = false;
  }

  if (result.added) window.dispatchEvent(new Event('library:change'));
  toast(summary(result), { duration: result.failed.length ? 5000 : 2500 });
  return result;
}

/** 导入单个文件，返回 'added' 或 'duplicate' */
async function importOne(file) {
  const fileKey = `${file.name}|${file.size}`;
  if (await hasFileKey(fileKey)) return 'duplicate';

  const mimeType = mimeOf(file);
  if (!mimeType || !document.createElement('audio').canPlayType(mimeType)) {
    throw new ImportError('不支持这种格式');
  }

  const buffer = await file.arrayBuffer();
  const meta = parseMetadata(buffer);
  const blob = new Blob([buffer], { type: mimeType });

  const song = {
    id: newId(),
    title: meta.title || file.name.replace(/\.[^.]+$/, ''),
    artist: meta.artist,
    album: meta.album,
    duration: meta.duration ?? (await durationFromAudio(blob)),
    cover: meta.cover ? await makeThumbnail(meta.cover) : null,
    fileName: file.name,
    fileSize: file.size,
    fileKey,
    mimeType,
    addedAt: Date.now(),
  };

  await addSong(song, blob);
  return 'added';
}

/** 优先按扩展名判断类型（不同系统给的 file.type 不统一） */
function mimeOf(file) {
  const ext = file.name.split('.').pop()?.toLowerCase();
  return MIME_BY_EXT[ext] ?? (file.type.startsWith('audio/') ? file.type : null);
}

/**
 * 解析器算不出时长时，让浏览器自己加载试试。
 * iOS 可能不在没有点击的情况下加载音频，所以最多等 5 秒，拿不到就留空，
 * 等第一次播放时再补上（阶段 4）。
 */
function durationFromAudio(blob) {
  return new Promise((resolve) => {
    const audio = document.createElement('audio');
    const url = URL.createObjectURL(blob);
    const done = (value) => {
      clearTimeout(timer);
      audio.removeAttribute('src');
      audio.load();
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(value) ? value : null);
    };
    const timer = setTimeout(() => done(null), 5000);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => done(audio.duration);
    audio.onerror = () => done(null);
    audio.src = url;
  });
}

/** 把封面缩小到 300px 以内，转成 JPEG，节省存储空间 */
async function makeThumbnail({ data, mime }) {
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, COVER_SIZE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  } catch {
    return null; // 图片损坏就不要封面了，不影响导入
  } finally {
    URL.revokeObjectURL(url);
  }
}

function reasonFor(err) {
  if (err instanceof ImportError) return err.message;
  if (err?.name === 'QuotaExceededError') return '手机存储空间不足';
  return '文件无法读取';
}

function summary({ added, duplicate, failed }) {
  const parts = [];
  if (added) parts.push(`已导入 ${added} 首`);
  if (duplicate) parts.push(`${duplicate} 首已存在`);
  if (failed.length) {
    const first = failed[0];
    parts.push(`${failed.length} 首失败（${first.name}：${first.reason}${failed.length > 1 ? ' 等' : ''}）`);
  }
  return parts.join('，') || '没有导入新歌曲';
}
