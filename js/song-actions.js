// 单首歌的「⋯」菜单：添加到歌单、编辑歌曲信息、替换音频文件、（在歌单里时）从歌单移除。
// 歌曲库和歌单详情页共用。
import { deleteSong, getAllPlaylists, removeSongFromPlaylist, replaceSongAudio, updateSong } from './db.js';
import { actionSheet, confirmDialog, formDialog } from './dialogs.js';
import { pickFiles, readAudioFile, reasonFor } from './importer.js';
import { refreshSong, removeSong } from './player.js';
import { addToPlaylistFlow } from './playlist-actions.js';
import { toast } from './ui.js';

/**
 * @param {object} song
 * @param {{ playlist?: object }} options 在歌单里打开时传入这个歌单，菜单里会多一项「从歌单中移除」
 */
export async function songMenu(song, { playlist = null } = {}) {
  let picking = null; // 「替换音频文件」：点击的瞬间就打开文件选择器（iOS 的要求）

  const actions = [
    { value: 'add', label: '添加到歌单', icon: 'playlist-add' },
    { value: 'edit', label: '编辑歌曲信息', icon: 'edit' },
    {
      value: 'replace',
      label: '替换音频文件',
      icon: 'replace',
      onTap: () => { picking = pickFiles({ multiple: false }); },
    },
  ];
  if (playlist) actions.push({ value: 'remove', label: '从歌单中移除', icon: 'remove', danger: true });
  actions.push({ value: 'delete', label: '从歌曲库删除', icon: 'trash', danger: true });

  const choice = await actionSheet({ title: '歌曲操作', subtitle: song.title, actions });

  switch (choice) {
    case 'add':
      await addToPlaylistFlow([song.id], song.title);
      break;
    case 'edit':
      await editSongFlow(song);
      break;
    case 'replace':
      await replaceAudioFlow(song, await picking);
      break;
    case 'remove':
      await removeSongFromPlaylist(playlist.id, song.id);
      toast('已从歌单中移除');
      break;
    case 'delete':
      await deleteSongFlow(song);
      break;
  }
}

/** 从歌曲库删除：要先确认，并告诉用户会影响几个歌单 */
async function deleteSongFlow(song) {
  const inPlaylists = (await getAllPlaylists()).filter((p) => p.songIds.includes(song.id));
  const where = inPlaylists.length ? `，也会从 ${inPlaylists.length} 个歌单里移除` : '';
  const ok = await confirmDialog({
    title: `删除「${song.title}」？`,
    message: `歌曲会从这台手机上删除${where}。删除后无法恢复（除非你有备份）。`,
    confirmLabel: '删除',
    danger: true,
  });
  if (!ok) return;
  await deleteSong(song.id);
  removeSong(song.id);
  window.dispatchEvent(new CustomEvent('cover:change', { detail: { songId: song.id } })); // 释放这首歌的封面缓存
  toast('已删除');
}

/** 修改歌名、歌手、专辑。只改应用里保存的信息，不会改动原来的音乐文件 */
async function editSongFlow(song) {
  const values = await formDialog({
    title: '编辑歌曲信息',
    fields: [
      { name: 'title', label: '歌名', value: song.title, required: true },
      { name: 'artist', label: '歌手', value: song.artist ?? '', placeholder: '未知歌手' },
      { name: 'album', label: '专辑', value: song.album ?? '', placeholder: '可以不填' },
    ],
  });
  if (!values) return;

  const patch = { title: values.title, artist: values.artist || null, album: values.album || null };
  if (patch.title === song.title && patch.artist === (song.artist ?? null) && patch.album === (song.album ?? null)) return;

  const updated = await updateSong(song.id, patch);
  if (!updated) return;
  refreshSong(updated);
  window.dispatchEvent(new Event('library:change'));
  toast('已保存');
}

/**
 * 替换音频文件：歌曲在歌单里的位置、歌名、歌手都保持不变，只换声音。
 * 时长、文件名跟着新文件更新；原来没有封面而新文件有封面时，顺便用上新封面。
 */
async function replaceAudioFlow(song, files) {
  const file = files?.[0];
  if (!file) return;

  toast('正在替换…', { sticky: true });
  let info;
  try {
    info = await readAudioFile(file);
  } catch (err) {
    toast(`替换失败：${reasonFor(err)}`, { duration: 4000 });
    return;
  }
  if (info.fileKey === song.fileKey) {
    toast('选的就是现在这个文件');
    return;
  }

  const patch = {
    fileName: info.fileName,
    fileSize: info.fileSize,
    fileKey: info.fileKey,
    mimeType: info.mimeType,
    duration: info.duration,
  };
  const coverAdded = !song.cover && info.cover;
  if (coverAdded) patch.cover = info.cover;

  let updated;
  try {
    updated = await replaceSongAudio(song.id, info.blob, patch);
  } catch (err) {
    console.error(err);
    toast(`替换失败：${reasonFor(err)}`, { duration: 4000 });
    return;
  }

  // 有了新封面：通知各处丢掉旧的占位封面缓存
  if (coverAdded) window.dispatchEvent(new CustomEvent('cover:change', { detail: { songId: song.id } }));
  refreshSong(updated, { audioChanged: true });
  window.dispatchEvent(new Event('library:change'));
  toast('已替换音频文件');
}
