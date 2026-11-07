# SongNest

一个可以安装到 iPhone 主屏幕的音乐播放 PWA：从「文件」App 导入本地音乐，创建和管理歌单。

## 技术栈

- 原生 HTML / CSS / JavaScript（ES Modules），无框架、无构建步骤
- IndexedDB：本地保存音频文件与歌单
- Media Session API：锁屏控制
- Service Worker + Web App Manifest：离线可用、添加到主屏幕
- GitHub Pages：免费 HTTPS 托管

## 本地预览

任选一种：

- VS Code 安装 Live Server 插件，右键 `index.html` → Open with Live Server
- 命令行：`npx serve .`

手机预览：电脑和手机连同一个 Wi-Fi，在 iPhone Safari 打开 `http://<电脑局域网IP>:<端口>`。
（Service Worker 需要 HTTPS，要等部署到 GitHub Pages 后才能在手机上完整测试。）

## 项目进度

- [x] 阶段 0：环境准备
- [ ] 阶段 1：需求与设计
- [ ] 阶段 2：项目骨架
- [ ] 阶段 3：导入音乐
- [ ] 阶段 4：歌曲库与播放
- [ ] 阶段 5：歌单管理
- [ ] 阶段 6：播放队列
- [ ] 阶段 7：锁屏控制
- [ ] 阶段 8：PWA 化
- [ ] 阶段 9：部署与安装
- [ ] 阶段 10：打磨（可选）
