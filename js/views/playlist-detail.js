// 歌单详情页面：#/playlist/<id>
import { icon } from '../icons.js';
import { coverHTML, escapeHTML, formatDuration, notYet } from '../ui.js';
// 歌单数据在阶段 5 接入数据库，在那之前总是显示「找不到」
const getPlaylist = () => null;
const getSong = () => null;

export function renderPlaylistDetail(container, { id }) {
  const playlist = getPlaylist(id);

  if (!playlist) {
    container.innerHTML = `
      ${headerHTML('歌单')}
      <div class="empty">
        ${icon('playlist')}
        <h2 class="empty-title">找不到这个歌单</h2>
        <p class="empty-text">它可能已经被删除了。</p>
        <a class="btn btn-soft" href="#/playlists">回到歌单列表</a>
      </div>
    `;
    container.onclick = null;
    return;
  }

  const songs = playlist.songIds.map(getSong).filter(Boolean);

  container.innerHTML = `
    ${headerHTML(playlist.name, true)}
    <p class="page-subtitle">${songs.length} 首</p>
    <div class="actions">
      <button class="btn btn-accent" data-action="play-all">${icon('play')}播放</button>
      <button class="btn btn-soft" data-action="shuffle">${icon('shuffle')}随机</button>
      <button class="btn btn-soft" data-action="add">${icon('plus')}添加歌曲</button>
    </div>
    <ol class="list">
      ${songs.map((song, i) => `
        <li class="row">
          <button class="row-main" data-action="play" data-id="${escapeHTML(song.id)}">
            <span class="row-index">${i + 1}</span>
            ${coverHTML(song.id)}
            <span class="row-text">
              <span class="row-title">${escapeHTML(song.title)}</span>
              <span class="row-sub">${escapeHTML(song.artist ?? '未知歌手')}</span>
            </span>
            <span class="row-meta">${formatDuration(song.duration)}</span>
          </button>
          <button class="icon-btn" data-action="more" aria-label="更多操作">${icon('dots')}</button>
        </li>
      `).join('')}
    </ol>
  `;

  container.onclick = (e) => {
    const target = e.target.closest('[data-action]');
    if (!target) return;
    const stage = { 'play-all': 4, play: 4, shuffle: 6, add: 5, more: 5, menu: 5 }[target.dataset.action];
    if (stage) notYet(stage);
  };
}

function headerHTML(title, withMenu = false) {
  return `
    <header class="page-header">
      <a class="icon-btn back-btn" href="#/playlists" aria-label="返回歌单列表">${icon('back')}</a>
      <h1 class="page-title" style="flex:1">${escapeHTML(title)}</h1>
      ${withMenu ? `<button class="icon-btn" data-action="menu" aria-label="歌单操作">${icon('dots')}</button>` : ''}
    </header>
  `;
}
