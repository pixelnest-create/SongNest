// 和歌单相关的「操作流程」：多个页面都会用到，所以放在一起。
import { addSongsToPlaylist, createPlaylist, getAllPlaylists } from './db.js';
import { actionSheet, promptDialog } from './dialogs.js';
import { toast } from './ui.js';

/** 弹出输入框新建歌单，返回新歌单；取消返回 null */
export async function createPlaylistFlow() {
  const name = await promptDialog({ title: '新建歌单', placeholder: '比如：通勤、学习、跑步', confirmLabel: '创建' });
  if (!name) return null;
  return createPlaylist(name);
}

/**
 * 「添加到歌单」：先选歌单（或新建一个），再把歌加进去。
 * @param {string[]} songIds
 * @param {string} subtitle 菜单上显示的歌名
 */
export async function addToPlaylistFlow(songIds, subtitle) {
  const playlists = await getAllPlaylists();
  const choice = await actionSheet({
    title: '添加到歌单',
    subtitle,
    actions: [
      { value: '__new__', label: '新建歌单', icon: 'plus' },
      ...playlists.map((p) => ({ value: p.id, label: p.name, icon: 'playlist', meta: `${p.songIds.length} 首` })),
    ],
  });
  if (!choice) return;

  const playlist = choice === '__new__' ? await createPlaylistFlow() : playlists.find((p) => p.id === choice);
  if (!playlist) return;

  const added = await addSongsToPlaylist(playlist.id, songIds);
  toast(added ? `已添加到「${playlist.name}」` : `「${playlist.name}」里已经有这首歌了`);
}
