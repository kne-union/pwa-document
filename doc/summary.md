### 概述

一个页面同时承载多个可安装应用时（如开发者文档首页、应用中心、应用中心里发布的各个子应用），需要按当前路径切换 PWA 的 manifest、`apple-touch-icon` 和标题。本包把这套匹配规则放在一个文件里，浏览器和 Node 端引用同一份代码。

### 核心流程

```
页面解析（普通 script 引入 index.js）
  ↓ 读取 window.__APP_CENTER_PWA__
  ↓ 同步请求已发布应用列表（apiUrl）
  ↓ resolveEntry(当前路径) → 已发布应用入口 / 外壳入口
  ↓ document.write 写入 manifest、图标、标题（Safari 只在解析 HTML 时读取 manifest）
  ↓ 劫持 pushState / replaceState / popstate，路由切换后改属性

服务端（CommonJS 引入）
  ↓ resolveEntry(请求路径, 已发布应用, 外壳配置)
  ↓ applyPwaHtml 返回前改写 HTML
  ↓ buildWebManifest 生成单个应用的 webmanifest
```

> **关键设计**：更长的具体路径优先匹配，`/` 只作兜底；应用入口（`entries[].url`）各自是一个可安装的界面，scope 仍是应用的 `pathUrl`。

### 主要特性

| 特性 | 说明 |
|------|------|
| 同一份规则 | UMD 单文件：作为 script 加载时自动安装，作为 CommonJS 引入时只导出方法 |
| 数据驱动 | 按已发布应用的 `pathUrl`、`entries`、`label`、`icon` 生成入口，不写死路径 |
| 外壳配置 | 宿主自己的页面（如首页、应用中心）通过 `shellEntries` 传入 |
| 服务端改写 | `applyPwaHtml` 只改 script 之外的标签，不碰脚本正文 |

### 使用方法

页面 `<head>` 中先写配置，再同步引入脚本（构建时把 `node_modules/@kne/pwa-document/index.js` 复制到 `public/`）：

```html
<script>
  window.__APP_CENTER_PWA__ = {
    apiUrl: '/api/v1/app-manager/app/center/public-list',
    shellEntries: [
      { path: '/apps', manifest: '/manifest-apps.json', icon: '/pwa/apps.png', title: '应用中心' },
      { path: '/', manifest: '/manifest.json', icon: '/pwa/home.png', title: '开发者文档' }
    ]
  };
</script>
<script src="/app-center-pwa.js"></script>
```

React 组件拿到登录后可见的应用列表后同步一次：

```js
import pwaDocument from '@kne/pwa-document';

pwaDocument.syncPwaDocument(apps, window.__APP_CENTER_PWA__);
```

Node 端返回 HTML 前改写：

```js
const { resolveEntry, applyPwaHtml } = require('@kne/pwa-document');

const entry = resolveEntry(request.url, apps, { shellEntries });
const html = applyPwaHtml(indexHtml, entry);
```
