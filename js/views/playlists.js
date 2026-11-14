// 歌单列表页面：#/playlists
import { icon } from '../icons.js';
import { escapeHTML, playlistCoverHTML } from '../ui.js';
import { getAllPlaylists, getAllSongs } from '../db.js';
import { createPlaylistFlow } from '../playlist-actions.js';

export async function renderPlaylists(container) {
  const [playlists, songs] = await Promise.all([getAllPlaylists(), getAllSongs()]);
  const songsById = new Map(songs.map((s) => [s.id, s]));

  container.innerHTML = `
    <header class="page-header">
      <h1 class="page-title">歌单</h1>
      <button class="btn btn-accent" data-action="create">${icon('plus')}新建</button>
    </header>
    ${playlists.length ? listHTML(playlists, songsById) : emptyHTML()}
  `;

  container.onclick = async (e) => {
    const target = e.target.closest('[data-action]');
    if (target?.dataset.action === 'create') {
      const playlist = await createPlaylistFlow();
      if (playlist) location.hash = `#/playlist/${encodeURIComponent(playlist.id)}`; // 建好直接进去加歌
    }
  };
}

function listHTML(playlists, songsById) {
  return `
    <ul class="list">
      ${playlists.map((p) => {
        const songs = p.songIds.map((id) => songsById.get(id)).filter(Boolean);
        return `
          <li>
            <a class="row" href="#/playlist/${encodeURIComponent(p.id)}">
              <span class="row-main">
                ${playlistCoverHTML(p, songs)}
                <span class="row-text">
                  <span class="row-title">${escapeHTML(p.name)}</span>
                  <span class="row-sub">${songs.length} 首</span>
                </span>
              </span>
              <span class="icon-btn" aria-hidden="true">${icon('chevron')}</span>
            </a>
          </li>
        `;
      }).join('')}
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
