// 歌单详情页面：#/playlist/<id>
import { icon } from '../icons.js';
import { coverHTML, escapeHTML, formatDuration, toast } from '../ui.js';
import {
  addSongsToPlaylist, deletePlaylist, getAllSongs, getPlaylist, getSongsByIds,
  moveSongInPlaylist, removeSongFromPlaylist, renamePlaylist,
} from '../db.js';
import { actionSheet, confirmDialog, pickSongs, promptDialog } from '../dialogs.js';
import { getState, playQueue } from '../player.js';
import { openNowPlaying } from '../now-playing.js';

// 正在「调整顺序」的歌单 id。离开页面时自动退出这个模式。
let editingId = null;
window.addEventListener('hashchange', () => { editingId = null; });

export async function renderPlaylistDetail(container, { id }) {
  const playlist = await getPlaylist(id);

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
    return;
  }

  const songs = await getSongsByIds(playlist.songIds);
  const editing = editingId === id && songs.length > 1;

  container.innerHTML = `
    ${headerHTML(playlist.name, editing ? 'done' : 'menu')}
    <p class="page-subtitle">${songs.length} 首${totalTime(songs)}</p>
    ${editing ? '<p class="page-subtitle">用箭头调整顺序，完成后点右上角「完成」</p>' : actionsHTML(songs.length)}
    ${songs.length ? listHTML(songs, editing) : emptyHTML()}
  `;

  container.onclick = async (e) => {
    const target = e.target.closest('[data-action]');
    if (!target) return;
    const index = Number(target.dataset.index);

    switch (target.dataset.action) {
      case 'play-all':
        playQueue(songs, 0);
        openNowPlaying();
        break;
      case 'play': {
        // 和歌曲库一样：播放这首并打开全屏播放页；点正在播放的歌只打开播放页
        const song = songs[index];
        if (getState().song?.id !== song.id) playQueue(songs, index);
        openNowPlaying();
        break;
      }
      case 'add':
        await addSongs(playlist);
        break;
      case 'more':
        await songMenu(playlist, songs[index]);
        break;
      case 'menu':
        await playlistMenu(playlist, songs.length);
        break;
      case 'up':
        await moveSongInPlaylist(id, index, index - 1);
        break;
      case 'down':
        await moveSongInPlaylist(id, index, index + 1);
        break;
      case 'done':
        editingId = null;
        window.dispatchEvent(new Event('library:change')); // 重新渲染当前页面
        break;
    }
  };
}

// ---------- 各种操作 ----------

async function addSongs(playlist) {
  const all = await getAllSongs();
  const inPlaylist = new Set(playlist.songIds);
  const candidates = all.filter((s) => !inPlaylist.has(s.id));
  if (!all.length) {
    toast('歌曲库还是空的，先去导入音乐吧');
    return;
  }
  if (!candidates.length) {
    toast('歌曲库里的歌都已经在这个歌单里了');
    return;
  }
  const ids = await pickSongs({ title: `添加到「${playlist.name}」`, songs: candidates });
  if (!ids.length) return;
  const added = await addSongsToPlaylist(playlist.id, ids);
  toast(`已添加 ${added} 首`);
}

async function songMenu(playlist, song) {
  const choice = await actionSheet({
    title: '歌曲操作',
    subtitle: song.title,
    actions: [{ value: 'remove', label: '从歌单中移除', icon: 'remove', danger: true }],
  });
  if (choice === 'remove') {
    await removeSongFromPlaylist(playlist.id, song.id);
    toast('已从歌单中移除');
  }
}

