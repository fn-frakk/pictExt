/**
 * 生成 preview.html：
 * 用 jsdom 真跑一遍扩展内容脚本（假数据），把它渲染出来的面板 HTML 原样截取，
 * 再套上站点自己的样式表，保证"预览 = 实际注入效果"。
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const SCRIPT = fs.readFileSync(path.join(__dirname, '..', 'dist', 'content.js'), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cssMatch = SCRIPT.match(/const CSS = `([\s\S]*?)`;/);
if (!cssMatch) throw new Error('没找到 CSS 模板');
const panelCss = cssMatch[1].replace(/\$\{PANEL_ID\}/g, 'pictExt-panel');

function topic(i, extra = {}) {
  return {
    id: 't' + i,
    title: [
      'PickCat 创作者等级',
      '神岛即将停运，但 BOX3 本地引擎他来了！',
      '【UI 优化月】分享你对 PICKCAT 界面的看法与改动建议',
      '小雪话奇思 | 假如给你 $100 token，你想做些什么？',
      '为什么我觉得 boxplay 不好用',
    ][i % 5],
    kind: 'DISCUSSION',
    excerpt: '这里是一段帖子摘要，用来占位展示两行截断的效果，长度大概和站内真实摘要接近，方便看排版。',
    author: { id: 'u' + i, username: ['旁观者jers', '吉吉喵', 'zaona', 'pigeonxian', 'lxy24'][i % 5], avatar: {} },
    tags: [
      { slug: 'creative-works', name: '创作与作品' },
      { slug: 'box', name: '神奇代码岛' },
      { slug: 'events-competitions', name: '活动与赛事' },
    ].slice(0, (i % 3) + 1),
    replyCount: [56, 112, 276, 60, 0][i % 5],
    viewCount: [229, 417, 296, 157, 1][i % 5],
    likeCount: [40, 36, 30, 18, 1][i % 5],
    bookmarkCount: [3, 8, 12, 2, 0][i % 5],
    pinned: i === 0,
    createdAt: '2026-11-0' + ((i % 9) + 1) + 'T10:00:00.000Z',
    lastActivityAt: new Date(Date.now() - (i + 1) * 3600 * 1000).toISOString(),
  };
}

const HOME_HTML = `<!doctype html><html><head></head><body>
<div id="__nuxt"><main><section class="min-w-0 flex-1">
  <div role="group" aria-label="首页列表控制" class="mb-3">
    <div role="group" aria-label="首页排序"><div role="tablist">
      <button role="tab">关注</button><button role="tab">推荐</button><button role="tab">最新</button>
    </div></div>
  </div>
  <section aria-label="推荐帖子"><article class="group relative isolate grid min-w-0 grid-cols-1 min-h-46 gap-3 py-5 px-3.5 desktop:px-5 rounded-lg bg-(--ui-card-translucent)">native</article></section>
</section></main></div></body></html>`;

(async () => {
  // 取站点当前构建的样式表路径，避免 preview 里的 hash 过期
  let cssHref = '/_nuxt/entry.B82h2TXf.css';
  try {
    const res = await fetch('https://pickcat.dao3.fun/');
    const html = await res.text();
    const m = html.match(/href="(\/_nuxt\/entry\.[^"]+\.css)"/);
    if (m) cssHref = m[1];
  } catch {
    /* 断网就用默认值 */
  }

  const dom = new JSDOM(HOME_HTML, {
    url: 'http://localhost/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.localStorage.setItem(
        'pictExt:settings:v1',
        JSON.stringify({ sortMode: 'replace', showTimes: true, defaultSort: 'likes' })
      );
      window.fetch = async (url) => {
        const u = new URL(url);
        const sort = u.searchParams.get('sort') || 'latest';
        const items = Array.from({ length: 12 }, (_, k) => topic(k + (sort === 'hot' ? 0 : 2)));
        return { ok: true, status: 200, json: async () => ({ items, pageInfo: { hasNextPage: true, nextCursor: 'x' } }) };
      };
    },
  });
  const { window } = dom;
  window.eval(SCRIPT);
  await sleep(400);
  const doc = window.document;
  doc.querySelector('[data-sort="likes"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(800);
  const panelHTML = doc.getElementById('pictExt-panel').outerHTML;

  // ---- 设置页：同样真跑一遍，截出 PICTEXT 板块 ----
  const SETTINGS_HTML = `<!doctype html><html><body>
  <div id="__nuxt"><main>
    <div class="grid min-h-[calc(100vh-132px)] grid-cols-[minmax(0,1fr)] content-start items-start gap-3">
      <aside aria-label="设置" class="hidden min-w-0 desktop:block">
        <nav aria-label="设置分类" class="flex flex-col gap-1">
          <button type="button" class="flex h-11 items-center gap-2.5 rounded-md px-4 text-sm font-semibold text-muted hover:bg-accented">个人资料</button>
          <button type="button" class="flex h-11 items-center gap-2.5 rounded-md px-4 text-sm font-semibold text-muted hover:bg-accented">账号安全</button>
        </nav>
      </aside>
      <div id="settings-profile" class="grid min-w-0 gap-4">
        <section class="rounded-lg overflow-hidden bg-default"><div class="p-4 desktop:p-6 sm:p-4">
          <div class="mb-5 flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <div class="min-w-0"><h2 class="text-base font-semibold text-default">个人资料</h2></div>
          </div>
        </div></section>
      </div>
    </div>
  </main></div></body></html>`;
  const setDom = new JSDOM(SETTINGS_HTML, {
    url: 'https://pickcat.dao3.fun/settings',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    beforeParse(w) {
      w.fetch = async () => ({ ok: true, status: 200, json: async () => ({}) });
    },
  });
  setDom.window.eval(SCRIPT);
  await sleep(400);
  const sdoc = setDom.window.document;
  sdoc.querySelector('[data-px-settings-nav]')?.dispatchEvent(new setDom.window.MouseEvent('click', { bubbles: true }));
  await sleep(300);
  const settingsHTML = sdoc.getElementById('pictExt-settings')?.outerHTML || '';
  const settingsNavHTML = sdoc.querySelector('[data-px-settings-nav]')?.outerHTML || '';

  const html = `<!doctype html>
<html lang="zh-CN" class="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>pictExt 样式预览</title>
<!-- 直接用站点自己的样式表，保证类名效果一致 -->
<link rel="stylesheet" href="https://pickcat.dao3.fun${cssHref}" crossorigin>
<style>
${panelCss}
  body{ margin:0; padding:26px 16px 70px; background:var(--ui-bg,#f6f7fb); color:var(--ui-text,#111); font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif; }
  .wrap{max-width:660px;margin:0 auto}
  .hint{max-width:660px;margin:0 auto 18px;font-size:13px;line-height:1.8;color:var(--ui-text-muted,#6b7280)}
  .hint b{color:var(--ui-text,#111)}
  .toggle{position:fixed;right:18px;top:18px;z-index:99;cursor:pointer;border:1px solid var(--ui-border,rgba(127,127,127,.3));background:var(--ui-bg-elevated,#fff);color:var(--ui-text,#111);border-radius:9px;padding:7px 13px;font-size:13px;font-family:inherit}
  .shell{background:var(--ui-bg,#fff);border:1px solid var(--ui-border,rgba(127,127,127,.2));border-radius:16px;padding:16px}
  .native-bar{display:flex;align-items:center;justify-content:space-between;min-height:44px;margin-bottom:4px}
  .native-tabs{display:flex;gap:2px}
  .native-tab{position:relative;border:0;background:transparent;font-family:inherit;font-size:15px;font-weight:500;color:var(--ui-text-muted,#6b7280);padding:6px 10px;border-radius:8px;cursor:default}
  .native-tab[data-state="active"]{color:var(--ui-primary,#3b82f6)}
  .native-tab[data-state="active"]::after{content:"";position:absolute;left:10px;right:10px;bottom:-2px;height:1px;background:var(--ui-primary,#3b82f6)}
  .sec-title{margin:26px 0 10px;font-size:15px;font-weight:800}
  .reply-demo{border:1px solid var(--ui-border,rgba(127,127,127,.2));border-radius:12px;padding:12px}
  .reply-demo p{margin:0 0 6px;font-size:14px;line-height:1.7}
  .reply-demo .indent{margin-left:46px;background:var(--ui-comment-replies-bg,rgba(127,127,127,.06));border-radius:8px;padding:4px 12px;font-size:13px;color:var(--ui-text-muted,#6b7280)}
</style>
</head>
<body>
<button class="toggle" onclick="var h=document.documentElement;h.classList.toggle('dark');h.classList.toggle('light')">切换明 / 暗</button>
<p class="hint">
  <b>pictExt v1.5 预览</b>：排序栏 + 卡片都是扩展内容脚本真实渲染出来的 HTML，配合站点原样式表显示。<br>
  当前展示「全部替换」模式：站内原来的「关注 / 推荐 / 最新」整排被替换成下面这 8 项（关注、推荐流、最新、最多浏览、最多点赞、最多回复、最多收藏、最热），首页 / 所有板块页 / 搜索页都是同一套。<br>
  卡片底部开启了「显示改良」：原来的「x 时间前」换成 发布时间 / 最近更新 / 最近回复 三项。
</p>

<div class="wrap">
  <div class="shell">
    <div class="native-bar">
      <span style="font-size:15px;color:var(--ui-text-muted,#6b7280)">板块</span>
      <span style="font-size:12px;color:var(--ui-text-dimmed,#9ca3af)">（站内原生排序栏在替换模式下隐藏）</span>
    </div>

${panelHTML.replace(/^<div/, '<div')}
  </div>

  <div class="sec-title">设置页：左侧导航里的 PICTEXT 入口</div>
  <div class="shell" style="padding:0">
    <div class="flex gap-3" style="align-items:flex-start">
      <aside aria-label="设置" class="min-w-0" style="width:220px">
        <nav aria-label="设置分类" class="flex flex-col gap-1">
          <button type="button" class="flex h-11 min-w-0 items-center gap-2.5 rounded-md px-4 text-left text-sm font-semibold whitespace-nowrap text-muted transition-colors hover:bg-accented hover:text-default">个人资料</button>
          <button type="button" class="flex h-11 min-w-0 items-center gap-2.5 rounded-md px-4 text-left text-sm font-semibold whitespace-nowrap text-muted transition-colors hover:bg-accented hover:text-default">账号安全</button>
          ${settingsNavHTML}
        </nav>
      </aside>
      <div style="flex:1;min-width:0">
${settingsHTML}
      </div>
    </div>
  </div>

  <div class="sec-title">帖子详情页：楼中楼折叠</div>
  <div class="reply-demo">
    <p><b>吉吉喵</b> · 6 天前 · #1</p>
    <p>首楼正文，下面这一楼有 12 条回复，默认折叠。</p>
    <button class="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted hover:text-primary transition-colors" style="margin-left:46px;margin-bottom:4px">
      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 256 256" fill="currentColor" class="shrink-0"><path d="${'M128 24a104 104 0 0 0-91.82 152.88l-11.35 34.05a16 16 0 0 0 20.24 20.24l34.05-11.35A104 104 0 1 0 128 24m0 192a87.87 87.87 0 0 1-44.06-11.81a8 8 0 0 0-6.54-.67L40 216l12.47-37.4a8 8 0 0 0-.66-6.54A88 88 0 1 1 128 216'}"/></svg>
      <span>展开 12 条回复</span>
    </button>
    <div class="indent">↑ 点这里的「展开 / 收起」；评论排序旁边还有「折叠全部回复」</div>
  </div>
</div>
</body>
</html>`;

  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'preview.html'), html);
  console.log('docs/preview.html 已生成', html.length, 'bytes');
  process.exit(0);
})();
