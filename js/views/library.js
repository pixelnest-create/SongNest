// 歌曲库页面：#/library
import { icon } from '../icons.js';
import { escapeHTML, formatDuration, songCoverHTML } from '../ui.js';
import { songMenu } from '../song-actions.js';
import { getAllSongs } from '../db.js';
import { pickAndImport } from '../importer.js';
import { getState, playQueue } from '../player.js';
import { openNowPlaying } from '../now-playing.js';
import { dismissHint, hintHTML } from '../install-hint.js';

// 搜索词。放在页面外面，这样导入、编辑后页面重新渲染时搜索词还在
let query = '';
window.addEventListener('hashchange', () => { query = ''; }); // 离开歌曲库就清空

export async function renderLibrary(container) {
  const songs = await getAllSongs();
  let shown = songs; // 当前显示（搜索过滤后）的歌

  container.innerHTML = `
    <header class="page-header">
      <h1 class="page-title">歌曲库</h1>
      <button class="btn btn-accent" data-action="import">${icon('plus')}导入</button>
    </header>
    ${hintHTML()}
    ${songs.length ? searchHTML() : ''}
    <div data-role="results"></div>
  `;

  const results = container.querySelector('[data-role="results"]');

  /** 只重画列表部分，不动搜索框（否则输入时键盘会收起） */
  function renderResults() {
    shown = filter(songs, query);
    if (!songs.length) results.innerHTML = emptyHTML();
    else if (!shown.length) results.innerHTML = noResultHTML(query);
    else results.innerHTML = listHTML(shown, songs.length);
    // 高亮正在播放的歌
    const currentId = getState().song?.id;
    results.querySelector(`.row-main[data-id="${CSS.escape(currentId ?? '')}"]`)?.classList.add('is-current');
  }

  // 注意：渲染完后，app.js 会把 container 里的内容「搬」到真正的页面上，container 就空了。
  // 所以事件处理里不能再用 container.querySelector 找元素，要提前拿到元素本身，或从事件目标往上找。
  const input = container.querySelector('.search input');
  input?.addEventListener('input', () => {
    query = input.value;
    input.closest('.search').classList.toggle('has-text', Boolean(query));
    renderResults();
  });

  renderResults();

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
      case 'clear-search': {
        const field = target.closest('.search').querySelector('input');
        field.value = '';
        field.dispatchEvent(new Event('input'));
        field.focus();
        break;
      }
      case 'play': {
        // 把当前显示的歌（搜索时就是搜索结果）作为队列，从这首开始播，并打开全屏播放页。
        // 点的是正在播放的歌 → 只打开播放页，不从头播
        const id = target.dataset.id;
        if (getState().song?.id !== id) playQueue(shown, shown.findIndex((s) => s.id === id));
        openNowPlaying();
        break;
      }
      case 'more':
        songMenu(songs.find((s) => s.id === target.dataset.id));
        break;
    }
  };
}

/** 按歌名、歌手、专辑查找，不区分大小写 */
function filter(songs, text) {
  const q = text.trim().toLowerCase();
  if (!q) return songs;
  return songs.filter((s) => [s.title, s.artist, s.album].some((field) => field?.toLowerCase().includes(q)));
}

function searchHTML() {
  return `
    <div class="search${query ? ' has-text' : ''}">
      ${icon('search')}
      <input class="field" type="search" placeholder="搜索歌名、歌手、专辑" enterkeyhint="search"
             autocomplete="off" aria-label="搜索歌曲" value="${escapeHTML(query)}">
      <button class="icon-btn search-clear" data-action="clear-search" aria-label="清除搜索">${icon('x')}</button>
    </div>
  `;
}

function listHTML(songs, total) {
  const count = songs.length === total ? `${total} 首歌` : `找到 ${songs.length} 首（共 ${total} 首）`;
  return `
    <p class="page-subtitle">${count}</p>
    <ul class="list">
      ${songs.map((song) => `
        <li class="row">
          <button class="row-main" data-action="play" data-id="${escapeHTML(song.id)}">
            ${songCoverHTML(song)}
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

function noResultHTML(text) {
  return `
    <div class="empty">
      ${icon('search')}
      <h2 class="empty-title">没有找到</h2>
      <p class="empty-text">歌曲库里没有和「${escapeHTML(text.trim())}」相关的歌。</p>
    </div>
  `;
}

function emptyHTML() {
  return `
    <div class="empty">
      ${icon('music')}
      <h2 class="empty-title">导入你的第一首歌</h2>
      <p class="empty-text">从「文件」App 选择音乐，歌曲会保存在这台手机上，不需要联网。请只导入你有权使用的音乐。</p>
      <button class="btn btn-accent" data-action="import">${icon('plus')}导入音乐</button>
    </div>
  `;
}
