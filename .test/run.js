/**
 * pictExt 本地冒烟测试（jsdom）v1.5
 * 覆盖：
 *  A. 原版模式（默认）：完全不替换，页面上不出现任何扩展排序栏
 *  B. 全部替换模式：首页 9 项排序、板块页 10 项、搜索页 9 项、原生节点隐藏
 *  C. 显示改良：卡片上 发布时间 / 最近更新 / 最近回复
 *  D. 详情页：原版只有「折叠全部回复」；改版 5 项（含 最多点赞 真重排）；评论区按页显示
 *  E. 设置页：新增下拉与开关数量、写盘
 *  F. Cookie：默认 omit；关注流才 include；不写 localStorage
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const SCRIPT = fs.readFileSync(path.join(__dirname, '..', 'dist', 'content.js'), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SETTINGS_KEY = 'pictExt:settings:v1';

let failures = 0;
function ok(cond, msg, extra) {
  if (cond) console.log('  ✓ ' + msg);
  else {
    failures++;
    console.log('  ✗ ' + msg + (extra ? ' → ' + extra : ''));
  }
}

function makeTopic(i, extra = {}) {
  return {
    id: 'topic-' + i,
    title: '帖子标题 ' + i,
    kind: 'DISCUSSION',
    excerpt: '这是第 ' + i + ' 条帖子的摘要内容',
    author: { id: 'u' + i, username: '用户' + i, avatar: { url: '/api/v1/avatars/a' + i } },
    tags: [{ slug: 'box', name: '神奇代码岛' }],
    replyCount: i * 3,
    viewCount: i * 11,
    likeCount: (i * 7) % 23,
    bookmarkCount: (i * 5) % 13,
    pinned: false,
    createdAt: '2026-11-' + String((i % 28) + 1).padStart(2, '0') + 'T10:00:00.000Z',
    editedAt: i % 3 === 0 ? '2026-11-13T08:00:00.000Z' : null,
    lastActivityAt: '2026-11-14T0' + (i % 9) + ':00:00.000Z',
    ...extra,
  };
}

/** 统一的 fetch 假实现 */
function installFetch(window, calls, detail, opts = {}) {
  const json = (obj) => ({ ok: true, status: 200, json: async () => obj });
  const err = (status) => ({ ok: false, status, json: async () => ({ statusCode: status }) });
  window.fetch = async (url, init) => {
    calls.push({ url, init });
    const u = new URL(url);
    const p = u.pathname;
    const q = u.searchParams.get('q') || '';
    const sort = u.searchParams.get('sort') || '';
    const tag = u.searchParams.get('tag') || '';

    if (p === '/api/v1/session') return opts.loggedIn ? json({ user: { id: 'me' } }) : err(401);
    if (p === '/api/v1/topic-recommendations') {
      if (u.searchParams.get('scope') === 'following' && !opts.loggedIn) return err(401);
      const cur = u.searchParams.get('cursor');
      if (cur === 'r2') {
        const items = Array.from({ length: 3 }, (_, k) => makeTopic(300 + k));
        return json({ strategy: 'TRENDING', items, pageInfo: { hasNextPage: false, nextCursor: null } });
      }
      const items = Array.from({ length: 4 }, (_, k) => makeTopic(200 + k));
      return json({ strategy: 'TRENDING', items, pageInfo: { hasNextPage: true, nextCursor: 'r2' } });
    }
    if (/^\/api\/v1\/topics\/[^/]+\/posts$/.test(p)) {
      const p1 = {
        id: 'p1',
        postNumber: 2,
        likeCount: 2,
        pinned: false,
        children: [{ id: 'c1', children: [] }],
        author: { id: 'u1' },
        createdAt: '2026-11-20T10:00:00.000Z',
        cookedHtml: '<p>第一条回复：Box 与 pickcat 的区别</p>',
      };
      const p2 = {
        id: 'p2',
        postNumber: 3,
        likeCount: 9,
        pinned: false,
        children: [{ id: 'c2', children: [] }, { id: 'c3', children: [{ id: 'c4', children: [] }] }],
        author: { id: 'u2' },
        createdAt: '2026-11-21T10:00:00.000Z',
        cookedHtml: '<p>第二条回复：今天摸鱼，没有关键词</p>',
      };
      // 站点会按 sort 返回不同顺序：最热 p2 在前，最早 p1 在前
      const items = u.searchParams.get('sort') === 'earliest' ? [p1, p2] : [p2, p1];
      return json({ items, pageInfo: { hasNextPage: false, nextCursor: null } });
    }
    if (/^\/api\/v1\/users\/[^/]+\/following$/.test(p)) {
      return json({ items: [{ user: { id: 'u2' } }], pageInfo: { hasNextPage: false, nextCursor: null } });
    }
    if (/^\/api\/v1\/works\/[^/]+\/comments$/.test(p)) {
      // 作品评论：扁平列表（回复也是 item，靠 replyToCommentNumber 关联），字段用 commentNumber
      const w1 = {
        id: 'w1',
        commentNumber: 1,
        likeCount: 1,
        pinned: false,
        replyToCommentNumber: null,
        children: [],
        author: { id: 'u1' },
        createdAt: '2026-11-01T10:00:00.000Z',
      };
      const w1a = {
        id: 'w1a',
        commentNumber: 2,
        likeCount: 0,
        pinned: false,
        replyToCommentNumber: 1,
        children: [],
        author: { id: 'u3' },
        createdAt: '2026-11-01T11:00:00.000Z',
      };
      const w2 = {
        id: 'w2',
        commentNumber: 3,
        likeCount: 8,
        pinned: false,
        replyToCommentNumber: null,
        children: [],
        author: { id: 'u2' },
        createdAt: '2026-11-02T10:00:00.000Z',
      };
      const all = [w1, w1a, w2];
      const items = u.searchParams.get('sort') === 'earliest' ? all : all.slice().reverse();
      return json({ items, pageInfo: { hasNextPage: false, nextCursor: null } });
    }
    if (/^\/api\/v1\/topic-collections\/col-[^/]+\/topics$/.test(p)) {
      const n = Number((p.match(/col-(\d+)/) || [])[1] || 1);
      return json({
        items: [
          makeTopic(n, { id: 'topic-c' + n, title: '合集 ' + n + ' 的帖子', viewCount: n * 100, likeCount: n * 10, replyCount: n }),
        ],
        pageInfo: { hasNextPage: false, nextCursor: null },
      });
    }
    if (/^\/api\/v1\/topic-collections\/[^/]+\/topics$/.test(p)) {
      const items = [
        makeTopic(1, { id: 'topic-1', title: '合集帖 1', viewCount: 10, likeCount: 1, replyCount: 1, bookmarkCount: 1 }),
        makeTopic(701, { id: 'topic-701', title: '合集帖 2', viewCount: 30, likeCount: 5, replyCount: 2, bookmarkCount: 0 }),
        makeTopic(702, { id: 'topic-702', title: '合集帖 3', viewCount: 20, likeCount: 3, replyCount: 9, bookmarkCount: 4 }),
      ];
      return json({ items, pageInfo: { hasNextPage: false, nextCursor: null } });
    }
    if (/^\/api\/v1\/topics\/[^/]+$/.test(p)) {
      if (detail) return json(detail);
      // Super 搜索：模拟「帖子已被删」（失效条目清理用）
      if (opts.superGone && opts.superGone.includes(p.split('/').pop())) return err(404);
      const id = p.split('/').pop();
      const i = Number(String(id).replace('topic-', '').replace('topic-s', '')) || 1;
      return json({ id, firstPost: { likeCount: i * 7 } });
    }
    if (p === '/api/v1/topics') {
      if (q) {
        const items = Array.from({ length: 12 }, (_, k) => {
          const t = makeTopic(k + 1, { id: 'topic-s' + (k + 1), replyCount: (k + 1) * 4 });
          delete t.likeCount;
          // 第 1 条只命中标题；第 2 条命中首楼（仍算帖子）；其余命中评论楼层
          if (k === 1) t.match = { postNumber: 1, excerpt: '命中的首楼摘要' };
          else if (k > 0) t.match = { postNumber: 2 + k, excerpt: '命中的楼层摘要 ' + (k + 1) };
          return t;
        });
        return json({ items, pageInfo: { hasNextPage: false, nextCursor: null } });
      }
      // 可解码游标的候选池（v1.7.5 并行加速用）：游标 = base64url(JSON)，位置是活跃时间点
      if (opts.timePool) {
        if (opts.timePool.slowMs) await sleep(opts.timePool.slowMs);
        const per = opts.timePool.per || 50;
        const step = opts.timePool.stepMs || 3600000;
        const T0 = Date.parse('2026-11-15T00:00:00.000Z');
        const total = (opts.timePool.pages || 20) * per;
        let start = 0;
        const cur = u.searchParams.get('cursor');
        if (cur) {
          const o = JSON.parse(Buffer.from(String(cur).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
          start = Math.max(0, Math.round((T0 - Date.parse(o.position.orderedAt)) / step));
        }
        const items = [];
        for (let k = 0; k < per; k++) {
          const gi = start + k;
          if (gi >= total) break;
          const act = new Date(T0 - gi * step).toISOString();
          // 发布时间故意跟活跃时间不同序，用来验证「最新」是按发布时间排的
          const pub = new Date(T0 - ((gi * 7919) % total) * step).toISOString();
          items.push(
            makeTopic(gi + 1, {
              id: 'tp-' + gi,
              title: '池帖 ' + gi,
              createdAt: pub,
              lastActivityAt: act,
              viewCount: gi,
              likeCount: gi % 50,
              replyCount: gi % 7,
              bookmarkCount: gi % 5,
            })
          );
        }
        const lastIdx = start + items.length - 1;
        const hasNext = items.length === per && lastIdx + 1 < total;
        const next = hasNext
          ? Buffer.from(
              JSON.stringify({
                v: 1,
                mode: 'browse',
                binding: { q: null, sort, kind: null, tags: [], tagMode: 'all' },
                position: { pinnedRank: 1, orderedAt: new Date(T0 - (lastIdx + 1) * step).toISOString(), id: 'x' },
              })
            )
              .toString('base64url')
          : null;
        return json({ items, pageInfo: { hasNextPage: !!next, nextCursor: next } });
      }
      // 可翻页的候选池：poolPages = { latest: 12, hot: 5 } 表示每条链各有几页（每页 20 条）
      if (opts.poolPages) {
        const chain = sort === 'hot' ? 'hot' : 'latest';
        const total = opts.poolPages[chain] || 0;
        const cur = u.searchParams.get('cursor');
        const pageNo = cur ? Number(String(cur).split('-').pop()) : 1;
        if (!total || pageNo > total) return json({ items: [], pageInfo: { hasNextPage: false, nextCursor: null } });
        const base = (chain === 'hot' ? 1000 : 500) + (pageNo - 1) * 20;
        const items = Array.from({ length: 20 }, (_, k) => makeTopic(base + k));
        const next = pageNo < total ? `${chain}-${pageNo + 1}` : null;
        return json({ items, pageInfo: { hasNextPage: !!next, nextCursor: next } });
      }
      const start = sort === 'hot' ? 100 : 1;
      const items = Array.from({ length: 20 }, (_, k) => makeTopic(start + k));
      return json({ items, pageInfo: { hasNextPage: false, nextCursor: null } });
    }
    return json({ items: [], pageInfo: { hasNextPage: false, nextCursor: null } });
  };
}

function statOf(card, label) {
  const li = [...card.querySelectorAll('ul[aria-label="帖子数据"] li')].find((x) => x.textContent.startsWith(label));
  return li ? Number(li.textContent.replace(label, '')) : null;
}

const HOME_HTML = `<!doctype html><html class="dark"><head></head><body>
<div id="__nuxt" class="isolate"><main>
  <section class="min-w-0 flex-1 pt-3">
    <div role="group" aria-label="首页列表控制" class="mb-3 flex">
      <a href="/forum">板块</a>
      <div role="group" aria-label="首页排序" class="ml-auto">
        <div role="tablist">
          <button role="tab" data-state="active" aria-selected="true">关注</button>
          <button role="tab" data-state="inactive" aria-selected="false">推荐</button>
          <button role="tab" data-state="inactive" aria-selected="false">最新</button>
        </div>
      </div>
    </div>
    <section aria-label="推荐帖子" class="space-y-3">
      <article class="group relative isolate grid min-w-0 grid-cols-1 min-h-46 gap-3 py-5 rounded-lg native-card">原生卡片 1</article>
      <article class="group relative isolate grid min-w-0 grid-cols-1 min-h-46 gap-3 py-5 rounded-lg native-card">原生卡片 2</article>
    </section>
    <div aria-hidden="true" class="h-px"></div>
    <div class="native-foot">已经到底了</div>
  </section>
</main></div></body></html>`;

/* 对齐站点真实结构（D0PvLqIs.js 的 ForumCategoryFeed）：
   section[aria-label="{板块名}板块"] > div[aria-label="当前板块筛选"] + section[aria-label="板块帖子"] */
const CATEGORY_HTML = `<!doctype html><html><head></head><body>
<div id="__nuxt"><main>
  <div class="min-w-0">
    <section aria-label="创作与作品板块" class="min-w-0">
      <div aria-label="当前板块筛选" class="mb-3 text-sm hidden"><div class="flex gap-1"><button>#手绘</button></div></div>
      <section aria-label="板块帖子" class="space-y-3">
        <article class="group relative isolate grid min-w-0 grid-cols-1 min-h-42 gap-3 py-4 rounded-lg native-card">板块原生卡片</article>
        <div class="flex justify-center pt-1 pb-4"><button>加载更多</button></div>
      </section>
    </section>
  </div>
</main></div></body></html>`;

/* 同样的列表但用 div 包（旧结构 / 站点改版兜底用） */
const CATEGORY_HTML_LEGACY = `<!doctype html><html><head></head><body>
<div id="__nuxt"><main>
  <div class="min-w-0">
    <div aria-label="板块帖子" class="space-y-3">
      <article class="group relative isolate grid min-w-0 grid-cols-1 min-h-42 gap-3 py-4 rounded-lg native-card">板块原生卡片</article>
    </div>
    <div class="native-more">加载更多</div>
  </div>
</main></div></body></html>`;

const SEARCH_HTML = `<!doctype html><html><head></head><body>
<div id="__nuxt"><main>
  <div class="contents">
    <aside aria-label="搜索筛选">
      <section aria-label="结果排序"><button>相关度最高</button></section>
      <nav aria-label="搜索分类"><button>帖子</button></nav>
    </aside>
    <section class="min-w-0"><div class="space-y-5"><section aria-label="帖子">
      <div aria-label="帖子搜索结果" class="search-forum-results">
        <article class="group relative isolate grid min-w-0 grid-cols-1 min-h-33 gap-2.5 px-3.5 py-3.5 max-desktop:p-4 rounded-lg">
          原生搜索结果
        </article>
      </div>
      <nav aria-label="帖子搜索分页"><button>下一页</button></nav>
    </section></div></section>
  </div>
</main></div></body></html>`;

/** 详情页：按站点真实结构还原（评论排序是 USelect 下拉；所有楼层同父；末尾有「加载更多回复」） */
const DETAIL_HTML = `<!doctype html><html><head></head><body>
<div id="__nuxt"><main>
  <h1 class="post-title">神岛即将停运，但 BOX3 本地引擎他来了！</h1>
  <section id="comments" class="mt-12 min-w-0 scroll-mt-24 pb-24">
    <div class="min-w-0">
      <div class="flex min-h-10 flex-wrap items-center gap-3">
        <h2 class="inline-flex items-baseline gap-0.5 text-lg font-black"><span>全部评论</span><span class="text-sm font-bold text-muted tabular-nums"> （112） </span></h2>
        <button aria-label="评论排序" role="group" class="ml-auto shrink-0 text-[15px] desktop:text-base">最热</button>
      </div>
    </div>
    <div class="mt-4 min-w-0 [overflow-anchor:none]">
      <article aria-label="吉吉喵 的评论" class="min-w-0 py-4 desktop:py-6">
        <div data-post-id="p1" id="post-2" class="grid grid-cols-[34px_minmax(0,1fr)] gap-3">
          <div class="min-w-0"><p>首楼正文</p></div>
        </div>
        <div class="post-comment-replies mt-2 ml-[46px] rounded-lg px-3 py-1">
          <div class="space-y-0"><div data-post-id="p1a" class="py-2">回复 A</div></div>
        </div>
      </article>
      <article aria-label="旁观者jers 的评论" class="min-w-0 py-4 desktop:py-6">
        <div data-post-id="p2" id="post-3" class="grid grid-cols-[34px_minmax(0,1fr)] gap-3">
          <div class="min-w-0"><p>二楼正文</p></div>
        </div>
        <div class="post-comment-replies mt-2 ml-[46px] rounded-lg px-3 py-1">
          <div class="space-y-0"><div data-post-id="p2a" class="py-2">回复 A</div><div data-post-id="p2b" class="py-2">回复 B</div><div data-post-id="p2c" class="py-2">回复 C</div></div>
        </div>
      </article>
      <div class="flex justify-center py-4"><button type="button">加载更多回复</button></div>
    </div>
  </section>
  <aside aria-label="帖子信息" class="hidden min-w-0 desktop:flex desktop:flex-col">
    <div class="flex shrink-0 flex-col"><div class="mb-6 flex flex-wrap gap-2"><span>#标签</span></div></div>
  </aside>
</main></div></body></html>`;

/** 作品详情页：评论区与帖子详情同一套组件（section#comments + article[…的评论]），但没有帖子信息栏 */
const WORK_DETAIL_HTML = `<!doctype html><html><head></head><body>
<div id="__nuxt"><main>
  <h1 class="work-title">我的第一个作品</h1>
  <section id="comments" class="mt-12 min-w-0 scroll-mt-24 pb-24">
    <div class="min-w-0">
      <div class="flex min-h-10 flex-wrap items-center gap-3">
        <h2 class="inline-flex items-baseline gap-0.5 text-lg font-black"><span>全部评论</span></h2>
        <button aria-label="评论排序" role="group" class="ml-auto shrink-0">最热</button>
      </div>
    </div>
    <div class="mt-4 min-w-0 [overflow-anchor:none]">
      <article aria-label="吉吉喵 的评论" class="min-w-0 py-4">
        <div data-post-id="w1" id="post-w1" class="grid grid-cols-[34px_minmax(0,1fr)] gap-3">
          <div class="min-w-0"><p>作品评论一</p></div>
        </div>
        <div class="post-comment-replies mt-2 ml-[46px]"><div class="space-y-0"><div data-post-id="w1a" id="post-w1a" class="py-2">回复一</div></div></div>
      </article>
      <article aria-label="旁观者jers 的评论" class="min-w-0 py-4">
        <div data-post-id="w2" id="post-w2" class="grid grid-cols-[34px_minmax(0,1fr)] gap-3">
          <div class="min-w-0"><p>作品评论二</p></div>
        </div>
      </article>
    </div>
  </section>
</main></div></body></html>`;

/** 12 层楼，用来看评论区分页 */
const DETAIL_MANY_HTML = `<!doctype html><html><head></head><body>
<div id="__nuxt"><main>
  <section id="comments" class="mt-12 min-w-0">
    <div class="min-w-0"><div class="flex min-h-10 items-center gap-3">
      <h2 class="inline-flex text-lg font-black">全部评论</h2>
      <button aria-label="评论排序" class="ml-auto">最热</button>
    </div></div>
    <div class="mt-4 min-w-0">
      ${Array.from({ length: 12 }, (_, k) =>
        `<article aria-label="用户${k} 的评论" class="min-w-0 py-4"><div data-post-id="m${k}" id="post-${
          k + 2
        }" class="grid grid-cols-[34px_minmax(0,1fr)] gap-3"><div class="min-w-0"><p>第 ${k + 1} 楼</p></div></div></article>`
      ).join('')}
    </div>
  </section>
