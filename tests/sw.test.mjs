// 检查 sw.js 里的缓存文件列表：应用的每个文件都要在列表里，列表里的每个文件都要真的存在。
// 漏掉一个文件，离线时应用就会打不开，而且这种错误在有网时完全看不出来。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, sep } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const source = readFileSync(join(ROOT, 'sw.js'), 'utf8');

// 从 sw.js 的文本里取出 FILES 数组（sw.js 不能用 export，所以直接读文本）
const listText = source.match(/const FILES = \[([\s\S]*?)\];/)[1];
const FILES = [...listText.matchAll(/'([^']+)'/g)].map((m) => m[1]);

/** 列出目录下所有文件（递归），返回相对项目根目录、用 / 分隔的路径 */
function filesIn(dir) {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? filesIn(path) : [path.split(sep).join('/')];
  });
}

test('应用的每个文件都在缓存列表里', () => {
  const appFiles = ['index.html', 'manifest.json', ...filesIn('js'), ...filesIn('styles'), ...filesIn('icons')];
  const missing = appFiles.filter((f) => !FILES.includes(f));
  assert.deepEqual(missing, [], `sw.js 的 FILES 漏掉了：${missing.join('、')}`);
});

test('缓存列表里的每个文件都存在', () => {
  const ghosts = FILES.filter((f) => f !== './' && !existsSync(join(ROOT, f)));
  assert.deepEqual(ghosts, [], `sw.js 的 FILES 里有不存在的文件：${ghosts.join('、')}`);
});
