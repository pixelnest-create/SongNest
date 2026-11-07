// 演示数据：只在阶段 2 用来预览界面效果。
// 地址后面加 ?demo（例如 http://localhost:5173/?demo）才会显示。
// 阶段 3 接入真正的数据库后会删掉这个文件。

export const DEMO = new URLSearchParams(location.search).has('demo');

const songs = [
  { id: 's1', title: '清晨的风', artist: '小林', duration: 269 },
  { id: 's2', title: '夜的钢琴曲', artist: null, duration: 226 },
  { id: 's3', title: '雨后', artist: '南方乐队', duration: 302 },
  { id: 's4', title: '一个名字特别特别长、长到一行放不下的歌', artist: '某位歌手', duration: 195 },
  { id: 's5', title: '回家路上', artist: '小林', duration: 248 },
];

const playlists = [
  { id: 'p1', name: '通勤', songIds: ['s1', 's3', 's5'] },
  { id: 'p2', name: '学习', songIds: ['s2'] },
];

export function getSongs() {
  return DEMO ? songs : [];
}

export function getPlaylists() {
  return DEMO ? playlists : [];
}

export function getPlaylist(id) {
  return getPlaylists().find((p) => p.id === id) ?? null;
}

export function getSong(id) {
  return getSongs().find((s) => s.id === id) ?? null;
}
