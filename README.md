# pwa-document

### 描述

按已发布应用切换 PWA 的 manifest、图标与标题，浏览器与 Node 共用同一份匹配规则

### 关键词

pwa, manifest, webmanifest, apple-touch-icon, safari, add-to-dock, app-center

### 安装

```shell
npm i --save @kne/pwa-document
```

### 概述

#### 概述

一个页面同时承载多个可安装应用时（如开发者文档首页、应用中心、应用中心里发布的各个子应用），需要按当前路径切换 PWA 的 manifest、`apple-touch-icon` 和标题。本包把这套匹配规则放在一个文件里，浏览器和 Node 端引用同一份代码。

#### 核心流程

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

#### 主要特性

| 特性 | 说明 |
|------|------|
| 同一份规则 | UMD 单文件：作为 script 加载时自动安装，作为 CommonJS 引入时只导出方法 |
| 数据驱动 | 按已发布应用的 `pathUrl`、`entries`、`label`、`icon` 生成入口，不写死路径 |
| 外壳配置 | 宿主自己的页面（如首页、应用中心）通过 `shellEntries` 传入 |
| 服务端改写 | `applyPwaHtml` 只改 script 之外的标签，不碰脚本正文 |

#### 使用方法

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


### 示例

### API

#### 配置项

`window.__APP_CENTER_PWA__`，以及各方法的 `options` 参数：

| 属性名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| apiUrl | string | 否 | - | 已发布应用列表接口；脚本自动安装时同步请求，返回 `{ data: { pageData } }` 或 `{ pageData }` |
| shellEntries | array | 否 | `[]` | 宿主自身的入口，元素为 `{ path, manifest, icon, title }` |
| publicUrl | string | 否 | `''` | 写入页面时给相对路径加的前缀 |
| manifestPrefix | string | 否 | `/api/v1/app-manager` | 已发布应用 webmanifest 接口前缀 |
| staticPrefix | string | 否 | `/api/v1/static/file-id` | 应用图标为文件 id 时的访问前缀 |
| defaultIcon | string | 否 | - | 应用没有图标时使用 |
| apps | array | 否 | - | 直接传入应用列表，传入后不再请求 `apiUrl` |

#### 程序化 API

| 方法签名 | 说明 |
|----------|------|
| `normalizePath(path)` | 去掉查询、哈希与结尾斜杠，空值返回 `/` |
| `appSurfaces(app)` | 应用的可安装界面：`pathUrl` 加各个 `entries[].url`，元素为 `{ path, title }` |
| `entriesFromApps(apps, options)` | 已发布应用转成入口列表，元素为 `{ path, title, icon, manifest, appName }` |
| `matchPwaEntry(pathname, entries)` | 最长具体路径优先，`/` 兜底，无匹配返回 `null` |
| `resolveEntry(pathname, apps, options)` | 已发布应用入口与 `shellEntries` 合并后匹配 |
| `applyPwaEntry(entry, options)` | 浏览器内写入或更新 manifest、图标、标题，并设置 `window.__PWA_ACTIVE__` |
| `installPwaDocument(options)` | 安装：匹配当前路径并监听路由变化 |
| `syncPwaDocument(apps, options)` | 用新的应用列表重新匹配（如登录后能看到更多应用） |
| `applyPwaHtml(html, entry, options)` | 服务端改写 HTML：已有带 id 的标签只改属性，否则写在 `<meta charset>` 之后 |
| `buildWebManifest(app, options)` | 生成 webmanifest；`options` 支持 `path`、`title`、`icon`、`themeColor`、`backgroundColor` |
| `iconUrlFor(icon, options)` | 绝对地址或 `/` 开头原样返回，否则拼 `staticPrefix` |

#### 写入的标签

| id | 标签 | 属性 |
|----|------|------|
| pwa-apple-touch-icon | `link rel="apple-touch-icon"` | `href` |
| pwa-apple-title | `meta name="apple-mobile-web-app-title"` | `content` |
| pwa-manifest | `link rel="manifest"` | `href` |

> **注意**：Safari 添加到程序坞只读解析阶段的 manifest，脚本必须在 `<head>` 中同步加载，不能放进打包后的异步代码。
