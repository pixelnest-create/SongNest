// 备份文件格式的单元测试：打包后再解开，内容要完全一样。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BackupError, backupFileName, buildBackup, parseBackup } from '../js/backup.js';

const bytes = (...values) => new Uint8Array(values);
const blobBytes = async (blob) => [...new Uint8Array(await blob.arrayBuffer())];

const sample = () => ({
  songs: [
    {
      id: 's1', title: '晴天', artist: '小林', album: null, duration: 269.5,
      fileName: 'a.mp3', fileSize: 4, fileKey: 'a.mp3|4', mimeType: 'audio/mpeg', addedAt: 1,
      audio: new Blob([bytes(1, 2, 3, 4)], { type: 'audio/mpeg' }),
      cover: new Blob([bytes(0xff, 0xd8, 9)], { type: 'image/jpeg' }),
    },
    {
      id: 's2', title: '没有封面', artist: null, album: null, duration: 3,
      fileName: 'b.wav', fileSize: 2, fileKey: 'b.wav|2', mimeType: 'audio/wav', addedAt: 2,
      audio: new Blob([bytes(7, 8)], { type: 'audio/wav' }),
      cover: null,
    },
  ],
  playlists: [{ id: 'p1', name: '通勤', songIds: ['s2', 's1'], createdAt: 1, updatedAt: 2 }],
});

test('打包再解开：歌曲信息、音频、封面、歌单都不变', async () => {
  const file = buildBackup(sample());
  const restored = await parseBackup(file);

  assert.equal(restored.songs.length, 2);
  const [a, b] = restored.songs;
  assert.equal(a.title, '晴天');
  assert.equal(a.artist, '小林');
  assert.equal(a.duration, 269.5);
  assert.deepEqual(await blobBytes(a.audio), [1, 2, 3, 4]);
  assert.equal(a.audio.type, 'audio/mpeg');
  assert.deepEqual(await blobBytes(a.cover), [0xff, 0xd8, 9]);
  assert.equal(a.cover.type, 'image/jpeg');
  assert.deepEqual(await blobBytes(b.audio), [7, 8]);
  assert.equal(b.cover, null);
  assert.deepEqual(restored.playlists, sample().playlists);
  assert.ok(restored.createdAt > 0);
});

test('空的歌曲库也能备份和恢复', async () => {
  const restored = await parseBackup(buildBackup({ songs: [], playlists: [] }));
  assert.deepEqual(restored.songs, []);
  assert.deepEqual(restored.playlists, []);
});

test('不是备份文件：给出清楚的错误', async () => {
  await assert.rejects(parseBackup(new Blob(['hello world, not a backup'])), BackupError);
  await assert.rejects(parseBackup(new Blob(['x'])), BackupError);
});

test('备份文件被截断：给出错误，而不是读出错误的数据', async () => {
  const full = buildBackup(sample());
  const cut = full.slice(0, full.size - 3);
  const restored = parseBackup(cut);
  await assert.rejects(restored, /不完整/);
});

test('文件名带日期', () => {
  assert.equal(backupFileName(new Date(2026, 10, 7)), 'SongNest-备份-2026-11-07.songnest');
});
