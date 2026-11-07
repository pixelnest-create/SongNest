// 歌单列表页面：#/playlists
import { icon } from '../icons.js';
import { coverHTML, escapeHTML, notYet } from '../ui.js';
// 歌单数据在阶段 5 接入数据库，在那之前列表总是空的
const getPlaylists = () => [];

export function renderPlaylists(container) {
  const playlists = getPlaylists();

  container.innerHTML = `
    <header class="page-header">
      <h1 class="page-title">歌单</h1>
      <button class="btn btn-accent" data-action="create">${icon('plus')}新建</button>
    </header>
    ${playlists.length ? listHTML(playlists) : emptyHTML()}
  `;

  container.onclick = (e) => {
    const target = e.target.closest('[data-action]');
    if (target?.dataset.action === 'create') notYet(5);
  };
}

function listHTML(playlists) {
  return `
    <ul class="list">
      ${playlists.map((p) => `
        <li>
          <a class="row" href="#/playlist/${encodeURIComponent(p.id)}">
            <span class="row-main">
              ${coverHTML(p.id)}
              <span class="row-text">
                <span class="row-title">${escapeHTML(p.name)}</span>
                <span class="row-sub">${p.songIds.length} 首</span>
              </span>
            </span>
            <span class="icon-btn" aria-hidden="true">${icon('chevron')}</span>
          </a>
        </li>
      `).join('')}
    </ul>
  `;
}

function emptyHTML() {
  return `
    <div class="empty">
      ${icon('playlist')}
      <h2 class="empty-title">建一个歌单</h2>
      <p class="empty-text">按心情、场景整理歌曲，比如「通勤」「学习」「跑步」。</p>
      <button class="btn btn-accent" data-action="create">${icon('plus')}新建歌单</button>
    </div>
  `;
}
