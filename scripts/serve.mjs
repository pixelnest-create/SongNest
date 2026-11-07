// 本地预览服务器：不依赖任何第三方包，只用 Node.js 自带模块。
// 用法：npm run dev（或 node scripts/serve.mjs [端口]）
// 会监听 0.0.0.0，所以同一 Wi-Fi 下的手机也能访问。

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.argv[2] || process.env.PORT || 5173);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
};

const server = createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let filePath = normalize(join(ROOT, urlPath));

    // 安全检查：不允许访问项目目录以外的文件（比如 /../../Windows）
    if (filePath !== ROOT && !filePath.startsWith(ROOT + sep)) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    if ((await stat(filePath).catch(() => null))?.isDirectory()) {
      filePath = join(filePath, 'index.html');
    }

    const body = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store', // 开发时不缓存，改完刷新就能看到
    });
    res.end(body);
    console.log(`200 ${urlPath}`);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
    console.log(`404 ${req.url}`);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('\nSongNest 预览服务器已启动：');
  console.log(`  电脑浏览器：http://localhost:${PORT}`);
  for (const list of Object.values(networkInterfaces())) {
    for (const net of list ?? []) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`  手机（同一 Wi-Fi）：http://${net.address}:${PORT}`);
      }
    }
  }
  console.log('\n按 Ctrl+C 停止。\n');
});
