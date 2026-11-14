// 「更多」页面：#/more —— 存储空间、备份与恢复
import { icon } from '../icons.js';
import { escapeHTML, formatBytes, toast } from '../ui.js';
import { getAllPlaylists, getAllSongs, getEverythingForBackup, restoreFromBackup } from '../db.js';
import { BackupError, backupFileName, buildBackup, parseBackup } from '../backup.js';
import { confirmDialog } from '../dialogs.js';
import { pickFiles } from '../importer.js';
// 生成好、等待保存的备份文件。
// 为什么要分两步（先「导出备份」，再「保存备份文件」）：iPhone 只允许在用户点击的那一刻
// 打开「分享 / 存储到文件」，而生成备份需要先读数据库，等读完那一刻已经过去了。
let prepared = null; // { file: File }
const REPO_URL = 'https://github.com/pixelnest-create/SongNest';
window.addEventListener('hashchange', () => { prepared = null; }); // 离开本页就作废，免得以后保存到旧的备份

export async function renderMore(container) {
  const [songs, playlists, estimate] = await Promise.all([
    getAllSongs(),
    getAllPlaylists(),
    navigator.storage?.estimate?.().catch(() => null) ?? null,
  ]);
  const songBytes = songs.reduce((sum, s) => sum + (s.fileSize || 0) + (s.cover?.size || 0), 0)
    + playlists.reduce((sum, p) => sum + (p.cover?.size || 0), 0);  const free = estimate?.quota && estimate?.usage != null ? estimate.quota - estimate.usage : null;

  container.innerHTML = `
    <header class="page-header">
      <h1 class="page-title">更多</h1>
    </header>

    <section class="card">
      <h2 class="card-title">存储空间</h2>
      <p class="card-stat">${formatBytes(songBytes)}</p>
      <p class="card-text">${songs.length} 首歌、${playlists.length} 个歌单${free != null ? ` · 这个应用还可以使用约 ${formatBytes(free)}` : ''}</p>
    </section>

    <section class="card">
      <h2 class="card-title">备份与恢复</h2>
      <p class="card-text">歌曲只保存在这台手机上，从主屏幕删除 SongNest 就会全部丢失。建议定期把备份存到 iCloud 云盘，换手机或误删后可以恢复。</p>
      <div class="card-actions">
        ${prepared ? `
          <button class="btn btn-accent" data-action="save-backup">${icon('share')}保存备份文件（${formatBytes(prepared.file.size)}）</button>
        ` : `
          <button class="btn btn-accent" data-action="export" ${songs.length ? '' : 'disabled'}>${icon('share')}导出备份</button>
        `}
        <button class="btn btn-soft" data-action="restore">${icon('replace')}从备份恢复</button>
      </div>
      ${prepared ? `<p class="card-text card-note">备份已准备好：${escapeHTML(prepared.file.name)}。点上面的按钮，选「存储到文件」。</p>` : ''}
      ${songs.length ? '' : '<p class="card-text card-note">歌曲库是空的，还没有可以备份的内容。</p>'}
    </section>

    <section class="card">
      <h2 class="card-title">关于 SongNest</h2>
      <p class="card-text"><strong>隐私：</strong>SongNest 不收集任何信息，没有账号，也不上传任何东西。你的歌曲和歌单只保存在这台设备上，开发者也看不到。</p>
      <p class="card-text card-note"><strong>版权：</strong>SongNest 不提供任何音乐，只播放你自己导入的文件。请只导入你有权使用的音乐。</p>
      <p class="card-text card-note">免费、开源（MIT 许可证），按原样提供，不做任何担保。遇到问题或有建议，可以到 <a href="${REPO_URL}/issues" target="_blank" rel="noopener">GitHub</a> 反馈。</p>
    </section>
  `;

  container.onclick = async (e) => {
    const target = e.target.closest('[data-action]');
    if (!target || target.disabled) return;
    switch (target.dataset.action) {
      case 'export': await exportBackup(target); break;
      case 'save-backup': saveBackup(); break;
      case 'restore': await restoreBackup(pickFiles({ multiple: false, accept: '' })); break;
    }
  };
}

/** 第一步：生成备份文件 */
async function exportBackup(button) {
  button.disabled = true;
  button.textContent = '正在准备…';
  try {
    const blob = buildBackup(await getEverythingForBackup());
    prepared = { file: new File([blob], backupFileName(), { type: 'application/octet-stream' }) };
  } catch (err) {
    console.error(err);
    toast('备份失败，请重试', { duration: 4000 });
  }
  window.dispatchEvent(new Event('library:change')); // 重新渲染本页，显示「保存备份文件」按钮
}

/** 第二步（必须在点击时直接调用）：打开分享面板，或者直接下载 */
function saveBackup() {
  const { file } = prepared;
  if (navigator.canShare?.({ files: [file] })) {
    navigator.share({ files: [file], title: file.name })
      .then(() => toast('备份已保存'))
      .catch((err) => {
        if (err.name !== 'AbortError') download(file); // 分享失败就退回下载
      });
  } else {
    download(file);
  }
}

function download(file) {
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement('a'), { href: url, download: file.name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** 从备份恢复：选文件 → 读目录 → 确认 → 逐首写入 */
async function restoreBackup(picking) {
  const [file] = await picking;
  if (!file) return;

  let backup;
  try {
    backup = await parseBackup(file);
  } catch (err) {
    toast(err instanceof BackupError ? err.message : '无法读取这个文件', { duration: 4000 });
    return;
  }

  const date = new Date(backup.createdAt).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' });
  const ok = await confirmDialog({
    title: '从备份恢复？',
    message: `这个备份创建于 ${date}，有 ${backup.songs.length} 首歌、${backup.playlists.length} 个歌单。歌曲库里已经有的歌会跳过，不会重复。`,
    confirmLabel: '恢复',
  });
  if (!ok) return;

  // 和导入时一样，请求「持久存储」，降低浏览器清理数据的可能（不支持时忽略）
  navigator.storage?.persist?.().catch(() => {});

  try {
    const result = await restoreFromBackup(backup, (done, total) => {
      if (total > 1) toast(`正在恢复 ${Math.min(done + 1, total)}/${total}…`, { sticky: true });
    });
    const parts = [`恢复了 ${result.added} 首歌`];
    if (result.skipped) parts.push(`${result.skipped} 首已存在`);
    if (result.playlistsAdded) parts.push(`${result.playlistsAdded} 个歌单`);
    toast(parts.join('，'), { duration: 4000 });
  } catch (err) {
    console.error(err);
    toast(err?.name === 'QuotaExceededError' ? '手机存储空间不足，恢复没有完成' : '恢复过程中出错，部分歌曲可能没有恢复', { duration: 5000 });
    window.dispatchEvent(new Event('library:change'));
  }
}
