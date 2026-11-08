// 歌曲库页面：#/library
import { icon } from '../icons.js';
import { coverHTML, escapeHTML, formatDuration } from '../ui.js';
import { songMenu } from '../song-actions.js';
import { getAllSongs } from '../db.js';
import { pickAndImport } from '../importer.js';
import { getState, playQueue } from '../player.js';
import { openNowPlaying } from '../now-playing.js';
import { dismissHint, hintHTML } from '../install-hint.js';

export async function renderLibrary(container) {
  const songs = await getAllSongs();

  container.innerHTML = `
    <header class="page-header">
      <h1 class="page-title">歌曲库</h1>
      <button class="btn btn-accent" data-action="import">${icon('plus')}导入</button>
    </header>
    ${hintHTML()}
    ${songs.length ? listHTML(songs) : emptyHTML()}
  `;

  // 事件委托：在容器上统一监听点击，根据 data-action 判断点了什么
  container.onclick = (e) => {
    const target = e.target.closest('[data-action]');
    if (!target) return;
    switch (target.dataset.action) {
      case 'import': pickAndImport(); break;
      case 'dismiss-hint':
        dismissHint(target.dataset.hint);
        target.closest('.hint').remove();
        break;
      case 'play': {
        // 把整个歌曲库作为队列，从这首开始播，并打开全屏播放页。
        // 点的是正在播放的歌 → 只打开播放页，不从头播
        const id = target.dataset.id;
        if (getState().song?.id !== id) playQueue(songs, songs.findIndex((s) => s.id === id));
        openNowPlaying();
        break;
      }
      case 'more': {
        songMenu(songs.find((s) => s.id === target.dataset.id));
        break;
      }
    }
  };
}

function listHTML(songs) {
  return `
    <p class="page-subtitle">${songs.length} 首歌</p>
    <ul class="list">
      ${songs.map((song) => `
        <li class="row">
          <button class="row-main" data-action="play" data-id="${escapeHTML(song.id)}">
            ${coverHTML(song.id, { cover: song.cover })}
            <span class="row-text">
              <span class="row-title">${escapeHTML(song.title)}</span>
              <span class="row-sub">${escapeHTML(song.artist ?? '未知歌手')}</span>
            </span>
            <span class="row-meta">${formatDuration(song.duration)}</span>
          </button>
          <button class="icon-btn" data-action="more" data-id="${escapeHTML(song.id)}" aria-label="更多操作">${icon('dots')}</button>
        </li>
      `).join('')}
    </ul>
  `;
}

function emptyHTML() {
  return `
    <div class="empty">
      ${icon('music')}
      <h2 class="empty-title">导入你的第一首歌</h2>
      <p class="empty-text">从「文件」App 选择音乐，歌曲会保存在这台手机上，不需要联网。</p>
      <button class="btn btn-accent" data-action="import">${icon('plus')}导入音乐</button>
    </div>
  `;
}