</main></div></body></html>`;

/** 一层楼 + n 条楼中楼回复 */
function threadHTML(n, extraFloorP = '') {
  const replies = Array.from(
    { length: n },
    (_, k) =>
      `<div data-post-id="r${k + 1}" id="post-${100 + k}" class="py-2"><div class="min-w-0"><p>回复 ${k + 1}</p></div></div>`
  ).join('');
  return `<!doctype html><html><head></head><body>
<div id="__nuxt"><main>
  <section id="comments" class="mt-12 min-w-0">
    <div class="flex items-center gap-3"><h2 class="text-lg font-black">全部评论</h2>
      <button aria-label="评论排序">最热</button></div>
    <div class="mt-4 min-w-0">
      <article aria-label="楼主 的评论" class="min-w-0 py-4">
        <div data-post-id="p1" id="post-2" class="grid grid-cols-[34px_minmax(0,1fr)] gap-3">
          <div class="min-w-0"><p>首楼正文</p>${extraFloorP}</div>
        </div>
        <div class="post-comment-replies mt-2 ml-[46px]"><div class="space-y-0">${replies}</div></div>
      </article>
    </div>
  </section>
</main></div></body></html>`;
}

const PROFILECOLL_HTML = `<!doctype html><html><head></head><body>
<div id="__nuxt"><main>
  <section class="min-w-0">
    <div aria-label="合集列表" data-profile-collection-list class="grid min-w-0 grid-cols-1 gap-2">
      <button data-collection-id="col-1" aria-label="旧合集">旧合集</button>
      <button data-collection-id="col-3" aria-label="热合集">热合集</button>
      <button data-collection-id="col-2" aria-label="中合集">中合集</button>
    </div>
  </section>
