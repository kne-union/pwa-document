/**
 * 按已发布应用切换 PWA 的 manifest、图标与标题。
 * 以普通 script 在页面解析阶段引入时，读取 window.__APP_CENTER_PWA__ 自动安装（Safari 只在解析 HTML 时读取 manifest）。
 * 以 CommonJS 引入时只导出方法，不会自动安装，Node 端用同一份规则改写 HTML、生成 manifest。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.AppCenterPwa = api;
    if (root.__APP_CENTER_PWA__) {
      api.installPwaDocument(root.__APP_CENTER_PWA__);
    } else {
      api.installEmbedBridge();
    }
  }
})(typeof window !== 'undefined' ? window : this, function () {
  var EMBED_MSG_SOURCE = 'kne-pwa-document';
  var EMBED_HOST_SOURCE = 'kne-app-center-home';
  var EMBED_SCRIPT_ID = 'kne-pwa-document-embed';

  var state = {
    host: null,
    apps: null,
    hooked: false,
    historyListeners: [],
    embedInstalled: false
  };

  var normalizePath = function (value) {
    var path = String(value || '/')
      .split('?')[0]
      .split('#')[0];
    if (path.length > 1 && path.charAt(path.length - 1) === '/') {
      path = path.slice(0, -1);
    }
    return path || '/';
  };

  var withPublicUrl = function (value, publicUrl) {
    if (!value || /^https?:\/\//.test(value) || /^data:/.test(value)) {
      return value;
    }
    var base = String(publicUrl || '').replace(/\/+$/, '');
    if (!base || value.indexOf(base + '/') === 0) {
      return value;
    }
    return base + (value.charAt(0) === '/' ? value : '/' + value);
  };

  var iconUrlFor = function (icon, options) {
    if (!icon) {
      return '';
    }
    if (/^https?:\/\//.test(icon) || icon.charAt(0) === '/') {
      return icon;
    }
    var prefix = (options && options.staticPrefix) || '/api/v1/static/file-id';
    return prefix.replace(/\/+$/, '') + '/' + icon;
  };

  var manifestUrlFor = function (app, path, options) {
    var prefix = (options && options.manifestPrefix) || '/api/v1/app-manager';
    var params = ['name=' + encodeURIComponent(app.name)];
    if (path && normalizePath(path) !== normalizePath(app.pathUrl)) {
      params.push('path=' + encodeURIComponent(path));
    }
    return prefix.replace(/\/+$/, '') + '/app/center/webmanifest?' + params.join('&');
  };

  var appSurfaces = function (app) {
    var surfaces = [{ path: app.pathUrl, title: app.label || app.name }];
    (app.entries || []).forEach(function (entry) {
      if (entry && entry.url) {
        surfaces.push({ path: entry.url, title: entry.label || app.label || app.name });
      }
    });
    return surfaces;
  };

  var entriesFromApps = function (apps, options) {
    var entries = [];
    (apps || []).forEach(function (app) {
      if (!app || !app.name || !app.pathUrl) {
        return;
      }
      var icon = iconUrlFor(app.icon, options) || (options && options.defaultIcon) || '';
      appSurfaces(app).forEach(function (surface) {
        entries.push({
          path: surface.path,
          title: surface.title,
          icon: icon,
          manifest: manifestUrlFor(app, surface.path, options),
          appName: app.name
        });
      });
    });
    return entries;
  };

  var matchPwaEntry = function (pathname, entries) {
    var current = normalizePath(pathname);
    var specific = (entries || []).filter(function (entry) {
      return entry && normalizePath(entry.path) !== '/';
    });
    specific.sort(function (a, b) {
      return normalizePath(b.path).length - normalizePath(a.path).length;
    });
    for (var i = 0; i < specific.length; i += 1) {
      var entryPath = normalizePath(specific[i].path);
      if (current === entryPath || current.indexOf(entryPath + '/') === 0) {
        return specific[i];
      }
    }
    for (var j = 0; j < (entries || []).length; j += 1) {
      if (entries[j] && normalizePath(entries[j].path) === '/') {
        return entries[j];
      }
    }
    return null;
  };

  var resolveEntry = function (pathname, apps, options) {
    var published = entriesFromApps(apps, options);
    var shell = (options && options.shellEntries) || [];
    return matchPwaEntry(pathname, published.concat(shell));
  };

  var headTagsFor = function (entry, publicUrl) {
    var icon = withPublicUrl(entry.icon, publicUrl);
    var manifest = withPublicUrl(entry.manifest, publicUrl);
    var title = entry.title || '';
    return (
      (icon ? '<link id="pwa-apple-touch-icon" rel="apple-touch-icon" sizes="180x180" href="' + icon + '">' : '') +
      (title ? '<meta id="pwa-apple-title" name="apple-mobile-web-app-title" content="' + title + '">' : '') +
      (manifest ? '<link id="pwa-manifest" rel="manifest" href="' + manifest + '">' : '')
    );
  };

  var setAttr = function (id, name, value) {
    if (typeof document === 'undefined' || !value) {
      return;
    }
    var el = document.getElementById(id);
    if (el && el.getAttribute(name) !== value) {
      el.setAttribute(name, value);
    }
  };

  var applyPwaEntry = function (entry, options) {
    if (!entry || typeof document === 'undefined') {
      return entry;
    }
    var publicUrl = (options && options.publicUrl) || '';
    var icon = withPublicUrl(entry.icon, publicUrl);
    var manifest = withPublicUrl(entry.manifest, publicUrl);
    if (typeof window !== 'undefined') {
      window.__PWA_ACTIVE__ = { title: entry.title || '', icon: icon || '', manifest: manifest || '' };
    }
    if (entry.title) {
      document.title = entry.title;
    }
    if (document.readyState === 'loading' && !document.getElementById('pwa-manifest')) {
      document.write(headTagsFor(entry, publicUrl));
      return entry;
    }
    setAttr('pwa-manifest', 'href', manifest);
    setAttr('pwa-apple-touch-icon', 'href', icon);
    setAttr('pwa-apple-title', 'content', entry.title || '');
    return entry;
  };

  var parseApps = function (text) {
    try {
      var body = JSON.parse(text || '{}');
      return (body.data && body.data.pageData) || body.pageData || [];
    } catch (error) {
      return [];
    }
  };

  var fetchApps = function (options) {
    if (typeof XMLHttpRequest === 'undefined' || !options || !options.apiUrl) {
      return [];
    }
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', options.apiUrl, false);
      xhr.send(null);
      if (xhr.status >= 200 && xhr.status < 300) {
        return parseApps(xhr.responseText);
      }
    } catch (error) {}
    return [];
  };

  var currentPath = function () {
    if (typeof window === 'undefined') {
      return '/';
    }
    return window.location.pathname;
  };

  var applyCurrent = function () {
    var options = state.host || {};
    var apps = state.apps || [];
    return applyPwaEntry(resolveEntry(currentPath(), apps, options), options);
  };

  var isEmbedded = function () {
    try {
      return typeof window !== 'undefined' && !!window.parent && window.parent !== window;
    } catch (error) {
      return true;
    }
  };

  var reportEmbedLocation = function () {
    if (!isEmbedded()) {
      return;
    }
    try {
      window.parent.postMessage(
        {
          source: EMBED_MSG_SOURCE,
          type: 'location',
          href: String(window.location.href),
          pathname: String(window.location.pathname || ''),
          search: String(window.location.search || ''),
          hash: String(window.location.hash || '')
        },
        '*'
      );
    } catch (error) {}
  };

  var notifyHistoryListeners = function () {
    (state.historyListeners || []).forEach(function (listener) {
      try {
        listener();
      } catch (error) {}
    });
  };

  var installHistoryHooks = function () {
    if (state.hooked || typeof window === 'undefined' || !window.history) {
      return;
    }
    state.hooked = true;
    ['pushState', 'replaceState'].forEach(function (method) {
      var original = window.history[method];
      if (!original) {
        return;
      }
      window.history[method] = function () {
        var result = original.apply(this, arguments);
        notifyHistoryListeners();
        return result;
      };
    });
    window.addEventListener('popstate', notifyHistoryListeners);
  };

  var addHistoryListener = function (listener) {
    if (typeof listener !== 'function') {
      return;
    }
    installHistoryHooks();
    if (state.historyListeners.indexOf(listener) === -1) {
      state.historyListeners.push(listener);
    }
  };

  /**
   * 嵌在应用中心「主页」iframe 时：向父页上报地址变化，并响应父页的后退/前进/刷新。
   * 跨域下父页无法可靠调用 iframe.history，须由子页自行 history.back/forward。
   */
  var installEmbedBridge = function () {
    if (typeof window === 'undefined' || state.embedInstalled || window.__kneEmbedBridgeInstalled) {
      return !!state.embedInstalled || !!window.__kneEmbedBridgeInstalled;
    }
    if (!isEmbedded()) {
      return false;
    }
    state.embedInstalled = true;
    window.__kneEmbedBridgeInstalled = true;
    addHistoryListener(reportEmbedLocation);
    window.addEventListener('message', function (event) {
      var data = event && event.data;
      if (!data || data.source !== EMBED_HOST_SOURCE || data.type !== 'history') {
        return;
      }
      try {
        if (data.action === 'back') {
          window.history.back();
        } else if (data.action === 'forward') {
          window.history.forward();
        } else if (data.action === 'reload') {
          window.location.reload();
        }
      } catch (error) {}
    });
    reportEmbedLocation();
    return true;
  };

  /** 服务端注入到入口 HTML：无完整 PWA 配置时也能在 iframe 内启用地址上报 */
  var injectEmbedBridgeHtml = function (html) {
    var text = String(html || '');
    if (!text || text.indexOf(EMBED_SCRIPT_ID) !== -1) {
      return text;
    }
    var script =
      '<script id="' +
      EMBED_SCRIPT_ID +
      '">(function(w){if(!w||!w.parent||w.parent===w||w.__kneEmbedBridgeInstalled)return;w.__kneEmbedBridgeInstalled=true;var SRC="' +
      EMBED_MSG_SOURCE +
      '",HOST="' +
      EMBED_HOST_SOURCE +
      '";var report=function(){try{w.parent.postMessage({source:SRC,type:"location",href:String(w.location.href),pathname:String(w.location.pathname||""),search:String(w.location.search||""),hash:String(w.location.hash||"")},"*");}catch(e){}};var wrap=function(m){var o=w.history[m];if(!o)return;w.history[m]=function(){var r=o.apply(this,arguments);report();return r;};};wrap("pushState");wrap("replaceState");w.addEventListener("popstate",report);w.addEventListener("message",function(ev){var d=ev&&ev.data;if(!d||d.source!==HOST||d.type!=="history")return;try{if(d.action==="back")w.history.back();else if(d.action==="forward")w.history.forward();else if(d.action==="reload")w.location.reload();}catch(e){}});report();})(window);</script>';
    if (/<\/body>/i.test(text)) {
      return text.replace(/<\/body>/i, script + '</body>');
    }
    return text + script;
  };

  var installPwaDocument = function (options) {
    state.host = Object.assign({}, state.host, options || {});
    if (options && Object.prototype.hasOwnProperty.call(options, 'apps')) {
      state.apps = options.apps || [];
    } else if (!state.apps) {
      state.apps = fetchApps(state.host);
    }
    var entry = applyCurrent();
    addHistoryListener(applyCurrent);
    installEmbedBridge();
    return entry;
  };

  var syncPwaDocument = function (apps, options) {
    return installPwaDocument(Object.assign({}, options, { apps: apps || [] }));
  };

  var buildWebManifest = function (app, options) {
    options = options || {};
    var scope = app.pathUrl || '/';
    var startPath = options.path || scope;
    var title = options.title || app.label || app.name;
    var icon = options.icon || '';
    var manifest = {
      id: startPath,
      name: title,
      short_name: title,
      description: app.description || '',
      lang: 'zh-CN',
      start_url: startPath,
      scope: scope,
      display: 'standalone',
      theme_color: options.themeColor || '#0080FF',
      background_color: options.backgroundColor || '#f6f7f9',
      icons: []
    };
    if (icon) {
      manifest.icons = [
        { src: icon, sizes: '192x192', type: 'image/png' },
        { src: icon, sizes: '512x512', type: 'image/png' }
      ];
    }
    return manifest;
  };

  var SCRIPT_RE = /(<script\b[^>]*>[\s\S]*?<\/script>)/gi;

  var isScript = function (part) {
    return /^<script\b/i.test(part);
  };

  var replaceAttr = function (attrs, attr, value) {
    var attrRe = new RegExp('\\s' + attr + '="[^"]*"');
    if (attrRe.test(attrs)) {
      return attrs.replace(attrRe, ' ' + attr + '="' + value + '"');
    }
    return attrs + ' ' + attr + '="' + value + '"';
  };

  var replaceTagById = function (html, id, attr, value) {
    return html.replace(new RegExp('<([a-zA-Z0-9:-]+)([^>]*\\bid="' + id + '"[^>]*)>', 'g'), function (full, name, attrs) {
      return '<' + name + replaceAttr(attrs, attr, value) + '>';
    });
  };

  var hasTagId = function (html, id) {
    return new RegExp('<[a-zA-Z0-9:-]+[^>]*\\bid="' + id + '"[^>]*>').test(html);
  };

  var rewriteTags = function (html, entry) {
    var next = html;
    if (entry.manifest && hasTagId(next, 'pwa-manifest')) {
      next = replaceTagById(next, 'pwa-manifest', 'href', entry.manifest);
    }
    if (entry.icon && hasTagId(next, 'pwa-apple-touch-icon')) {
      next = replaceTagById(next, 'pwa-apple-touch-icon', 'href', entry.icon);
    }
    if (entry.title) {
      next = replaceTagById(next, 'pwa-apple-title', 'content', entry.title);
    }
    return next;
  };

  /**
   * 服务端返回 HTML 前写好 manifest / 图标 / 标题。
   * 只改 script 之外的标签，不改脚本正文。
   */
  var applyPwaHtml = function (html, entry, options) {
    if (!entry) {
      return html;
    }
    var rewritten = String(html)
      .split(SCRIPT_RE)
      .map(function (part) {
        return isScript(part) ? part : rewriteTags(part, entry);
      })
      .join('');
    var outside = rewritten
      .split(SCRIPT_RE)
      .filter(function (part) {
        return !isScript(part);
      })
      .join('');
    if (hasTagId(outside, 'pwa-manifest')) {
      return rewritten;
    }
    var tags = headTagsFor(entry, options && options.publicUrl);
    if (/<meta\s+charset=/i.test(rewritten)) {
      return rewritten.replace(/(<meta\s+charset="[^"]*"\s*\/?>)/i, '$1' + tags);
    }
    return rewritten.replace(/<head([^>]*)>/i, '<head$1>' + tags);
  };

  return {
    normalizePath: normalizePath,
    appSurfaces: appSurfaces,
    entriesFromApps: entriesFromApps,
    matchPwaEntry: matchPwaEntry,
    resolveEntry: resolveEntry,
    applyPwaEntry: applyPwaEntry,
    applyPwaHtml: applyPwaHtml,
    injectEmbedBridgeHtml: injectEmbedBridgeHtml,
    installEmbedBridge: installEmbedBridge,
    installPwaDocument: installPwaDocument,
    syncPwaDocument: syncPwaDocument,
    buildWebManifest: buildWebManifest,
    iconUrlFor: iconUrlFor,
    EMBED_MSG_SOURCE: EMBED_MSG_SOURCE,
    EMBED_HOST_SOURCE: EMBED_HOST_SOURCE
  };
});
