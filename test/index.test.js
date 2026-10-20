const { expect } = require('chai');
const pwa = require('../index');

const shellEntries = [
  { path: '/apps', manifest: '/manifest-apps.json', icon: '/pwa/apps.png', title: '应用中心' },
  { path: '/', manifest: '/manifest.json', icon: '/pwa/home.png', title: '开发者文档' }
];

const apps = [
  {
    name: 'talent-saas',
    label: '人才市场',
    pathUrl: '/app/talent-saas/',
    icon: 'file-1?filename=icon.png',
    entries: [{ label: '租户端', url: '/app/talent-saas/tenant' }]
  }
];

describe('@kne/pwa-document', () => {
  it('normalizePath 去掉查询、哈希与结尾斜杠', () => {
    expect(pwa.normalizePath('/app/a/?x=1#y')).to.equal('/app/a');
    expect(pwa.normalizePath('')).to.equal('/');
  });

  it('resolveEntry 优先匹配更长的已发布路径，/ 只作兜底', () => {
    const options = { shellEntries };
    expect(pwa.resolveEntry('/app/talent-saas/tenant/list', apps, options).title).to.equal('租户端');
    expect(pwa.resolveEntry('/app/talent-saas/home', apps, options).title).to.equal('人才市场');
    expect(pwa.resolveEntry('/apps', apps, options).title).to.equal('应用中心');
    expect(pwa.resolveEntry('/blog/1', apps, options).title).to.equal('开发者文档');
  });

  it('已发布应用的 manifest 指向 webmanifest 接口，入口带 path', () => {
    const entry = pwa.resolveEntry('/app/talent-saas/tenant', apps, { shellEntries });
    expect(entry.manifest).to.equal('/api/v1/app-manager/app/center/webmanifest?name=talent-saas&path=%2Fapp%2Ftalent-saas%2Ftenant');
    expect(entry.icon).to.equal('/api/v1/static/file-id/file-1?filename=icon.png');
  });

  it('buildWebManifest 以入口为 start_url，以应用路径为 scope', () => {
    const manifest = pwa.buildWebManifest(apps[0], { path: '/app/talent-saas/tenant', title: '租户端', icon: '/i.png' });
    expect(manifest.start_url).to.equal('/app/talent-saas/tenant');
    expect(manifest.scope).to.equal('/app/talent-saas/');
    expect(manifest.icons).to.have.length(2);
  });

  it('applyPwaHtml 在 charset 后写入标签且不改脚本正文', () => {
    const html = '<html><head><meta charset="utf-8"/><script>var a = \'<link id="pwa-manifest" href="/x">\';</script></head></html>';
    const entry = pwa.resolveEntry('/apps', apps, { shellEntries });
    const out = pwa.applyPwaHtml(html, entry);
    expect(out).to.contain('<meta charset="utf-8"/><link id="pwa-apple-touch-icon"');
    expect(out).to.contain('href="/manifest-apps.json"');
    expect(out).to.contain('<link id="pwa-manifest" href="/x">');
  });

  it('applyPwaHtml 已有标签时只改属性', () => {
    const html = '<head><link id="pwa-manifest" rel="manifest" href="/manifest.json"></head>';
    const out = pwa.applyPwaHtml(html, { manifest: '/manifest-apps.json', title: '应用中心' });
    expect(out).to.equal('<head><link id="pwa-manifest" rel="manifest" href="/manifest-apps.json"></head>');
  });
});