</main></div></body></html>`;

const SETTINGS_HTML = `<!doctype html><html><head></head><body>
<div id="__nuxt"><main>
  <div class="grid min-h-[calc(100vh-132px)] grid-cols-[minmax(0,1fr)] content-start items-start gap-3">
    <aside aria-label="设置" class="hidden min-w-0 desktop:block">
      <nav aria-label="设置分类" class="flex flex-col gap-1"><button type="button">个人资料</button></nav>
    </aside>
    <div id="settings-profile" class="grid min-w-0 gap-4">
      <section class="rounded-lg overflow-hidden bg-default"><div class="p-4 desktop:p-6">原生设置卡片</div></section>
    </div>
  </div>
</main></div></body></html>`;

function boot(html, url, { settings, detail, loggedIn, cookie, poolPages, timePool, superGone, superPool } = {}) {
  const calls = [];
  const dom = new JSDOM(html, {
    url,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    beforeParse(window) {
      installFetch(window, calls, detail, { loggedIn, poolPages, timePool, superGone });
      if (settings) window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      if (superPool) window.localStorage.setItem('pictExt:superpool:v1', JSON.stringify(superPool));
      if (cookie) {
        try {
          Object.defineProperty(window.document, 'cookie', { get: () => cookie, configurable: true });
        } catch {
          /* jsdom 老版本可能不让改，忽略 */
        }
      }
    },
  });
  dom.window.eval(SCRIPT);
  return { dom, window: dom.window, doc: dom.window.document, calls };
}

/* ---------------------------------------------------------------- */
async function runNative() {
  console.log('\n[A. 原版模式（默认）]');
  const home = boot(HOME_HTML, 'http://localhost/');
  await sleep(500);
  ok(!home.doc.getElementById('pictExt-panel'), '首页不注入任何排序栏');
  ok(home.calls.length === 0, '原版模式不发任何接口请求');
  ok(
    home.doc.querySelector('section[aria-label="推荐帖子"]').style.display !== 'none',
    '原生列表原样可见'
  );

  const det = boot(DETAIL_HTML, 'http://localhost/forum/post/topic-1', {
    detail: { id: 'topic-1', viewCount: 417, replyCount: 112, createdAt: '2026-09-29T06:32:39.098Z', tags: [], firstPost: { likeCount: 36 } },
  });
  await sleep(500);
  ok(!det.doc.getElementById('pictExt-comment-sort'), '详情页没有 6 项排序栏');
  ok(!!det.doc.querySelector('[data-px-global-toggle]'), '详情页仍有「折叠全部回复」');
  ok(
    det.doc.querySelector('[aria-label="评论排序"]').style.display !== 'none',
    '站内评论排序保持原样'
  );
}

async function runReplaceHome() {
  console.log('\n[B1. 全部替换 · 首页]');
  const { doc, calls, window } = boot(HOME_HTML, 'http://localhost/', { settings: { sortMode: 'replace' } });
  await sleep(700);
  const panel = doc.getElementById('pictExt-panel');
  ok(!!panel, '注入了替换排序栏');
  const tabs = [...doc.querySelectorAll('#pictExt-panel .px-tab')].map((b) => b.textContent.trim());
  ok(
    tabs.join(',') === '关注,站内推荐,最新,最早,最多浏览,最多点赞,最多回复,最多收藏,最热',
    '9 项且顺序正确（新增「最早」）',
    tabs.join(',')
  );

  const feed = doc.querySelector('section[aria-label="推荐帖子"]');
  ok(feed.style.display === 'none', '原生列表已隐藏');
  ok(doc.querySelector('[aria-label="首页排序"]').style.display === 'none', '站内「关注/推荐/最新」也一起替换掉');
  ok(doc.querySelector('[aria-label="首页列表控制"]').style.display !== 'none', '同一行里的「板块」入口保留');
  ok(doc.querySelector('[data-sort="latest"]').dataset.active === 'true', '默认停在「最新」');

  for (const [key, metric, label] of [
    ['views', 'viewCount', '浏览'],
    ['likes', 'likeCount', '赞'],
    ['replies', 'replyCount', '回复'],
    ['bookmarks', 'bookmarkCount', '收藏'],
  ]) {
    doc.querySelector(`[data-sort="${key}"]`).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await sleep(600);
    const cards = [...doc.querySelectorAll('#pictExt-panel .px-list article')];
    const vals = cards.map((c) => statOf(c, label));
    ok(cards.length > 0 && vals.every((v, i) => i === 0 || vals[i - 1] >= v), `${key} 按${label}降序`, vals.slice(0, 5).join(','));
  }

  const before = calls.length;
  doc.querySelector('[data-sort="following"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(600);
  ok(/登录/.test(doc.querySelector('#pictExt-panel .px-state')?.textContent || ''), '未登录时关注流给出登录提示');
  const followCall = calls.slice(before).find((c) => c.url.includes('scope=following'));
  ok(!!followCall && followCall.init.credentials === 'include', '关注流请求带登录态（credentials:include）');

  doc.querySelector('[data-sort="recommended"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(700);
  ok(calls.some((c) => c.url.includes('/topic-recommendations')), '推荐流走 /topic-recommendations');
  const recCards1 = doc.querySelectorAll('#pictExt-panel .px-list article').length;
  ok(recCards1 === 4, '推荐流第一页渲染出卡片', String(recCards1));
  const moreBtn = doc.querySelector('#pictExt-panel .px-more');
  ok(!!moreBtn && /继续加载/.test(moreBtn.textContent), '推荐流底部有「继续加载」');
  moreBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(700);
  const recCards2 = doc.querySelectorAll('#pictExt-panel .px-list article').length;
  ok(recCards2 === 7, '点「继续加载」追加了下一页', String(recCards2));
  ok(calls.some((c) => c.url.includes('cursor=r2')), '继续加载带上了游标');
  ok(!doc.querySelector('#pictExt-panel .px-more'), '没有下一页后按钮消失');

  doc.querySelector('[data-sort="hot"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(600);
  ok(/热度/.test(doc.querySelector('#pictExt-panel .px-note').textContent), '最热标注服务端热度排名');
  ok(
    calls.filter((c) => c.url.includes('sort=latest') || c.url.includes('sort=hot')).every((c) => c.init.credentials === 'omit'),
    '普通排序请求都是 credentials:omit'
  );

  const stored = JSON.parse(doc.defaultView.localStorage.getItem(SETTINGS_KEY) || '{}');
  ok(!/cookie/i.test(JSON.stringify(stored)), 'localStorage 里没有任何 cookie 字段');
}

async function runReplaceCategory() {
  console.log('\n[B2. 全部替换 · 板块页]');
  const { doc, calls } = boot(CATEGORY_HTML, 'http://localhost/forum/category/creative-works', {
    settings: { sortMode: 'replace' },
  });
  await sleep(700);
  ok(!!doc.getElementById('pictExt-panel'), '板块页注入了排序栏');
  const tabs = [...doc.querySelectorAll('#pictExt-panel .px-tab')].map((b) => b.textContent.trim());
  ok(tabs.length === 10, '板块页 10 项（多了「默认排序」）', tabs.join(','));
  ok(
    tabs.join(',') === '关注,站内推荐,默认排序,最新,最早,最多浏览,最多点赞,最多回复,最多收藏,最热',
    '板块页 10 项名称正确',
    tabs.join(',')
  );
  ok(doc.querySelector('section[aria-label="板块帖子"]').style.display === 'none', '原生板块列表已隐藏');
  ok(doc.querySelector('section[aria-label="板块帖子"]').parentElement.contains(doc.getElementById('pictExt-panel')), '排序栏在帖子列表之前');
  ok(calls.some((c) => c.url.includes('tag=creative-works')), '请求带上了板块标签');

  // 回归：旧结构（div 包着列表）也要能注入，避免以后结构微调就整页失效
  const legacy = boot(CATEGORY_HTML_LEGACY, 'http://localhost/forum/category/creative-works', {
    settings: { sortMode: 'replace' },
  });
  await sleep(500);
  ok(!!legacy.doc.getElementById('pictExt-panel'), 'div 结构（兼容兜底）同样注入排序栏');
}

async function runPoolPaging() {
  console.log('\n[B4. 候选池：默认 9 页，还能继续往后翻]');
  const { doc, calls, window } = boot(HOME_HTML, 'http://localhost/', {
    settings: { sortMode: 'replace', defaultSort: 'views' },
    poolPages: { latest: 12, hot: 5 },
  });
  const topicCalls = () => calls.filter((c) => c.url.includes('/api/v1/topics?'));
  const note = () => doc.querySelector('#pictExt-panel .px-note').textContent;
  const cards = () => doc.querySelectorAll('#pictExt-panel .px-list article').length;
  const btn = () => doc.querySelector('#pictExt-panel .px-foot .px-more');
  const click = async () => {
    btn().dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await sleep(120);
  };

  await sleep(900);
  ok(topicCalls().length === 9, '首屏只翻 9 页（最新 6 + 热帖 3）', String(topicCalls().length));
  ok(/候选池 180 条/.test(note()), '初始池 9×20=180 条', note());
  ok(cards() === 20, '先显示 20 条', String(cards()));

  for (let i = 0; i < 8; i++) await click();
  ok(cards() === 180, '池子里的 180 条都能看到', String(cards()));
  ok(/继续往后翻/.test(btn().textContent), '池子见底后给「继续往后翻」', btn().textContent);
  ok(topicCalls().length === 9, '只是显示更多时不重复请求服务端', String(topicCalls().length));

  await click();
  ok(calls.some((c) => c.url.includes('cursor=latest-7')), '继续翻最新第 7 页');
  ok(calls.some((c) => c.url.includes('cursor=hot-4')), '继续翻热帖第 4 页');
  ok(/已翻 11 页/.test(note()), '页数累计到 11', note());
  ok(cards() === 200, '新翻到的条目接在后面显示', String(cards()));

  // 热帖链总共只有 5 页：翻到底之后不该再请求它
  const hotCount = () => calls.filter((c) => c.url.includes('sort=hot')).length;
  for (let i = 0; i < 6; i++) await click();
  ok(hotCount() === 5, '热帖链翻到第 5 页就停（不空翻）', String(hotCount()));
  ok(/全部替换|按浏览量排序/.test(note()), '状态行照常显示', note());
}

async function runNewSorts() {
  console.log('\n[B5. 默认排序 / 最早 / 候选池页数设置]');

  // 默认排序（板块页）：请求不带 sort 参数 = 站点原始顺序
  const cat = boot(CATEGORY_HTML, 'http://localhost/forum/category/creative-works', {
    settings: { sortMode: 'replace' },
  });
  await sleep(700);
  const defBtn = cat.doc.querySelector('[data-sort="default"]');
  ok(!!defBtn, '板块页有「默认排序」按钮');
  defBtn.dispatchEvent(new cat.window.MouseEvent('click', { bubbles: true }));
  await sleep(700);
  const topicCalls = cat.calls.filter((c) => c.url.includes('/api/v1/topics?'));
  const last = topicCalls[topicCalls.length - 1];
  ok(last && !/[?&]sort=/.test(last.url), '默认排序不带 sort（走站点原始顺序）', last && last.url);
  ok(last && last.url.includes('tag=creative-works'), '默认排序仍带板块标签');

  // 最早：候选池按发布时间正序
  const home = boot(HOME_HTML, 'http://localhost/', { settings: { sortMode: 'replace', defaultSort: 'earliest' } });
  await sleep(1000);
  const cards = [...home.doc.querySelectorAll('#pictExt-panel .px-list article')];
  ok(cards.length === 20, '最早也走候选池（先给 20 条）', String(cards.length));
  const dayOf = (n) => new Date(`2026-11-${String((n % 28) + 1).padStart(2, '0')}T10:00:00.000Z`).getTime();
  const seq = cards.map((c) => dayOf(Number(c.querySelector('h2').textContent.replace('帖子标题 ', '').trim())));
  ok(
    seq.every((v, i) => i === 0 || seq[i - 1] <= v),
    '「最早」按发布时间正序',
    seq.slice(0, 4).join(',')
  );
  ok(/最早/.test(home.doc.querySelector('#pictExt-panel .px-note').textContent), '状态行标明「最早」');

  // 候选池页数可设置
  const small = boot(HOME_HTML, 'http://localhost/', {
    settings: { sortMode: 'replace', defaultSort: 'views', poolLatestPages: 2, poolHotPages: 1 },
    poolPages: { latest: 6, hot: 3 },
  });
  await sleep(900);
  const pages = small.calls.filter((c) => c.url.includes('/api/v1/topics?')).length;
  ok(pages === 3, '按设置只翻 2+1 页', String(pages));
  ok(/候选池 60 条/.test(small.doc.querySelector('#pictExt-panel .px-note').textContent), '池子 = 3 页 × 20 条');
}

async function runCommentPaging() {
  console.log('\n[D2. 评论区按页显示]');
  const { doc, window } = boot(DETAIL_MANY_HTML, 'http://localhost/forum/post/topic-1');
  await sleep(700);
  const arts = () => [...doc.querySelectorAll('article[aria-label$="的评论"]')];
  const shown = () => arts().filter((a) => a.style.display !== 'none').length;
  const pager = () => doc.getElementById('pictExt-comment-pager');

  ok(!!pager(), '出现翻页器');
  ok(shown() === 10, '默认一页 10 楼', String(shown()));
  ok(/共 2 页/.test(pager().textContent), '总页数 2', pager().textContent.trim());

  pager().querySelector('[data-px-page="2"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(200);
  ok(shown() === 2, '第 2 页显示剩下 2 楼', String(shown()));

  pager().querySelector('[data-px-page="prev"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(200);
  ok(shown() === 10, '「上一页」回到 10 楼', String(shown()));
}

async function runThreadPagingAndTruncate() {
  console.log('\n[D4. 楼中楼分页 + 长评论折叠 + 委托点击]');

  // 12 条楼中楼 → 有页码
  const many = boot(threadHTML(12), 'http://localhost/forum/post/topic-1', { settings: { collapse: false } });
  await sleep(700);
  const art = () => many.doc.querySelector('article[aria-label$="的评论"]');
  const replies = () => [...art().querySelectorAll('[data-post-id^="r"]')];
  const shown = () => replies().filter((el) => el.style.display !== 'none').length;
  const tpager = () => art().querySelector('[data-px-thread-pager]');

  ok(!!tpager(), '楼中楼 ≥10 条出现页码');
  ok(shown() === 10, '楼中楼一页 10 条', String(shown()));
  ok(/1\/2 页/.test(tpager().textContent), '楼中楼显示 1/2 页', tpager().textContent.trim());

  // 模拟 Vue 把按钮整个重建：先删掉再塞一个同 data 的新按钮，点一次就该生效
  const oldBtn = tpager().querySelector('[data-px-tpage="next"]');
  const fresh = many.doc.createElement('button');
  fresh.type = 'button';
  fresh.dataset.pxTpage = 'next';
  oldBtn.replaceWith(fresh);
  fresh.dispatchEvent(new many.window.MouseEvent('pointerdown', { bubbles: true, button: 0 }));
  await sleep(150);
  ok(shown() === 2, '重建后的按钮按一下就生效（pointerdown 委托）', String(shown()));
  // 同一次点击后续的 click 不能再翻一页（防重复执行）
  fresh.dispatchEvent(new many.window.MouseEvent('click', { bubbles: true }));
  await sleep(150);
  ok(shown() === 2, '同一次点击不会重复执行', String(shown()));

  // 9 条 → 没有页码
  const few = boot(threadHTML(9), 'http://localhost/forum/post/topic-1', { settings: { collapse: false } });
  await sleep(700);
  ok(!few.doc.querySelector('[data-px-thread-pager]'), '不足 10 条不显示页码');

  // 长评论 400 字 → 前 200 字 + 展开
  const long = '这是一段很长的评论。'.repeat(50); // 500 字
  const big = boot(
    threadHTML(0, `<p>${long}</p><ul><li>空项目一</li><li>空项目二</li></ul>`),
    'http://localhost/forum/post/topic-1',
    { settings: { collapse: false } }
  );
  await sleep(700);
  const floor = big.doc.querySelector('[data-post-id="p1"]');
  const btn = floor.querySelector('[data-px-expand]');
  ok(!!btn, '超 300 字的评论出现「展开全文」');
  const bodyText = () => floor.textContent.replace(/展开全文/g, '').trim();
  ok(bodyText().length <= 260 && bodyText().length >= 200, '折叠后只留前 200 字左右', String(bodyText().length));
  ok(/^首楼正文/.test(bodyText()), '折叠后仍从正文开头开始');
  const tailList = floor.querySelector('ul');
  ok(tailList && tailList.style.display === 'none', '截断点后面的整块内容被隐藏（不留空项目符）');

  btn.dispatchEvent(new big.window.MouseEvent('click', { bubbles: true }));
  await sleep(150);
  ok(!floor.querySelector('[data-px-expand]'), '展开后按钮消失');
  ok(bodyText().length > 480, '展开后恢复全文', String(bodyText().length));
  ok(tailList.style.display !== 'none', '展开后列表也回来了');

  // 短评论不折
  const short = boot(threadHTML(0, '<p>短评论一句</p>'), 'http://localhost/forum/post/topic-1', { settings: { collapse: false } });
  await sleep(600);
  ok(!short.doc.querySelector('[data-px-expand]'), '300 字以内不折');
}

async function runCollectionBox() {
  console.log('\n[D3. 右侧栏合集]');
  const detail = {
    id: 'topic-1',
    viewCount: 417,
    replyCount: 112,
    createdAt: '2026-09-29T06:32:39.098Z',
    tags: [],
    collection: { id: 'dig-1', name: 'pickcat挖掘' },
    firstPost: { likeCount: 36 },
  };
  const { doc, window } = boot(DETAIL_HTML, 'http://localhost/forum/post/topic-1', { detail });
  await sleep(800);
  const box = doc.getElementById('pictExt-collection');
  ok(!!box, '侧栏出现合集区块');
  ok(box && box.parentElement.getAttribute('aria-label') === '帖子信息', '挂在站点右侧栏里');
  ok(/pickcat挖掘/.test(box.textContent), '显示合集名');
  ok(/1\/3/.test(box.textContent), '显示当前位置 x/y', box.querySelector('.pxcol-idx').textContent);

  const sortBtns = [...box.querySelectorAll('[data-px-colsort]')].map((b) => b.textContent.trim());
  ok(sortBtns.join(',') === '最早,最多浏览,最多点赞,最多回复,最多收藏,最热', '6 项合集排序', sortBtns.join(','));
  ok(box.querySelectorAll('.pxcol-meta').length === 0, '默认只显示标题（不带统计/简介）');

  box.querySelector('[data-px-colsort="views"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(150);
  const first = box.querySelector('.pxcol-item');
  ok(/合集帖 2/.test(first.textContent), '「最多浏览」把 30 浏览的排前', first.textContent.trim());

  box.querySelector('[data-px-coltoggle]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(150);
  ok(doc.getElementById('pictExt-collection').querySelectorAll('.pxcol-meta').length === 3, '展开后补出统计与简介');

  const css = doc.getElementById('pictExt-style').textContent;
  ok(/aside\[aria-label="帖子信息"\]\{[^}]*overflow-y:auto/.test(css), '侧栏改为整体滚动（目录与合集不再叠）');
  ok(/#pictExt-collection\{[^}]*max-height:45vh/.test(css), '合集区自己限高 + 内滚');
}

async function runProfileCollections() {
  console.log('\n[G. 个人资料合集页：搜索 + 排序]');
  const { doc, window } = boot(PROFILECOLL_HTML, 'http://localhost/profile/u-1?tab=collections');
  await sleep(600);
  const list = doc.querySelector('[data-profile-collection-list]');
  const bar = doc.getElementById('pictExt-profcol');
  ok(!!bar, '合集列表上方出现工具栏');
  ok(bar && bar.nextElementSibling === list, '工具栏紧贴列表上沿');
  const sorts = [...bar.querySelectorAll('[data-px-profsort]')].map((b) => b.textContent.trim());
  ok(sorts.join(',') === '最新,最多浏览,最多点赞,最多回复', '4 项合集排序', sorts.join(','));
  ok(!!bar.querySelector('[data-px-colq]'), '有搜索框');

  bar.querySelector('[data-px-profsort="views"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(400);
  const ids = () => [...list.children].map((el) => el.dataset.collectionId);
  const visual = () =>
    [...list.children]
      .sort((a, b) => Number(a.style.order || 0) - Number(b.style.order || 0))
      .map((el) => el.dataset.collectionId);
  ok(visual()[0] === 'col-3', '「最多浏览」把浏览合计最高的排前', visual().join(','));
  ok(list.style.display === 'flex', '列表改成纵向 flex（用 order 排序）');

  const inp = bar.querySelector('[data-px-colq]');
  inp.value = '热';
  inp.dispatchEvent(new window.Event('input', { bubbles: true }));
  await sleep(400);
  const shown = [...list.children].filter((el) => el.style.display !== 'none').map((el) => el.dataset.collectionId);
  ok(shown.length === 1 && shown[0] === 'col-3', '搜索只留下名字命中的合集', shown.join(','));

  bar.querySelector('[data-px-profsort="latest"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(200);
  ok(ids().join(',') === 'col-1,col-3,col-2', '切回「最新」恢复站点原始顺序', ids().join(','));
}

async function runReplaceSearch() {
  console.log('\n[B3. 全部替换 · 搜索页]');
  const { doc, calls, window } = boot(SEARCH_HTML, 'http://localhost/search?q=Box&tag=box', {
    settings: { sortMode: 'replace', superSearch: false },
  });
  await sleep(700);
  ok(!!doc.getElementById('pictExt-panel'), '搜索页注入了排序栏');
  const tabs = [...doc.querySelectorAll('#pictExt-panel .px-tab')].map((b) => b.textContent.trim());
  ok(tabs.length === 9, '搜索页也是 9 项', tabs.join(','));
  ok(tabs.join(',') === '关注,站内搜索,最新,最早,最多浏览,最多点赞,最多回复,最多收藏,最热', '搜索页用「站内搜索」替掉「站内推荐」', tabs.join(','));
  await sleep(300);
  ok(calls.some((c) => c.url.includes('q=Box') && c.url.includes('sort=latest')), '关键词与默认排序一起带过去');

  doc.querySelector('[data-sort="search"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(700);
  ok(calls.some((c) => c.url.includes('sort=relevance') && c.url.includes('q=Box')), '「站内搜索」走服务端 sort=relevance 且带关键词');
  ok(doc.querySelector('[data-sort="search"]').dataset.active === 'true', '站内搜索状态同步');
}

async function runSearchKindAndFocus() {
  console.log('\n[H. 搜索命中类型 + 跳转定位高亮]');

  // 1) 结果卡标出「帖子 / 评论 · 第 N 楼」
  const { doc } = boot(SEARCH_HTML, 'http://localhost/search?q=Box', { settings: { sortMode: 'replace', superSearch: false } });
  await sleep(800);
  const kinds = [...doc.querySelectorAll('#pictExt-panel .px-kind')].map((b) => b.textContent.trim());
  ok(kinds.length > 0, '搜索结果上出现类型标记', String(kinds.length));
  // 1.7.5 起「最新」按发布时间重排，顺序不再等于接口顺序 → 按标题找卡，别按下标
  const cardOf = (n) =>
    [...doc.querySelectorAll('#pictExt-panel .px-list article')].find(
      (a) => (a.querySelector('h2')?.textContent || '').trim() === '帖子标题 ' + n
    );
  const kindOf = (n) => (cardOf(n)?.querySelector('.px-kind')?.textContent || '').trim();
  ok(kindOf(1) === '帖子', '标题命中标「帖子」', kindOf(1));
  ok(kindOf(2) === '帖子', '命中第 1 楼（就是帖子本身）也标「帖子」', kindOf(2));
  ok(/^评论 · 第 4 楼$/.test(kindOf(3)), '评论命中标「评论 · 第 N 楼」', kindOf(3));
  const href = cardOf(3)?.querySelector('h2 a')?.getAttribute('href');
  ok(/#post-4$/.test(href || ''), '评论结果的链接带楼层锚点', href);

  // 2) 顶层楼层：跳到 #post-13 应该翻到第 2 页并高亮
  const many = boot(DETAIL_MANY_HTML, 'http://localhost/forum/post/topic-1#post-13', {});
  await sleep(900);
  const target = many.doc.getElementById('post-13');
  ok(target && target.style.display !== 'none', '目标楼层不在第 1 页也能翻过去');
  ok(target && target.getAttribute('data-px-focus') === '1', '目标楼层高亮');
  ok(
    [...many.doc.querySelectorAll('article[aria-label$="的评论"]')].filter((a) => a.style.display !== 'none').length === 2,
    '翻到第 2 页（12 条 → 第 1 页 10 条，第 2 页 2 条）',
    'n/a'
  );

  // 3) 楼中楼：#post-110 在第 11 条回复里 → 展开楼层 + 翻到第 2 页 + 高亮
  const deep = boot(threadHTML(12), 'http://localhost/forum/post/topic-1#post-110', {});
  await sleep(900);
  const art = deep.doc.querySelector('article[aria-label$="的评论"]');
  ok(art.querySelector('.post-comment-replies').style.display !== 'none', '目标在楼中楼里 → 楼层自动展开');
  const r11 = deep.doc.getElementById('post-110');
  ok(r11 && r11.style.display !== 'none', '楼中楼翻到目标所在页');
  ok(r11 && r11.getAttribute('data-px-focus') === '1', '命中的楼中楼高亮');
}

async function runPerf() {
  console.log('\n[I. 1.7.5 性能：深翻并发 / 最新按发布时间 / 增量渲染]');

  const topicCalls = (calls) => calls.filter((c) => c.url.includes('/api/v1/topics?'));

  // I1. 20 页的可解码游标池子：应该切段并发，且「最新」按发布时间倒序
  const big = boot(HOME_HTML, 'http://localhost/', {
    settings: { sortMode: 'replace', defaultSort: 'latest', poolLatestPages: 20, showTimes: true },
    timePool: { pages: 20 },
  });
  await sleep(2500);
  const bigCalls = topicCalls(big.calls);
  ok(bigCalls.length <= 26, '20 页 + 少量探测就够（不是 20 次串行拉满）', String(bigCalls.length));
  ok(/候选池 1000 条/.test(big.doc.querySelector('#pictExt-panel .px-note').textContent), '池子拿到全部 1000 条', big.doc.querySelector('#pictExt-panel .px-note').textContent);
  const pubTimes = [...big.doc.querySelectorAll('#pictExt-panel .px-list article')].map((a) =>
    Date.parse(a.querySelector('time[title^="发布"]')?.getAttribute('datetime') || 0)
  );
  ok(pubTimes.length === 20, '先显示一屏 20 条', String(pubTimes.length));
  ok(pubTimes.every((v, i) => i === 0 || pubTimes[i - 1] >= v), '「最新」按发布时间倒序（不是活跃时间）', pubTimes.slice(0, 3).join(','));
  const bigIds = [...big.doc.querySelectorAll('#pictExt-panel .px-list article h2 a')].map((a) => a.getAttribute('href'));
  ok(new Set(bigIds).size === bigIds.length, '并发拉回来的条目没有重复');
  ok(!big.doc.querySelector('#pictExt-panel .px-state'), '全程没出现报错占位');

  // I2. 关掉并发加速 → 老老实实串行 20 次
  const serial = boot(HOME_HTML, 'http://localhost/', {
    settings: { sortMode: 'replace', defaultSort: 'views', poolLatestPages: 20, poolHotPages: 1, poolParallel: false },
    timePool: { pages: 20 },
  });
  await sleep(2500);
  ok(topicCalls(serial.calls).length === 21, '关掉并发后就是 20+1 次串行请求', String(topicCalls(serial.calls).length));

  // I3. 关掉「最新按发布时间」→ 回到服务端 sort=latest 单页
  const srv = boot(HOME_HTML, 'http://localhost/', {
    settings: { sortMode: 'replace', defaultSort: 'latest', latestByCreated: false },
    timePool: { pages: 20 },
  });
  await sleep(700);
  ok(topicCalls(srv.calls).length === 1, '关掉后只拉一页（服务端排序）', String(topicCalls(srv.calls).length));
  ok(topicCalls(srv.calls)[0].url.includes('sort=latest'), '走的是站点 sort=latest');

  // I4. 「再多看几条」只追加、不重建：第一张卡还是原来那个 DOM 节点
  const inc = boot(HOME_HTML, 'http://localhost/', {
    settings: { sortMode: 'replace', defaultSort: 'views', poolLatestPages: 2, poolHotPages: 1 },
    poolPages: { latest: 6, hot: 3 },
  });
  await sleep(900);
  const firstCard = inc.doc.querySelector('#pictExt-panel .px-list article');
  const before = inc.calls.length;
  inc.doc.querySelector('#pictExt-panel .px-foot .px-more').dispatchEvent(new inc.window.MouseEvent('click', { bubbles: true }));
  await sleep(300);
  ok(inc.doc.querySelector('#pictExt-panel .px-list article') === firstCard, '追加时没有把已画的卡片重画一遍');
  ok(inc.doc.querySelectorAll('#pictExt-panel .px-list article').length === 40, '一次多显示一屏（20 → 40）', String(inc.doc.querySelectorAll('#pictExt-panel .px-list article').length));
  ok(inc.calls.length === before, '「再多看几条」不重复请求服务端');

  // I5. 停止按钮：深翻途中能刹车，已拉到的条目留着
  const stop = boot(HOME_HTML, 'http://localhost/', {
    settings: { sortMode: 'replace', defaultSort: 'views', poolLatestPages: 24 },
    timePool: { pages: 24, slowMs: 300 },
  });
  await sleep(900);
  const stopBtn = stop.doc.querySelector('#pictExt-panel [data-px-stop]');
  ok(!!stopBtn, '慢加载时底部出现「停止加载」', stop.doc.querySelector('#pictExt-panel .px-foot')?.textContent);
  if (stopBtn) {
    stopBtn.dispatchEvent(new stop.window.MouseEvent('click', { bubbles: true }));
    await sleep(1500);
    const shown = stop.doc.querySelectorAll('#pictExt-panel .px-list article').length;
    ok(shown > 0, '停下之后已经拉到的条目还在', String(shown));
    ok(!stop.doc.querySelector('#pictExt-panel .px-state'), '停下不是报错状态');
  }
}

async function runTimes() {
  console.log('\n[C. 显示改良（三种时间）]');
  const { doc } = boot(HOME_HTML, 'http://localhost/', { settings: { sortMode: 'replace', showTimes: true } });
  await sleep(700);
  const card = doc.querySelector('#pictExt-panel .px-list article');
  ok(!!card, '渲染出卡片');
  const times = [...doc.querySelectorAll('#pictExt-panel .px-list time')].map((t) => t.textContent.trim());
  ok(times.some((x) => x.startsWith('发布')), '有「发布 x 时间前」', times.join(' | '));
  ok(times.some((x) => x.startsWith('更新')), '帖子改过时有「更新 x 时间前」');
  ok(times.some((x) => x.startsWith('回复')), '有「回复 x 时间前」');
  ok(!card.querySelector('.mt-auto time'), '原来的单个相对时间已被替换掉');
}

async function runDetailReplace() {
  console.log('\n[D. 详情页 · 评论改版]');
  const detail = {
    id: 'topic-1',
    viewCount: 417,
    replyCount: 112,
    createdAt: '2026-09-29T06:32:39.098Z',
    tags: [],
    firstPost: { likeCount: 36 },
  };
  const { doc, calls, window } = boot(DETAIL_HTML, 'http://localhost/forum/post/topic-1', {
    settings: { commentSortMode: 'replace' },
    detail,
  });
  await sleep(900);
  const bar = doc.getElementById('pictExt-comment-sort');
  ok(!!bar, '评论区出现 6 项排序栏');
  const labels = [...bar.querySelectorAll('[data-csort]')].map((b) => b.textContent.trim());
  ok(labels.join(',') === '最热,关注,最早,最新,最多点赞', '5 项顺序正确（「最多楼高」已删）', labels.join(','));
  ok(doc.querySelector('[aria-label="评论排序"]').style.display === 'none', '站内那个下拉排序已隐藏');
  ok(!!doc.querySelector('[data-px-global-toggle]'), '「折叠全部回复」仍在');

  const container = doc.querySelector('[aria-label="板块帖子"]') || doc.querySelector('.mt-4.min-w-0');
  ok(container.style.display === 'flex', '楼层容器已设为纵向 flex（用 order 排序，不搬节点）');

  const orderOf = (id) =>
    Number(doc.querySelector(`[data-post-id="${id}"]`).closest('article').style.order);
  const art = (id) => doc.querySelector(`[data-post-id="${id}"]`).closest('article');

  // 空壳站内顺序是 p1,p2；「最热」的接口顺序是 p2,p1
  ok(orderOf('p2') === 0 && orderOf('p1') === 1, '「最热」按接口返回顺序排', `${orderOf('p1')}/${orderOf('p2')}`);
  ok(calls.some((c) => /\/posts/.test(c.url) && c.url.includes('sort=hot')), '最热走服务端 sort=hot');

  bar.querySelector('[data-csort="earliest"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(600);
  ok(orderOf('p1') === 0 && orderOf('p2') === 1, '「最早」换了顺序', `${orderOf('p1')}/${orderOf('p2')}`);
  ok(calls.some((c) => /\/posts/.test(c.url) && c.url.includes('sort=earliest')), '最早走服务端 sort=earliest');

  bar.querySelector('[data-csort="likes"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(700);
  ok(orderOf('p2') === 0, '「最多点赞」把 9 赞的楼排前', `${orderOf('p1')}/${orderOf('p2')}`);

  ok(!bar.querySelector('[data-csort="depth"]'), '「最多楼高」已删除');

  const tail = doc.querySelector('.flex.justify-center.py-4');
  ok(tail && tail.style.order === '9000', '「加载更多回复」永远排在最后');

  bar.querySelector('[data-csort="following"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(700);
  ok(/关注/.test(bar.querySelector('.pxc-note').textContent || ''), '未登录时关注筛选给出说明');
  ok(art('p1').style.display !== 'none', '关注筛选失败时不误伤楼层');

  bar.querySelector('[data-csort="latest"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(600);
  ok(bar.querySelector('[data-csort="latest"]').dataset.active === 'true', '切到「最新」状态同步');
}

async function runWorkComments() {
  console.log('\n[D2. 作品详情页 · 评论区排序]');
  const { doc, calls, window } = boot(WORK_DETAIL_HTML, 'http://localhost/works/work-1', {
    settings: { commentSortMode: 'replace' },
  });
  await sleep(900);
  const bar = doc.getElementById('pictExt-comment-sort');
  ok(!!bar, '作品评论区也出现排序栏');
  const labels = [...(bar ? bar.querySelectorAll('[data-csort]') : [])].map((b) => b.textContent.trim());
  ok(labels.join(',') === '最热,关注,最早,最新,最多点赞', '作品页排序项与帖子页一致', labels.join(','));
  ok(doc.querySelector('[aria-label="评论排序"]').style.display === 'none', '站内作品评论下拉已隐藏');

  const workCalls = calls.filter((c) => /\/api\/v1\/works\/work-1\/comments/.test(c.url));
  ok(workCalls.length > 0, '走 /works/{id}/comments 拉评论索引');
  ok(workCalls.every((c) => Number(new URL(c.url).searchParams.get('limit')) <= 30), '作品评论 limit 不超过 30');
  ok(workCalls.some((c) => new URL(c.url).searchParams.get('sort') === 'hot'), '最热走服务端 sort=hot');
  ok(!calls.some((c) => /\/api\/v1\/topics\/work-1/.test(c.url)), '作品页不去拉 /topics/{id}');
  ok(!doc.querySelector('[data-px-topic-info]'), '作品页不插帖子信息条');

  const orderOf = (id) => Number(doc.querySelector(`[data-post-id="${id}"]`).closest('article').style.order);
  const container = doc.querySelector('.mt-4.min-w-0');
  ok(container.style.display === 'flex', '作品楼层容器同样用纵向 flex + order 排序');
  // 接口「最热」顺序是 w2,w1a,w1 → 顶层 w2 在前
  ok(orderOf('w2') < orderOf('w1'), '「最热」按作品评论接口顺序排', `${orderOf('w1')}/${orderOf('w2')}`);

  bar.querySelector('[data-csort="earliest"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(700);
  ok(orderOf('w1') < orderOf('w2'), '「最早」按 commentNumber 正序', `${orderOf('w1')}/${orderOf('w2')}`);

  bar.querySelector('[data-csort="likes"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(700);
  ok(orderOf('w2') < orderOf('w1'), '「最多点赞」把 8 赞的作品评论排前', `${orderOf('w1')}/${orderOf('w2')}`);

  bar.querySelector('[data-csort="following"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(700);
  ok(/关注/.test(bar.querySelector('.pxc-note').textContent || ''), '作品页关注筛选也给出登录说明');

  // 登录后：只留关注的人（u2 的 w2）
  const on = boot(WORK_DETAIL_HTML, 'http://localhost/works/work-1', {
    settings: { commentSortMode: 'replace' },
    loggedIn: true,
  });
  await sleep(900);
  const onBar = on.doc.getElementById('pictExt-comment-sort');
  onBar.querySelector('[data-csort="following"]').dispatchEvent(new on.window.MouseEvent('click', { bubbles: true }));
  await sleep(900);
  const note = onBar.querySelector('.pxc-note').textContent || '';
  ok(/只显示你关注的 1 条评论/.test(note), '作品页关注筛选按作者过滤并说明条数', note);
  ok(
    on.doc.querySelector('[data-post-id="w1"]').closest('article').style.display === 'none',
    '关注筛选把未关注作者的评论藏起来'
  );
}

async function runSettings() {
  console.log('\n[E. 设置页]');
  const { window, doc } = boot(SETTINGS_HTML, 'http://localhost/settings');
  await sleep(500);
  const navBtn = doc.querySelector('[data-px-settings-nav]');
  ok(!!navBtn && /PICTEXT/.test(navBtn.textContent), '左侧导航出现 PICTEXT 入口');
  navBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(300);
  const sec = doc.getElementById('pictExt-settings');
  ok(!!sec, 'PICTEXT 设置面板出现');
  const switches = sec.querySelectorAll('[data-px-set][role="switch"]');
  const selects = sec.querySelectorAll('select[data-px-set]');
  ok(switches.length === 18, '18 个开关（含首页数据统计、Super 搜索）', String(switches.length));
  ok(selects.length === 4, '4 个下拉（排序模式 / 默认排序 / 评论排序模式 / 折叠阈值）', String(selects.length));

  const modeSel = sec.querySelector('select[data-px-set="sortMode"]');
  ok(modeSel.value === 'native', '排序模式默认原版');
  const cModeSel = sec.querySelector('select[data-px-set="commentSortMode"]');
  ok(cModeSel.value === 'native', '评论排序默认原版');

  modeSel.value = 'replace';
  modeSel.dispatchEvent(new window.Event('change', { bubbles: true }));
  await sleep(200);
  const stored = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || '{}');
  ok(stored.sortMode === 'replace', '切换写进 localStorage');

  const times = sec.querySelector('[data-px-set="showTimes"]');
  ok(times.getAttribute('aria-checked') === 'false', '「显示改良」默认关闭');
  times.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(150);
  ok(times.getAttribute('aria-checked') === 'true', '可以打开「显示改良」');

  sec.querySelector('[data-px-reset]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(150);
  ok(modeSel.value === 'native' && times.getAttribute('aria-checked') === 'false', '「恢复默认」把模式与开关都还原');
}

async function runCookie() {
  console.log('\n[F. Cookie 只在内存]');
  const { doc, window } = boot(HOME_HTML, 'http://localhost/', {
    settings: { sortMode: 'replace' },
    loggedIn: true,
    cookie: 'pk_session=abc123',
  });
  await sleep(700);
  ok(!/pk_session/.test(JSON.stringify({ ...doc.defaultView.localStorage })), '登录态没有被写进 localStorage');
  window.dispatchEvent(new window.Event('pagehide'));
  await sleep(50);
  ok(!/pk_session/.test(JSON.stringify({ ...doc.defaultView.localStorage })), 'pagehide 之后依然没有任何持久化痕迹');

  // 关掉「读取登录状态」→ 关注流请求也不带 Cookie
  const off = boot(HOME_HTML, 'http://localhost/', { settings: { sortMode: 'replace', useSession: false } });
  await sleep(600);
  off.doc.querySelector('[data-sort="following"]').dispatchEvent(new off.window.MouseEvent('click', { bubbles: true }));
  await sleep(600);
  const fc = off.calls.filter((c) => c.url.includes('scope=following'));
  ok(fc.length > 0 && fc.every((c) => c.init.credentials === 'omit'), '关掉登录态后关注流也是 credentials:omit');
}

async function runStats() {
  console.log('\n[J. 首页数据统计卡片（独立懒加载）]');
  // 默认关：首页不该出现卡片
  const off = boot(HOME_HTML, 'http://localhost/');
  await sleep(500);
  ok(!off.doc.getElementById('pictExt-stats'), '默认关：首页没有统计卡片');
  ok(off.calls.filter((c) => /\/api\/v1\/topics/.test(c.url) && new URL(c.url).searchParams.get('sort') === 'latest').length === 0, '默认关：不额外发统计请求');

  // 打开开关：卡片挂载，默认折叠，不发数据请求
  const on = boot(HOME_HTML, 'http://localhost/', { settings: { showStats: true } });
  await sleep(500);
  const card = on.doc.getElementById('pictExt-stats');
  ok(!!card, '打开开关：首页出现统计卡片');
  const panel = card && card.querySelector('.pxst-panel');
  ok(!!panel && panel.hidden === true, '卡片默认折叠');
  ok(card && card.querySelectorAll('[data-px-stats-tab]').length === 2, '两个标签页：帖子发布 / 回复热度');
  ok(!!on.doc.getElementById('pictExt-style') && /pxst-svg/.test(on.doc.getElementById('pictExt-style').textContent), '样式随模块注入');
  const beforeExpand = on.calls.filter((c) => /\/api\/v1\/topics/.test(c.url) && (new URL(c.url).searchParams.get('sort') === 'latest')).length;

  // 点开：懒加载触发 /topics?sort=latest，渲染 SVG
  const tog = card.querySelector('[data-px-stats-toggle]');
  tog.dispatchEvent(new on.window.MouseEvent('pointerdown', { bubbles: true, button: 0 }));
  await sleep(500);
  const afterExpand = on.calls.filter((c) => /\/api\/v1\/topics/.test(c.url) && new URL(c.url).searchParams.get('sort') === 'latest').length;
  ok(afterExpand > beforeExpand, '点开才发统计请求（懒加载）');
  ok(!!card.querySelector('.pxst-svg'), '渲染出折线/柱状 SVG 图');
  ok(/帖子发布总数统计/.test(card.querySelector('.pxst-title')?.textContent || ''), '默认显示「帖子发布总数统计」');
  ok(!!on.window.localStorage.getItem('pictExt:stats:v1'), '统计结果写进本机缓存');

  // 切到「回复热度」：标题变化，仍是同一份数据
  const tabReply = card.querySelector('[data-px-stats-tab="replies"]');
  tabReply.dispatchEvent(new on.window.MouseEvent('pointerdown', { bubbles: true, button: 0 }));
  await sleep(120);
  ok(/回复热度统计/.test(card.querySelector('.pxst-title')?.textContent || ''), '切到「回复热度」标题更新');
  ok(tabReply.dataset.active === 'true', '标签页选中态同步');

  // 不影响 feed：原生卡片仍在（原版模式下没被隐藏）
  const native = [...on.doc.querySelectorAll('section[aria-label="推荐帖子"] article.native-card')];
  ok(native.length === 2 && native.every((n) => n.style.display !== 'none'), '统计卡片不影响原生推荐流显示');

  // 回归：排序「全部替换」模式下，nativeHider 不能把统计卡片一起 display:none
  const repl = boot(HOME_HTML, 'http://localhost/', { settings: { sortMode: 'replace', showStats: true } });
  await sleep(700);
  const rCard = repl.doc.getElementById('pictExt-stats');
  ok(!!rCard, '替换模式下统计卡片也挂载');
  ok(!!rCard && rCard.style.display !== 'none', '替换模式下统计卡片不被 nativeHider 隐藏（关键回归）');
  const rPanel = repl.doc.getElementById('pictExt-panel');
  ok(!!rPanel, '替换模式下排序面板照常存在');
  ok(!!rCard && !!rPanel && !!rCard.nextElementSibling && rCard !== rPanel, '卡片与排序面板是两个独立节点');

  // 悬停柱子显示当天详情浮层
  const hit = card.querySelector('.pxst-hit');
  ok(!!hit, '图表有逐日透明命中条');
  ok(hit && hit.hasAttribute('data-px-stats-day'), '命中条带当天日期数据');
  hit.dispatchEvent(new on.window.MouseEvent('pointermove', { bubbles: true, clientX: 120, clientY: 120 }));
  await sleep(50);
  const tip = on.doc.getElementById('pxc-stats-tip');
  ok(!!tip && tip.dataset.show === '1', '悬停显示详情浮层');
  ok(tip && /当日发帖/.test(tip.textContent) && /累计回复/.test(tip.textContent), '浮层含发帖/回复当日与累计详情');
  ok(hit && tip && tip.textContent.includes(hit.dataset.pxStatsDay), '浮层日期与命中条一致');
  // 移出图表 → 收起
  const head = card.querySelector('.pxst-head');
  head.dispatchEvent(new on.window.MouseEvent('pointermove', { bubbles: true, clientX: 5, clientY: 5 }));
  await sleep(30);
  ok(tip.dataset.show === '0', '移出柱子后浮层收起');
}


/* ---------------------------------------------------------------- */
async function runSuperSearch() {
  console.log('\n[K. Super 搜索 · 严格/宽松匹配 + 候选池增量 + 自动清理]');

  const { doc, calls, window } = boot(SEARCH_HTML, 'http://localhost/search?q=帖子', {
    settings: { superSearch: true },
  });
  await sleep(3000); // 面板会自动同步候选池（等同步跑完，池子规模不再变化）

  const panel = doc.getElementById('pictExt-super');
  ok(!!panel, '搜索页出现 Super 搜索面板');
  ok(!doc.getElementById('pictExt-panel'), '搜索页不再注入站内那套排序栏');
  const grid = doc.querySelector('div[aria-label="帖子搜索结果"]');
  ok(grid && grid.style.display === 'none', '站内模糊搜索结果被隐藏');

  // 输入框删掉了：关键词走站点的搜索框（URL 上的 q）
  ok(!panel.querySelector('input'), '面板里没有多余的搜索输入框');
  const kw = panel.querySelector('[data-px-super-keyword]');
  ok(kw && kw.textContent.trim() === '帖子', '关键词取自站内搜索框（URL q）', kw && kw.textContent);

  const status = panel.querySelector('[data-px-super-status]');
  ok(status && /命中/.test(status.textContent), '状态行显示命中数', status && status.textContent);
  ok(status && /已同步至/.test(status.textContent), '状态行显示同步水位线', status && status.textContent);
  ok(status && /池子 \d+ 帖/.test(status.textContent), '状态行显示池子规模');

  // 自动同步：进面板就自己同步了（不用点按钮）
  ok(calls.some((c) => c.url.includes('/api/v1/topics') && c.url.includes('sort=latest')), '进面板自动同步候选池');
  ok(!panel.querySelector('[data-px-super-sync]') && !panel.querySelector('[data-px-super-prune]'), '不再有手动「同步 / 清理」按钮');

  const items = () => [...panel.querySelectorAll('.px-super-item, .px-super-results > article')];
  const goto = async (q) => {
    window.history.pushState({}, '', '/search?q=' + encodeURIComponent(q));
    await sleep(500);
  };

  // 1) 严格：所有词都要命中
  await goto('帖子标题');
  ok(items().length === 20, '单词命中 20 条', String(items().length));
  await goto('帖子标题 摘要');
  ok(items().length === 20, '两词都命中 → 仍是 20 条（AND）', String(items().length));
  await goto('帖子标题 根本没有这个词');
  ok(items().length === 0, '有一个词不命中 → 0 条（严格）', String(items().length));

  // 2) 宽松：任意一个词命中即可
  panel.querySelector('[data-px-super-mode="loose"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(200);
  ok(items().length > 0, '宽松模式下部分命中也算（不再是 0）', String(items().length));
  panel.querySelector('[data-px-super-mode="strict"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(200);
  ok(items().length === 0, '切回严格 → 又回到 0 条', String(items().length));

  // 3) 排除词 / 短语 / 字段限定
  await goto('帖子标题 -2');
  ok(items().length > 0 && items().length < 20, '排除词生效', String(items().length));
  await goto('"帖子标题 1"');
  ok(items().length === 11, '引号短语按子串精确匹配（1 与 10~19 共 11 条）', String(items().length));
  await goto('title:摘要');
  ok(items().length === 0, 'title: 只在标题里找（摘要只在正文 → 0 条）', String(items().length));

  // 4) 排序项：把站点那几项都端上来
  const sortLabels = [...panel.querySelectorAll('[data-px-super-sort]')].map((b) => b.textContent.trim());
  ok(
    sortLabels.join(',') === '相关度,最新,最早,最多浏览,最多点赞,最多回复,最多收藏,最热',
    '8 项排序都在（相关度/最新/最早/浏览/点赞/回复/收藏/最热）',
    sortLabels.join(',')
  );
  await goto('帖子标题');
  panel.querySelector('[data-px-super-sort="earliest"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(200);
  ok(panel.querySelector('[data-px-super-sort="earliest"]').dataset.active === 'true', '「最早」可选并高亮');
  const firstTitle = items()[0]?.querySelector('h2')?.textContent.trim();
  ok(!!firstTitle, '结果用站点卡片结构渲染（带标题）', firstTitle);

  // 5) 卡片风格：站点卡片 + 「帖子 / 回复 · 第 N 楼」标签
  const badge = items()[0]?.querySelector('.px-kind');
  ok(!!badge && badge.textContent.trim() === '帖子', '帖子结果标「帖子」', badge && badge.textContent);
  ok(!!items()[0]?.querySelector('ul[aria-label="帖子数据"]'), '卡片带站点同款数据行（回复/浏览/赞/收藏）');
  await goto('Box');
  const scopeBtn = panel.querySelector('[data-px-super-scope="reply"]');
  scopeBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(200);
  const replyItems = items();
  ok(replyItems.length > 0, '回复里有命中项', String(replyItems.length));
  const replyBadge = replyItems[0]?.querySelector('.px-kind');
  ok(replyBadge && /回复 · 第 \d+ 楼/.test(replyBadge.textContent), '回复结果标「回复 · 第 N 楼」', replyBadge && replyBadge.textContent);
  ok(!!replyItems[0]?.querySelector('mark.px-mark'), '命中关键词高亮');

  // 5.5) 悬停不闪：重绘不能把鼠标底下的卡片换掉（内容没变就不重画）
  panel.querySelector('[data-px-super-scope="all"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(150);
  await goto('帖子标题');
  await sleep(300);
  const firstCard = items()[0];
  ok(!!firstCard, '有结果卡');
  await sleep(1500); // 让 observer / 定时器有机会触发若干轮
  const stillThere = items()[0] === firstCard;
  ok(stillThere, '内容没变时结果卡不会被重建（悬停不闪）', stillThere ? '同一个节点' : '节点被换掉了');

  // 5.6) 按钮一点就中（pointerdown 委托，站点重渲染也不失效）
  const modeChip = panel.querySelector('[data-px-super-mode="loose"]');
  // jsdom 没有 PointerEvent，用 MouseEvent 带上 pointerdown 类型即可（监听按类型名注册）
  modeChip.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, button: 0 }));
  await sleep(200);
  ok(panel.querySelector('[data-px-super-mode="loose"]').dataset.active === 'true', 'pointerdown 一次就切到「宽松匹配」');

  // 5.65) 手动深挖按钮：点一下就多挖几页历史
  const deeperBtn = panel.querySelector('[data-px-super-deeper]');
  ok(!!deeperBtn, '面板上有「深挖候选池」按钮');
  const topicReqsBefore = calls.filter((c) => new URL(c.url).pathname === '/api/v1/topics').length;
  deeperBtn.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, button: 0 }));
  await sleep(1200);
  const topicReqsAfter = calls.filter((c) => new URL(c.url).pathname === '/api/v1/topics').length;
  ok(topicReqsAfter > topicReqsBefore, '深挖会多翻几页（发起了更多拉取）', topicReqsBefore + ' → ' + topicReqsAfter);

  // 5.7) 候选池深度改了 → 立刻按新深度刷新
  const set = boot(SETTINGS_HTML, 'http://localhost/settings', { settings: { superSearch: true } });
  await sleep(600);
  set.doc.querySelector('[data-px-settings-nav]').dispatchEvent(new set.window.MouseEvent('click', { bubbles: true }));
  await sleep(400);
  const depthInput = set.doc.querySelector('input[data-px-set="superPoolPages"]');
  ok(!!depthInput, '设置里有「候选池深度」');
  const topicsBefore = set.calls.filter((c) => new URL(c.url).pathname === '/api/v1/topics').length;
  depthInput.value = '20';
  depthInput.dispatchEvent(new set.window.Event('change', { bubbles: true }));
  await sleep(1200);
  const topicsAfter = set.calls.filter((c) => new URL(c.url).pathname === '/api/v1/topics').length;
  ok(topicsAfter > topicsBefore, '改深度后立刻刷新候选池（发起了新的拉取）', topicsBefore + ' → ' + topicsAfter);

  // 5.8) 关注流只有一两条时自动续拉，别只给一条
  const home = boot(HOME_HTML, 'http://localhost/', { settings: { sortMode: 'replace' }, loggedIn: true });
  await sleep(700);
  home.doc.querySelector('[data-sort="following"]').dispatchEvent(new home.window.MouseEvent('click', { bubbles: true }));
  await sleep(1200);
  const feedCards = home.doc.querySelectorAll('#pictExt-panel .px-list > article').length;
  ok(feedCards >= 7, '关注流自动续拉，不再只给 1 条', String(feedCards));

  // 5.9) Super 候选池的缓存，别的排序池也能白捡
  const cachedPool = {
    v: 1,
    watermark: Date.parse('2026-11-20T00:00:00.000Z'),
    updatedAt: Date.now(),
    topics: {
      'cached-1': {
        id: 'cached-1',
        title: '缓存帖甲',
        text: '来自 Super 候选池的正文',
        authorId: 'u9',
        authorName: '缓存用户',
        replyCount: 7,
        viewCount: 70,
        likeCount: 3,
        bookmarkCount: 1,
        tags: [],
        createdAt: '2026-11-19T10:00:00.000Z',
        lastActivityAt: '2026-11-19T12:00:00.000Z',
        _t: Date.parse('2026-11-19T10:00:00.000Z'),
        _a: Date.parse('2026-11-19T12:00:00.000Z'),
      },
    },
    replies: {},
  };
  const reuse = boot(HOME_HTML, 'http://localhost/', {
    settings: { sortMode: 'replace' },
    superPool: cachedPool,
  });
  await sleep(1200);
  const titles = [...reuse.doc.querySelectorAll('#pictExt-panel .px-list h2')].map((h) => h.textContent.trim());
  ok(titles.some((t) => t.includes('缓存帖甲')), '排序候选池直接用上 Super 候选池的缓存', titles.slice(0, 5).join(' | '));

  // 6) 自动清理失效：被删的帖子不会留在池子里
  const withGone = boot(SEARCH_HTML, 'http://localhost/search?q=帖子', {
    settings: { superSearch: true },
    superGone: ['topic-3'],
  });
  await sleep(1800);
  const goneStatus = withGone.doc.querySelector('[data-px-super-status]');
  const gonePool = /池子 (\d+) 帖/.exec(goneStatus ? goneStatus.textContent : '');
  ok(gonePool && Number(gonePool[1]) === 19, '失效帖子（404）被自动清出候选池', goneStatus && goneStatus.textContent);
}

(async () => {
  await runNative();
  await runReplaceHome();
  await runReplaceCategory();
  await runPoolPaging();
  await runNewSorts();
  await runCommentPaging();
  await runThreadPagingAndTruncate();
  await runCollectionBox();
  await runProfileCollections();
  await runReplaceSearch();
  await runSearchKindAndFocus();
  await runPerf();
  await runTimes();
  await runDetailReplace();
  await runWorkComments();
  await runSettings();
  await runStats();
  await runSuperSearch();
  await runCookie();
  console.log('\n' + (failures ? `✗ ${failures} 项失败` : '✓ 全部通过'));
  process.exit(failures ? 1 : 0);
})();
