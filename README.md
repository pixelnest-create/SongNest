# SongNest

一个可以安装到 iPhone 主屏幕的音乐播放 PWA：从「文件」App 导入本地音乐，创建和管理歌单。

## 技术栈

- 原生 HTML / CSS / JavaScript（ES Modules），无框架、无构建步骤
- IndexedDB：本地保存音频文件与歌单
- Media Session API：锁屏控制
- Service Worker + Web App Manifest：离线可用、添加到主屏幕
- GitHub Pages：免费 HTTPS 托管

## 本地预览

在项目目录运行：

```bash
npm run dev
```

终端会打印两个地址：

- 电脑浏览器：`http://localhost:5173`
- 手机（和电脑连同一个 Wi-Fi）：`http://<电脑局域网IP>:5173`，用 iPhone 的 Safari 打开

第一次用手机访问时，如果 Windows 防火墙弹窗，要勾选「专用网络」并允许。
Service Worker 需要 HTTPS，离线功能要等部署到 GitHub Pages 后才能在手机上测试。

## 测试

```bash
npm test
```

运行 `tests/` 下的单元测试（目前测试元数据解析器）。

## 项目进度

- [x] 阶段 0：环境准备
- [x] 阶段 1：需求与设计（见 [docs/design.md](docs/design.md)）
- [x] 阶段 2：项目骨架
- [x] 阶段 3：导入音乐
- [ ] 阶段 4：歌曲库与播放
- [ ] 阶段 5：歌单管理
- [ ] 阶段 6：播放队列
- [ ] 阶段 7：锁屏控制
- [ ] 阶段 8：PWA 化
- [ ] 阶段 9：部署与安装
- [ ] 阶段 10：打磨（可选）
