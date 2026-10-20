### 配置项

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

### 程序化 API

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

### 写入的标签

| id | 标签 | 属性 |
|----|------|------|
| pwa-apple-touch-icon | `link rel="apple-touch-icon"` | `href` |
| pwa-apple-title | `meta name="apple-mobile-web-app-title"` | `content` |
| pwa-manifest | `link rel="manifest"` | `href` |

> **注意**：Safari 添加到程序坞只读解析阶段的 manifest，脚本必须在 `<head>` 中同步加载，不能放进打包后的异步代码。