async function playlistMenu(playlist, count) {
  const actions = [{ value: 'rename', label: '重命名', icon: 'edit' }];
  if (count > 1) actions.push({ value: 'sort', label: '调整顺序', icon: 'sort' });
  actions.push({ value: 'delete', label: '删除歌单', icon: 'trash', danger: true });

  const choice = await actionSheet({ title: '歌单操作', subtitle: playlist.name, actions });

  if (choice === 'rename') {
    const name = await promptDialog({ title: '重命名歌单', value: playlist.name, confirmLabel: '保存' });
    if (name && name !== playlist.name) await renamePlaylist(playlist.id, name);
  } else if (choice === 'sort') {
    editingId = playlist.id;
    window.dispatchEvent(new Event('library:change'));
  } else if (choice === 'delete') {
    const ok = await confirmDialog({
      title: `删除「${playlist.name}」？`,
      message: '歌单里的歌曲不会被删除，仍然保留在歌曲库里。',
      confirmLabel: '删除',
      danger: true,
    });
    if (ok) {
      await deletePlaylist(playlist.id);
      location.hash = '#/playlists';
      toast('歌单已删除');
    }
  }
}

// ---------- 页面片段 ----------

function headerHTML(title, right = null) {
  const rightHTML = {
    menu: `<button class="icon-btn" data-action="menu" aria-label="歌单操作">${icon('dots')}</button>`,
    done: '<button class="btn btn-accent" data-action="done">完成</button>',
  }[right] ?? '';
  return `
    <header class="page-header">
      <a class="icon-btn back-btn" href="#/playlists" aria-label="返回歌单列表">${icon('back')}</a>
      <h1 class="page-title" style="flex:1">${escapeHTML(title)}</h1>
      ${rightHTML}
    </header>
  `;
}

function actionsHTML(count) {
  if (!count) return '';
  return `
    <div class="actions">
      <button class="btn btn-accent" data-action="play-all">${icon('play')}播放</button>
      <button class="btn btn-soft" data-action="add">${icon('plus')}添加歌曲</button>
    </div>
  `;
}

function listHTML(songs, editing) {
  return `
    <ol class="list">
      ${songs.map((song, i) => `
        <li class="row">
          ${editing ? `
            <span class="row-main is-static">
              <span class="row-index">${i + 1}</span>
              ${songTextHTML(song)}
            </span>
            <button class="icon-btn" data-action="up" data-index="${i}" aria-label="上移" ${i === 0 ? 'disabled' : ''}>${icon('up')}</button>
            <button class="icon-btn" data-action="down" data-index="${i}" aria-label="下移" ${i === songs.length - 1 ? 'disabled' : ''}>${icon('down')}</button>
          ` : `
            <button class="row-main" data-action="play" data-index="${i}" data-id="${escapeHTML(song.id)}">
              <span class="row-index">${i + 1}</span>
              ${coverHTML(song.id, { cover: song.cover })}
              ${songTextHTML(song)}
              <span class="row-meta">${formatDuration(song.duration)}</span>
            </button>
            <button class="icon-btn" data-action="more" data-index="${i}" aria-label="更多操作">${icon('dots')}</button>
          `}
        </li>
      `).join('')}
    </ol>
  `;
}

function songTextHTML(song) {
  return `
    <span class="row-text">
      <span class="row-title">${escapeHTML(song.title)}</span>
      <span class="row-sub">${escapeHTML(song.artist ?? '未知歌手')}</span>
    </span>
  `;
}

function emptyHTML() {
  return `
    <div class="empty">
      ${icon('playlist-add')}
      <h2 class="empty-title">歌单还是空的</h2>
      <p class="empty-text">从歌曲库里挑几首歌放进来吧。</p>
      <button class="btn btn-accent" data-action="add">${icon('plus')}添加歌曲</button>
    </div>
  `;
}

// ---------- 小工具 ----------

/** 总时长，例如「 · 23 分钟」 */
function totalTime(songs) {
  const seconds = songs.reduce((sum, s) => sum + (s.duration || 0), 0);
  if (!seconds) return '';
  const minutes = Math.round(seconds / 60);
  return minutes >= 60 ? ` · ${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟` : ` · ${minutes} 分钟`;
}
