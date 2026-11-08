# SongNest

一个可以安装到 iPhone 主屏幕的音乐播放 PWA：从「文件」App 导入本地音乐，创建和管理歌单。

**在线使用：https://pixelnest-create.github.io/SongNest/**

## 安装到 iPhone

1. 用 **Safari** 打开上面的网址（其他浏览器不能添加到主屏幕）
2. 点 Safari 下方的「分享」按钮 →「添加到主屏幕」→「添加」
3. 以后从主屏幕的 SongNest 图标打开

歌曲只保存在这台手机上；从主屏幕删除 SongNest 会同时删除里面的歌曲和歌单。

## 发布新版本

1. 把 `sw.js` 里的 `VERSION` 加 1（否则手机上会一直用缓存的旧版本）
2. 运行 `npm test`，确认测试通过
3. 提交并推送：`git push`，GitHub Pages 会在一两分钟内自动更新
4. 手机上打开应用后，新版本会在后台下载，**下次打开**时生效

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

运行 `tests/` 下的单元测试：元数据解析器，以及离线缓存列表是否完整。

## 离线功能（Service Worker）

- `sw.js` 把应用的所有文件缓存在手机上，断网也能打开
- **每次发布新版本前，把 `sw.js` 里的 `VERSION` 加 1**，否则手机上会一直用旧版本
- 新增或删除了代码文件，要同步修改 `sw.js` 的 `FILES` 列表（`npm test` 会检查）
- 本地开发（localhost）时默认不启用，免得改了代码刷新还是旧的；要测试离线功能就在地址后加 `?sw`

## 图标

`icons/` 里的图标由脚本生成，改了设计后重新运行：

```bash
npm run icons
```

## 项目进度

- [x] 阶段 0：环境准备
- [x] 阶段 1：需求与设计（见 [docs/design.md](docs/design.md)）
- [x] 阶段 2：项目骨架
- [x] 阶段 3：导入音乐
- [x] 阶段 4：歌曲库与播放
- [x] 阶段 5：歌单管理
- [x] 阶段 6：播放队列
- [x] 阶段 7：锁屏控制
- [x] 阶段 8：PWA 化
- [x] 阶段 9：部署与安装
- [ ] 阶段 10：打磨（可选）
