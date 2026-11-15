/**
 * pictExt / v1.7.4
 * ---------------------------------------------------------------
 * Manifest V3 浏览器扩展的内容脚本，由 manifest.json 注入，不依赖 Tampermonkey。
 * 声明了 "world": "MAIN"，跑在页面主世界（和原油猴脚本一致），因此
 * hookRouter() 对 history.pushState 的包装、以及页面 DOM 的读写都能正常工作。
 * 全文件不使用任何 GM_* / chrome.* API，也没有外部依赖。
 * ---------------------------------------------------------------
 * 【v1.7.4 变更】
 * - 右侧栏目录很长 + 合集很多时两块会叠在一起：侧栏改成整体可滚（overflow-y:auto），
 *   合集块限高 45vh 自带滚动、加实底并压在上层，目录不再透过来。
 * - 搜索结果里命中第 1 楼不再标「评论 · 第 1 楼」——首楼就是帖子正文，标「帖子」。
 * 【v1.7.3 变更】
 * - 搜索结果卡标出命中类型：「帖子」/「评论 · 第 N 楼」（评论结果链接带 #post-N）。
 * - 从结果点进帖子时按 #post-N 定位：目标在楼中楼 → 自动展开该楼并翻到对应页；
 *   目标是顶层楼层 → 翻到它所在的页；命中项高亮 10 秒。
 * 【v1.7.2 变更】
 * - 修「点一次不干脆」：扩展按钮的动作改到 pointerdown（手指/鼠标按下即响应）执行，
 *   随后那次 click 直接吞掉；就算 Vue 在按下与抬起之间重建了节点也不影响。
 * - 长评论截断不再留空项目符号：截断点之后的整块内容（列表 / 图片 / 代码块）一起隐藏，
 *   「展开全文」改成紧贴省略号的行内小按钮。
 * 【v1.7.1 变更】
 * - 修「点两次才生效」：所有扩展按钮的点击改成 document 级事件委托 + 只读 data-*，
 *   站点（Vue）重建节点也不会丢监听器；翻页器内容不变就不重绘。
 * - 楼中楼：一层楼里回复 ≥10 条时给页码（每页 10 条），不足 10 条不显示；
 *   折叠状态下页码一起隐藏。
 * - 长评论：正文（楼层或楼中楼）超过 300 字只显示前 200 字 + 「展开全文」，
 *   展开后原样还原（含截断点之后的图片 / 代码块）。
 * 【v1.7.0 变更】
 * - 排序项：「最早」全面上线（接口没有服务端最早 → 候选池按 createdAt 正序）；
 *   板块页新增「默认排序」= 站点不加插件时的原始顺序（请求不带 sort）。
 * - 候选池页数可在设置里调（最新 / 推荐各 1-100 页）。
 * - 评论区：删掉「最多楼高」；新增按页显示（仿 B 站，1-20 楼/页，默认 10），
 *   翻页器在楼层下方，和排序 / 关注筛选互不干扰。
 * - 帖子右侧栏（文章目录下面）新增「所属合集」：合集名 + 当前第几篇，
 *   可在合集内直接切换；合集内排序 最早 / 最多浏览 / 最多点赞 / 最多回复 /
 *   最多收藏 / 最热（最热按互动加权估算）；默认只显示标题，可展开统计与简介。
 * - 个人资料页合集列表：上方加「搜索合集名字」+ 最新 / 最多浏览 / 最多点赞 /
 *   最多回复（按合集内帖子合计）。
 * 【v1.6.2 变更】
 * - 候选池（最多浏览 / 点赞 / 回复 / 收藏）默认只翻 9 页（最新 6 + 热帖 3），
 *   但不再是硬上限：池子看完后底部给「继续往后翻」，按各自游标接着拉，
 *   两条链谁到底就停谁，直到两边都到底才显示「已经到底了」。
 * 【v1.6.1 变更】
 * - 修：板块页（/forum/category/:slug）一直不注入排序栏。站点真实节点是
 *   section[aria-label="板块帖子"]，旧代码写死成 div[...]，选择器匹配不到。
 *   现在按 aria-label 匹配 + 两个结构兜底，改版也不至于整页失效。
 * - 排序项「推荐流」改名「站内推荐」（与站内叫法对齐）。
 * 【隐私红线 —— 本扩展的硬约束】
 * 1. 只在内存里保留一份当前页的 Cookie 快照（authState.cookie），用于判断
 *    「当前是否登录」，页面卸载 / 切到后台时立刻抹掉，绝不写入任何存储。
 * 2. 登录态请求用 credentials: 'include'（浏览器自己带 Cookie，扩展不手动拼头）；
 *    关掉「读取登录状态」后所有请求回到 credentials: 'omit'，与未登录完全一致。
 * 3. 只调用站点的只读 GET 接口（/topics、/topics/{id}、/topic-recommendations…），
 *    不发任何写请求。
 * ---------------------------------------------------------------
 * 【v1.6.0 变更】
 * - 搜索页的「推荐流」替换为「站内搜索」（sort=relevance）；首页 / 板块页不显示它。
 * - 关注 / 推荐流改成逐页「继续加载」，游标过期时保留已显示条目。
 * 【v1.5.1 变更】
 * - 评论区改版排序修好：站内「评论排序」是下拉组件而非一排标签，改为自己按接口顺序算；
 *   排序不再搬 DOM 节点，改用 CSS order（Vue 重渲染不会还原，也不触发观察器回环）。
 * 【v1.5 变更】
 * - 帖子排序两种模式：「原版」（不替换，默认）/「全部替换」（关注、推荐流、最新、
 *   最多浏览、最多点赞、最多回复、最多收藏、最热 共 8 项，首页 / 全部板块页 / 搜索页都有）。
 * - 评论区排序两种模式：「原版」（仅额外提供「折叠全部回复」，默认）/「改版」
 *   （最热、关注、最早、最新、最多点赞、最多楼高）。
 * - 新增「显示改良」：卡片时间改为 发布时间 / 最近更新 / 最近回复 三项。
 * - Cookie 只在内存驻留，pagehide / 切后台即清除。
 * 【v1.4.1 变更】
 * - 帖子回复区：默认展开站内自带的 Markdown 格式工具栏（不做自定义 UI、不加 CSS）。
 * 【v1.4 变更】
 * - 从 Tampermonkey 用户脚本改为独立的 MV3 浏览器扩展（manifest.json + content.js）。
 * - 移除「与站内排序合并到一排」选项及其实现，排序栏固定单独一排。
 * 【v1.1 变更】
 * - 帖子详情页：楼中楼默认折叠（≥2 条），单楼可展开/收起，另有「折叠全部回复」；
 *   评论区顶部补一条帖子信息（浏览/回复/点赞/发布/最后活跃/标签/状态）。
 * - 列表卡片：改用站点原生类名渲染，视觉与原生一致；在原生「回复/浏览」之外
 *   补出「赞/收藏」，标签、置顶标记、相对时间也一并显示。
 */

(function () {
  'use strict';

  /* ============================================================
   * 0. 常量
   * ============================================================ */
  const API_BASE = '/api/v1';
  const PANEL_ID = 'pictExt-panel';
  const PAGE_LIMIT = 50;          // /topics 上限 50，填更大直接 400
  const FEED_LIMIT = 30;          // /topic-recommendations 上限只有 30
  const POOL_LATEST_PAGES = 6;    // 候选池：最新 6 页 = 300 条
  const POOL_HOT_PAGES = 3;       // 候选池：热帖 3 页 = 150 条
  const POOL_PAGES_MAX = 100;     // 设置里单条链最多 100 页（50 条/页）
  const ENRICH_MAX = 40;          // 搜索页补点赞数的最多请求条数
  const ENRICH_CONCURRENCY = 5;
  const CACHE_TTL = 90 * 1000;
  const DEBUG = false;

  /** 8 个排序键（v1.5 起「全部替换」模式固定就是这 8 个，不再跟站内合并） */
  const SORT_KEYS = new Set([
    'following', 'recommended', 'default', 'search', 'latest', 'earliest',
    'views', 'likes', 'replies', 'bookmarks', 'hot',
  ]);

  const log = (...a) => DEBUG && console.log('[pictExt]', ...a);

  /* ============================================================
   * 0.5 设置（只存在本机 localStorage，不碰 Cookie / 站点会话）
   * ============================================================ */
  const SETTINGS_KEY = 'pictExt:settings:v1';
  const DEFAULT_SETTINGS = {
    sortMode: 'native',       // 帖子排序：native 原版（不替换，默认）| replace 全部替换
    commentSortMode: 'native',// 评论排序：native 原版（只多一个折叠全部）| replace 改版
    showTimes: false,         // 显示改良：发布时间 / 最近更新 / 最近回复
    useSession: true,         // 读取当前登录状态（仅内存，用完即删）
    homeSort: true,           // 替换模式下：首页启用
    categorySort: true,       // 替换模式下：板块页启用
    searchSort: true,         // 替换模式下：搜索页启用
    defaultSort: 'latest',    // 替换模式下的默认排序（8 项之一）
    collapse: true,           // 楼中楼自动折叠
    collapseMin: 2,           // 楼中楼 ≥ N 条才折叠
    globalToggle: true,       // 显示「折叠全部回复」
    topicInfo: true,          // 评论区顶部显示帖子信息条
    replyToolbar: true,       // 回复区默认展开站内自带的 Markdown 格式工具栏
    showLikes: true,          // 卡片显示赞数
    showBookmarks: true,      // 卡片显示收藏数
    showTags: true,           // 卡片显示标签
    showPinned: true,         // 卡片显示置顶标记
    poolLatestPages: 6,       // 候选池：最新链翻几页（1-100）
    poolHotPages: 3,          // 候选池：热帖（推荐）链翻几页（1-100）
    commentPaging: true,      // 评论区按页显示（像 B 站那样）
    commentPageSize: 10,      // 评论每页楼层数（1-20）
  };

  /** 把数字设置夹回合法区间，坏存档 / 手输都不至于把请求打爆 */
  function clampInt(value, lo, hi, dflt) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return dflt;
    return Math.min(hi, Math.max(lo, n));
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS };
      const parsed = JSON.parse(raw);
      // v1.4 起移除了「与站内排序合并到一排」，旧存档里残留的键直接丢掉
      if (parsed && typeof parsed === 'object') delete parsed.mergeTabs;
      const merged = { ...DEFAULT_SETTINGS, ...(parsed && typeof parsed === 'object' ? parsed : {}) };
      // v1.5：旧版默认排序里的 'default' 是「站内默认」，新版 8 项里没有这一项
      if (!SORT_KEYS.has(merged.defaultSort)) merged.defaultSort = 'latest';
      merged.poolLatestPages = clampInt(merged.poolLatestPages, 1, 100, 6);
      merged.poolHotPages = clampInt(merged.poolHotPages, 1, 100, 3);
      merged.commentPageSize = clampInt(merged.commentPageSize, 1, 20, 10);
      return merged;
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  let settings = loadSettings();
  /** 设置页里用户是否正在看 PICTEXT 面板 */
  let settingsActive = false;

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* 无痕模式等场景下写不进去就算了，不影响功能 */
    }
  }

  /* ============================================================
   * 1. 工具
   * ============================================================ */
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function debounce(fn, ms) {
    let t = 0;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  function timeAgo(iso) {
    if (!iso) return '';
    const d = new Date(iso).getTime();
    if (!Number.isFinite(d)) return '';
    const diff = Date.now() - d;
    if (diff < 0) return '刚刚';
    const min = Math.floor(diff / 60000);
    if (min < 1) return '刚刚';
    if (min < 60) return `${min} 分钟前`;
    const hour = Math.floor(min / 60);
    if (hour < 24) return `${hour} 小时前`;
    const day = Math.floor(hour / 24);
    if (day < 30) return `${day} 天前`;
    const month = Math.floor(day / 30);
    if (month < 12) return `${month} 个月前`;
    return `${Math.floor(month / 12)} 年前`;
  }

  const fmtNum = (n) => {
    const v = Number(n) || 0;
    if (v >= 10000) return (v / 10000).toFixed(1).replace(/\.0$/, '') + ' 万';
    return String(v);
  };

  /* ---------- 图标：与站点同款 Phosphor 线性图标（内联，15px） ---------- */
  const ICON_PATHS = {
    chat: 'M128 24a104 104 0 0 0-91.82 152.88l-11.35 34.05a16 16 0 0 0 20.24 20.24l34.05-11.35A104 104 0 1 0 128 24m0 192a87.87 87.87 0 0 1-44.06-11.81a8 8 0 0 0-6.54-.67L40 216l12.47-37.4a8 8 0 0 0-.66-6.54A88 88 0 1 1 128 216',
    eye: 'M247.31 124.76c-.35-.79-8.82-19.58-27.65-38.41C194.57 61.26 162.88 48 128 48S61.43 61.26 36.34 86.35C17.51 105.18 9 124 8.69 124.76a8 8 0 0 0 0 6.5c.35.79 8.82 19.57 27.65 38.4C61.43 194.74 93.12 208 128 208s66.57-13.26 91.66-38.34c18.83-18.83 27.3-37.61 27.65-38.4a8 8 0 0 0 0-6.5M128 192c-30.78 0-57.67-11.19-79.93-33.25A133.5 133.5 0 0 1 25 128a133.3 133.3 0 0 1 23.07-30.75C70.33 75.19 97.22 64 128 64s57.67 11.19 79.93 33.25A133.5 133.5 0 0 1 231.05 128c-7.21 13.46-38.62 64-103.05 64m0-112a48 48 0 1 0 48 48a48.05 48.05 0 0 0-48-48m0 80a32 32 0 1 1 32-32a32 32 0 0 1-32 32',
    heart: 'M178 40c-20.65 0-38.73 8.88-50 23.89C116.73 48.88 98.65 40 78 40a62.07 62.07 0 0 0-62 62c0 70 103.79 126.66 108.21 129a8 8 0 0 0 7.58 0C136.21 228.66 240 172 240 102a62.07 62.07 0 0 0-62-62m-50 174.8c-18.26-10.64-96-59.11-96-112.8a46.06 46.06 0 0 1 46-46c19.45 0 35.78 10.36 42.6 27a8 8 0 0 0 14.8 0c6.82-16.67 23.15-27 42.6-27a46.06 46.06 0 0 1 46 46c0 53.61-77.76 102.15-96 112.8',
    bookmark:
      'M184 32H72a16 16 0 0 0-16 16v176a8 8 0 0 0 12.24 6.78L128 193.43l59.77 37.35A8 8 0 0 0 200 224V48a16 16 0 0 0-16-16m0 177.57l-51.77-32.35a8 8 0 0 0-8.48 0L72 209.57V48h112Z',
    pin: 'm235.32 81.37l-60.69-60.68a16 16 0 0 0-22.63 0l-53.63 53.8c-10.66-3.34-35-7.37-60.4 13.14a16 16 0 0 0-1.29 23.78L85 159.71l-42.66 42.63a8 8 0 0 0 11.32 11.32L96.29 171l48.29 48.29A16 16 0 0 0 155.9 224h1.13a15.93 15.93 0 0 0 11.64-6.33c19.64-26.1 17.75-47.32 13.19-60L235.33 104a16 16 0 0 0-.01-22.63M224 92.69l-57.27 57.46a8 8 0 0 0-1.49 9.22c9.46 18.93-1.8 38.59-9.34 48.62L48 100.08c12.08-9.74 23.64-12.31 32.48-12.31A40.1 40.1 0 0 1 96.81 91a8 8 0 0 0 9.25-1.51L163.32 32L224 92.68Z',
    tag: 'M243.31 136L144 36.69A15.86 15.86 0 0 0 132.69 32H40a8 8 0 0 0-8 8v92.69A15.86 15.86 0 0 0 36.69 144L136 243.31a16 16 0 0 0 22.63 0l84.68-84.68a16 16 0 0 0 0-22.63M96 112a16 16 0 1 1 16-16a16 16 0 0 1-16 16',
  };

  function icon(name, size = 15, cls = 'shrink-0') {
    const d = ICON_PATHS[name];
    if (!d) return '';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" class="${cls}"><path d="${d}"/></svg>`;
  }

  /* ============================================================
   * 2. 网络层 —— 只读；登录态可选，Cookie 只在内存里过一手
   * ============================================================ */

  /**
   * Cookie 快照：仅仅把 document.cookie 读进这个对象，用来判断「现在是不是登录状态」。
   * 不写 localStorage / sessionStorage / IndexedDB，不上传，不手动拼请求头
   * （真正的 Cookie 由浏览器在 credentials:'include' 时自己带上）。
   * 页面卸载、切到后台、路由切换都会 wipe()，变量直接清空。
   */
  const authState = {
    cookie: '',
    capturedAt: 0,
    read() {
      if (!settings.useSession) {
        this.cookie = '';
        return '';
      }
      try {
        this.cookie = typeof document !== 'undefined' ? document.cookie || '' : '';
      } catch {
        this.cookie = '';
      }
      this.capturedAt = Date.now();
      return this.cookie;
    },
    get hasCookie() {
      return !!this.cookie;
    },
    /** 抹掉内存里的快照（不是删站点的 Cookie，那会把用户登出） */
    wipe() {
      this.cookie = '';
      this.capturedAt = 0;
      detailCache.clear();
      poolCache.clear();
      commentIndexCache.clear();
      followingCache = null;
    },
  };

  function buildUrl(path, params) {
    const url = new URL(API_BASE + path, location.origin);
    for (const [k, v] of Object.entries(params || {})) {
      if (v === undefined || v === null || v === '') continue;
      if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(k, String(x)));
      else url.searchParams.set(k, String(v));
    }
    return url.toString();
  }

  /**
   * @param {string} path
   * @param {object} [params]
   * @param {{auth?: boolean}} [opts] auth=true 才带登录态；默认按设置决定
   */
  async function apiGet(path, params, opts) {
    const wantAuth = opts && opts.auth === true;
    const useAuth = wantAuth && !!settings.useSession;
    if (useAuth && !authState.capturedAt) authState.read();
    const res = await fetch(buildUrl(path, params), {
      method: 'GET',
      // 未登录 / 关闭登录态时固定 omit：浏览器层面就不会把 Cookie 发出去
      credentials: useAuth ? 'include' : 'omit',
      mode: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      // 站点错误体是 {statusCode, code, message, details}，推荐流的游标错误要靠 code 分辨
      try {
        const body = await res.json();
        if (body) {
          err.code = body.code || '';
          err.message = body.message || err.message;
          err.details = body.details;
        }
      } catch {
        /* 没有 JSON 体就算了 */
      }
      throw err;
    }
    return res.json();
  }

  /* ============================================================
   * 3. 数据层
   * ============================================================ */

  /** 统一字段。带 q 的搜索返回里没有 likeCount，标为 null 等补齐。 */
  function normalize(it) {
    return {
      id: it.id,
      title: it.title || '',
      excerpt: (it.match && it.match.excerpt) || it.excerpt || '',
      author: it.author || (it.match && it.match.author) || null,
      replyCount: Number(it.replyCount ?? 0),
      viewCount: Number(it.viewCount ?? 0),
      likeCount: typeof it.likeCount === 'number' ? it.likeCount : null,
      bookmarkCount: typeof it.bookmarkCount === 'number' ? it.bookmarkCount : null,
      createdAt: it.createdAt || null,
      // editedAt = 最近一次修改（帖子有新版本才有值）
      editedAt: it.editedAt || null,
      lastActivityAt: it.lastActivityAt || it.createdAt || null,
      tags: Array.isArray(it.tags) ? it.tags : [],
      pinned: !!(it.pinned || it.pinnedGlobally),
      kind: it.kind || '',
      matchPostNumber: it.match ? it.match.postNumber : null,
    };
  }

  /** 拉一页 /topics。ctx: {q, boards, tag} */
  async function fetchTopicPage(ctx, sort, cursor) {
    const params = { limit: PAGE_LIMIT, cursor };
    if (sort) params.sort = sort; // 不传 sort = 站点自己的默认顺序（板块页「默认排序」）
    if (ctx.q) params.q = ctx.q;
    if (ctx.tag) params.tag = ctx.tag;
    if (ctx.boards && ctx.boards.length) {
      params.tag = ctx.boards;
      params.tagMode = 'any';
    }
    const data = await apiGet('/topics', params);
    const items = (data.items || []).map(normalize);
    const next = data.pageInfo && data.pageInfo.nextCursor ? data.pageInfo.nextCursor : null;
    return { items, next };
  }

  /**
   * 拉一页 /topic-recommendations。
   * scope='following' 就是站内的「关注」流（必须登录才有），不传 scope 是公开的推荐流。
   */
  async function fetchFeedPage(scope, cursor) {
    const params = { limit: FEED_LIMIT, cursor };
    if (scope === 'following') params.scope = 'following';
    // 推荐流的游标绑定"本次浏览"（服务端按会话记状态），所以带登录态去请求更容易续上；
    // settings.useSession 关掉时 apiGet 仍会退回 credentials:'omit'
    const data = await apiGet('/topic-recommendations', params, { auth: true });
    const items = (data.items || []).map(normalize);
    const next = data.pageInfo && data.pageInfo.nextCursor ? data.pageInfo.nextCursor : null;
    return { items, next };
  }

  /**
   * 顺链拉多页（游标必须串行）。返回最后那个游标，方便之后继续往后翻。
   * done = 这条链已经到底（服务端没给 nextCursor）
   */
  async function fetchChain(ctx, sort, pages) {
    const out = [];
    let cursor = null;
    let done = false;
    let n = 0;
    for (let i = 0; i < pages; i++) {
      const page = await fetchTopicPage(ctx, sort, cursor);
      out.push(...page.items);
      n++;
      cursor = page.next;
      if (!cursor) {
        done = true;
        break;
      }
    }
    return { items: out, cursor, done, pages: n };
  }

  const detailCache = new Map();

  /** 搜索返回体没有 likeCount，用详情里的 firstPost.likeCount 补 */
  async function fetchLikeCount(id) {
    if (detailCache.has(id)) return detailCache.get(id);
    let likes = 0;
    try {
      const d = await apiGet('/topics/' + encodeURIComponent(id));
      likes = Number(d?.firstPost?.likeCount ?? 0);
    } catch {
      likes = 0;
    }
    detailCache.set(id, likes);
    return likes;
  }

  /** 只补齐排上队的那些；没补到的保持 null，后面会被排除，绝不伪造 0 赞 */
  async function enrichLikes(items, max = ENRICH_MAX) {
    const need = items.filter((i) => i.likeCount === null);
    const slice = need.slice(0, max);
    let idx = 0;
    const workers = Array.from({ length: ENRICH_CONCURRENCY }, async () => {
      while (idx < slice.length) {
        const item = slice[idx++];
        item.likeCount = await fetchLikeCount(item.id);
      }
    });
    await Promise.all(workers);
  }

  /**
   * 候选池 = 最新链 + 热帖链。
   * 默认只取 9 页（最新 6 + 热帖 3，约 450 条）；这两条链的游标一并留着，
   * 用户点「继续加载」时可以接着往后翻，不是到第 9 页就断了。
   */
  const poolCache = new Map();

  /** 按 id 合并，保留带点赞数的那份 */
  function mergeTopics(target, incoming) {
    const map = new Map(target.map((i) => [i.id, i]));
    for (const it of incoming) {
      const prev = map.get(it.id);
      if (!prev) map.set(it.id, it);
      else if (prev.likeCount === null && it.likeCount !== null) map.set(it.id, it);
    }
    return [...map.values()];
  }

  function poolKey(ctx) {
    return JSON.stringify([ctx.q || '', ctx.tag || '', ctx.boards || []]);
  }

  /** 初始池：最新 6 页 + 热帖 3 页 */
  async function createPool(ctx) {
    const key = poolKey(ctx);
    const hit = poolCache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL) return { ...hit.state, items: hit.state.items.slice() };

    const latestPages = clampInt(settings.poolLatestPages, 1, POOL_PAGES_MAX, POOL_LATEST_PAGES);
    const hotPages = clampInt(settings.poolHotPages, 1, POOL_PAGES_MAX, POOL_HOT_PAGES);
    const [latest, hot] = await Promise.all([
      fetchChain(ctx, 'latest', latestPages),
      fetchChain(ctx, 'hot', hotPages),
    ]);
    const state = {
      items: mergeTopics([], [...hot.items, ...latest.items]),
      cursorLatest: latest.cursor,
      cursorHot: hot.cursor,
      doneLatest: latest.done,
      doneHot: hot.done,
      pages: latest.pages + hot.pages,
    };
    poolCache.set(key, { at: Date.now(), state });
    return { ...state, items: state.items.slice() };
  }

  /** 池子里的条目都看完了：两条链各再往后翻一页（谁没到底就翻谁） */
  async function extendPool(ctx, state) {
    const jobs = [];
    if (!state.doneLatest)
      jobs.push(fetchTopicPage(ctx, 'latest', state.cursorLatest).then((p) => ({ chain: 'latest', p })));
    if (!state.doneHot) jobs.push(fetchTopicPage(ctx, 'hot', state.cursorHot).then((p) => ({ chain: 'hot', p })));
    if (!jobs.length) return 0;

    const rs = await Promise.all(jobs);
    let added = 0;
    for (const { chain, p } of rs) {
      const before = state.items.length;
      state.items = mergeTopics(state.items, p.items);
      added += state.items.length - before;
      state.pages++;
      if (chain === 'latest') {
        state.cursorLatest = p.next;
        state.doneLatest = !p.next;
      } else {
        state.cursorHot = p.next;
        state.doneHot = !p.next;
      }
    }
    return added;
  }

  /** 人话版错误提示 */
  function errorTextOf(err, sort) {
    const code = (err && err.code) || '';
    if (err && err.status === 401) return sort && sort.needAuth ? '关注流需要登录后才能查看' : '这个排序需要登录';
    if (err && err.status === 429) return '请求太频繁，稍等一下再试';
    if (code === 'RECOMMENDATION_FEED_EXPIRED' || code === 'RECOMMENDATION_CURSOR_INVALID') return '这一轮推荐已过期，重试一下';
    if (err && err.status === 400) return '这个排序暂时不可用，换一个试试';
    return '加载失败，请重试';
  }

  /* ============================================================
   * 4. 样式（只保留排序栏与状态行；卡片全部复用站点类名）
   * ============================================================ */
  const CSS = `
#${PANEL_ID}{
  --px-primary: var(--ui-primary, #3b82f6);
  --px-text: var(--ui-text, #111827);
  --px-muted: var(--ui-text-muted, #6b7280);
  --px-dim: var(--ui-text-dimmed, #9ca3af);
  --px-border: var(--ui-border, rgba(127,127,127,.24));
  margin: 0 0 12px;
  color: var(--px-text);
  font-size: 14px;
  line-height: 1.5;
}
#${PANEL_ID}, #${PANEL_ID} *{ box-sizing: border-box; }
#${PANEL_ID} .px-bar{
  display:flex; align-items:center; gap:8px;
  min-height:36px; margin-bottom:8px; flex-wrap:wrap;
}
#${PANEL_ID} .px-tabs{ display:flex; align-items:center; gap:2px; flex-wrap:wrap; }
#${PANEL_ID}.px-align-end .px-tabs{ margin-left:auto; }
#${PANEL_ID} .px-tab{
  appearance:none; border:0; background:transparent; cursor:pointer;
  display:inline-flex; align-items:center; min-width:0;
  padding:6px 12px; border-radius:8px;
  font-size:15px; font-weight:500; font-family:inherit; line-height:1.4;
  color:var(--px-muted); position:relative;
  transition:color .15s ease;
}
#${PANEL_ID} .px-tab:hover{ color:var(--px-text); }
#${PANEL_ID} .px-tab[data-active="true"]{ color:var(--px-primary); }
#${PANEL_ID} .px-tab[data-active="true"]::after{
  content:""; position:absolute; left:10px; right:10px; bottom:-2px;
  height:1px; background:var(--px-primary);
}
#${PANEL_ID} .px-tab:focus-visible{ outline:2px solid var(--px-primary); outline-offset:2px; }
#${PANEL_ID} .px-note{
  font-size:12px; line-height:1.6; color:var(--px-dim); margin:0 0 10px; padding-left:2px;
}
#${PANEL_ID} .px-list{ display:flex; flex-direction:column; gap:12px; }
#${PANEL_ID} .px-state{
  padding:26px 12px; text-align:center; font-size:13px; color:var(--px-dim);
}
#${PANEL_ID} .px-state button{
  margin-top:10px; display:inline-block; cursor:pointer;
  border:1px solid var(--px-border); background:transparent; color:var(--px-text);
  border-radius:8px; padding:6px 14px; font-size:13px; font-family:inherit;
}
#${PANEL_ID} .px-foot{ display:flex; justify-content:center; padding:12px 0 4px; }
#${PANEL_ID} .px-more{
  cursor:pointer; border:1px solid var(--px-border); background:transparent;
  color:var(--px-text); border-radius:9px; padding:8px 22px;
  font-size:13px; font-weight:600; font-family:inherit;
  transition:background-color .15s ease;
}
#${PANEL_ID} .px-more:hover{ background:color-mix(in srgb, var(--px-primary) 10%, transparent); }
#${PANEL_ID} .px-more[disabled]{ opacity:.55; cursor:default; }

/* 评论区「改版」排序栏：视觉对齐站点原生评论排序 */
#pictExt-comment-sort{
  display:flex; align-items:center; gap:2px; flex-wrap:wrap;
  margin: 0 0 10px;
}
#pictExt-comment-sort .pxc-tab{
  appearance:none; border:0; background:transparent; cursor:pointer;
  padding:4px 9px; border-radius:8px;
  font-family:inherit; font-size:14px; font-weight:500; line-height:1.5;
  color:var(--ui-text-muted,#6b7280); position:relative;
  transition:color .15s ease;
}
#pictExt-comment-sort .pxc-tab:hover{ color:var(--ui-text,#111827); }
#pictExt-comment-sort .pxc-tab[data-active="true"]{ color:var(--ui-primary,#3b82f6); }
#pictExt-comment-sort .pxc-tab[data-active="true"]::after{
  content:""; position:absolute; left:8px; right:8px; bottom:-1px;
  height:1px; background:var(--ui-primary,#3b82f6);
}
#pictExt-comment-sort .pxc-note{
  margin-left:6px; font-size:12px; color:var(--ui-text-dimmed,#9ca3af);
}

/* 评论区翻页器（仿 B 站） */
#pictExt-comment-pager{
  display:flex; align-items:center; justify-content:center; flex-wrap:wrap;
  gap:2px; margin:16px 0 4px; font-size:14px; line-height:1.5;
  color:var(--ui-text-muted,#6b7280);
}
#pictExt-comment-pager .pxcp-sum{ margin-right:8px; font-size:13px; }
#pictExt-comment-pager .pxcp-btn{
  appearance:none; border:0; background:transparent; cursor:pointer;
  min-width:28px; padding:4px 7px; border-radius:6px; font-family:inherit;
  font-size:14px; color:var(--ui-text-muted,#6b7280);
  transition:background-color .15s ease,color .15s ease;
}
#pictExt-comment-pager .pxcp-btn:hover{ color:var(--ui-primary,#3b82f6); }
#pictExt-comment-pager .pxcp-btn[data-active="true"]{ color:var(--ui-primary,#3b82f6); font-weight:700; }
#pictExt-comment-pager .pxcp-btn[disabled]{ opacity:.45; cursor:default; }
#pictExt-comment-pager .pxcp-gap{ padding:0 2px; color:var(--ui-text-dimmed,#9ca3af); }

/* 楼中楼翻页 */
.pxc-tpager{
  display:flex; align-items:center; gap:4px; margin:6px 0 0 46px;
  font-size:12px; color:var(--ui-text-muted,#6b7280);
}
.pxc-tpager .pxc-tpager-sum{ margin-right:4px; color:var(--ui-text-dimmed,#9ca3af); }
.pxc-tpager button{
  appearance:none; border:0; background:transparent; cursor:pointer;
  padding:2px 8px; border-radius:6px; font-family:inherit; font-size:12px;
  color:var(--ui-text-muted,#6b7280);
}
.pxc-tpager button:hover{ color:var(--ui-primary,#3b82f6); }
.pxc-tpager button[disabled]{ opacity:.45; cursor:default; }

/* 搜索结果卡片上的「帖子 / 评论」标记 */
.px-kind{
  display:inline-flex; align-items:center; height:18px; padding:0 6px;
  border-radius:5px; font-size:11px; font-weight:700; white-space:nowrap;
  color:var(--ui-text-muted,#6b7280); background:color-mix(in srgb, currentColor 12%, transparent);
}
.px-kind[data-kind="comment"]{ color:var(--ui-primary,#3b82f6); }

/* 从搜索结果跳进来时，命中的那一楼 / 楼中楼高亮 */
[data-px-focus]{
  border-radius:8px;
  background:color-mix(in srgb, var(--ui-primary,#3b82f6) 8%, transparent);
  box-shadow:0 0 0 2px color-mix(in srgb, var(--ui-primary,#3b82f6) 45%, transparent);
  transition:background-color .3s ease, box-shadow .3s ease;
}

/* 长评论折叠 */
[data-px-expand]{
  display:inline; margin-left:4px; appearance:none; border:0; background:transparent;
  cursor:pointer; padding:0; font-family:inherit; font-size:inherit; font-weight:600;
  color:var(--ui-primary,#3b82f6); vertical-align:baseline;
}
[data-px-expand]:hover{ text-decoration:underline; }

/* 帖子右侧栏：所属合集 */
/* 目录很长 + 合集很多时两者会叠在一起：让侧栏自己滚，两块各占各的高度 */
aside[aria-label="帖子信息"]{
  overflow-y:auto;
  overscroll-behavior:contain;
}
aside[aria-label="帖子信息"] > nav[aria-label="文章目录"]{
  flex:0 0 auto;
}
#pictExt-collection{
  flex:0 0 auto;
  position:relative; z-index:2;
  /* 万一目录那块内容溢出来，也盖不住它：给个实底 + 压在最上层 */
  background:var(--ui-bg,Canvas);
  margin-top:20px; padding-top:14px;
  max-height:45vh; overflow-y:auto; overscroll-behavior:contain;
  border-top:1px solid var(--ui-border,rgba(127,127,127,.24));
}
#pictExt-collection .pxcol-head{ display:flex; align-items:baseline; gap:8px; margin-bottom:8px; }
#pictExt-collection .pxcol-name{
  min-width:0; font-size:15px; font-weight:700; color:var(--ui-text,#111827);
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}
#pictExt-collection .pxcol-idx{ flex:none; font-size:12px; color:var(--ui-text-dimmed,#9ca3af); }
#pictExt-collection .pxcol-sort,
#pictExt-profcol .pxcol-sort{ display:flex; flex-wrap:wrap; gap:2px; margin-bottom:0; }
#pictExt-collection .pxcol-sort button,
#pictExt-profcol .pxcol-sort button{
  appearance:none; border:0; background:transparent; cursor:pointer;
  padding:3px 6px; border-radius:6px; font-family:inherit; font-size:12px;
  color:var(--ui-text-muted,#6b7280);
}
#pictExt-collection .pxcol-sort button[data-active="true"],
#pictExt-profcol .pxcol-sort button[data-active="true"]{ color:var(--ui-primary,#3b82f6); font-weight:600; }
#pictExt-profcol .pxc-note{ font-size:12px; color:var(--ui-text-dimmed,#9ca3af); }
#pictExt-collection .pxcol-item{
  display:block; min-width:0; padding:4px 6px; border-radius:6px; font-size:13px;
  color:var(--ui-text,#111827); text-decoration:none; line-height:1.45;
}
#pictExt-collection .pxcol-item:hover{ background:color-mix(in srgb, var(--ui-primary,#3b82f6) 8%, transparent); }
#pictExt-collection .pxcol-item[data-current="true"]{ color:var(--ui-primary,#3b82f6); font-weight:600; }
#pictExt-collection .pxcol-title{ display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
#pictExt-collection .pxcol-meta{
  display:flex; flex-wrap:wrap; gap:8px; margin-top:2px;
  font-size:11px; color:var(--ui-text-dimmed,#9ca3af);
}
#pictExt-collection .pxcol-excerpt{
  margin-top:2px; font-size:11px; color:var(--ui-text-muted,#6b7280);
  display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;
}
#pictExt-collection .pxcol-toggle{
  appearance:none; border:0; background:transparent; cursor:pointer; padding:4px 0 0;
  font-family:inherit; font-size:12px; color:var(--ui-text-muted,#6b7280);
}
#pictExt-collection .pxcol-toggle:hover{ color:var(--ui-primary,#3b82f6); }
`;

  function injectStyle() {
    if (document.getElementById('pictExt-style')) return;
    const el = document.createElement('style');
    el.id = 'pictExt-style';
    el.textContent = CSS;
    (document.head || document.documentElement).appendChild(el);
  }

  /* ============================================================
   * 5. 排序定义（v1.5：固定 8 项，全部板块页 / 首页 / 搜索页通用）
   * ------------------------------------------------------------
   * mode:
   *   server —— 服务端排序（/topics?sort=latest|hot）
   *   feed   —— 关注流 / 推荐流（/topic-recommendations）
   *   pool   —— 服务端没有这个排序，客户端在候选池里排
   * 站点 /topics 只接受 relevance|latest|hot，浏览量 / 点赞 / 回复 / 收藏
   * 都没有服务端排序，所以这 4 项只能在候选池里排。
   * ============================================================ */
  const SORTS = [
    { key: 'following', label: '关注', mode: 'feed', feedScope: 'following', needAuth: true, note: '只看你关注的训练师发的帖子（需登录）' },
    { key: 'recommended', label: '站内推荐', mode: 'feed', feedScope: 'all', note: '站内公开推荐流' },
    {
      key: 'default',
      label: '默认排序',
      mode: 'server',
      serverSort: null,
      categoryOnly: true,
      note: '站内不加插件时的原始顺序（板块页默认顺序）',
    },
    { key: 'search', label: '站内搜索', mode: 'server', serverSort: 'relevance', searchOnly: true, note: '站内搜索自己的相关度排序（就是原生结果）' },
    { key: 'latest', label: '最新', mode: 'server', serverSort: 'latest', note: '按发布时间倒序' },
    // /topics 只接受 relevance|latest|hot，没有「最早」，只能在候选池里按 createdAt 正序
    { key: 'earliest', label: '最早', mode: 'pool', metric: 'createdAt', asc: true, note: '在候选池里按发布时间正序（接口没有服务端最早）' },
    { key: 'views', label: '最多浏览', mode: 'pool', metric: 'viewCount', note: '按浏览量排序' },
    { key: 'likes', label: '最多点赞', mode: 'pool', metric: 'likeCount', note: '按点赞数排序' },
    { key: 'replies', label: '最多回复', mode: 'pool', metric: 'replyCount', note: '按回复数排序' },
    { key: 'bookmarks', label: '最多收藏', mode: 'pool', metric: 'bookmarkCount', note: '按收藏数排序' },
    { key: 'hot', label: '最热', mode: 'server', serverSort: 'hot', note: '站内热度排名（服务端 all-time 热度分）' },
  ];
  const SORT_MAP = new Map(SORTS.map((s) => [s.key, s]));

  /**
   * 某一类页面该给哪 8 项：
   * - 搜索页：去掉「推荐流」，换成「站内搜索」（sort=relevance，跟着关键词走）
   * - 首页 / 板块页：没有关键词，给不了相关度排序，所以不显示「站内搜索」
   */
  function sortsFor(kind) {
    return SORTS.filter((s) => {
      if (s.searchOnly) return kind === 'search';       // 「站内搜索」只在搜索页
      if (s.key === 'recommended') return kind !== 'search'; // 搜索页不放推荐流
      if (s.categoryOnly) return kind === 'category';   // 「默认排序」只在板块页
      return true;
    });
  }

  /** 记住上次选的排序：换关键词 / 换板块重建面板后仍然沿用 */
  const lastSortKey = { home: 'default', search: 'default', category: 'default' };

  /* ============================================================
   * 6. 卡片渲染 —— 结构/类名对齐站点 ForumContentCard
   * ============================================================ */

  /** 万一页面上抓不到原生卡片，用这份兜底（与站点默认卡片一致） */
  const DEFAULT_CARD_SHELL =
    'group relative isolate grid min-w-0 grid-cols-1 gap-2.5 px-3.5 py-3.5 text-inherit no-underline wrap-anywhere ' +
    'desktop:px-5 desktop:py-4 min-h-33 desktop:min-h-42 rounded-lg overflow-hidden ' +
    'bg-(--ui-card-translucent) transition-colors hover:bg-(--ui-card-interactive)';

  const CARD_LINK =
    'block after:absolute after:inset-0 after:z-10 after:rounded-lg focus-visible:outline-none ' +
    'focus-visible:after:outline-2 focus-visible:after:outline-primary';

  /**
   * 板块页的帖子列表节点。
   * 站点是 section[aria-label="板块帖子"]；早期误用 div 导致板块页不注入，所以这里
   * 不写死标签名，并留了两个兜底（改版换结构时不至于又整页失效）。
   */
  const CATEGORY_LIST_SEL =
    '[aria-label="板块帖子"], section[aria-label$="板块"] > .space-y-3, section[aria-label$="板块"] > section';

  const NATIVE_CARD_SEL = {
    home: 'section[aria-label="推荐帖子"] > article, section[aria-label="最新帖子"] > article, section[aria-label="关注帖子"] > article',
    search: 'div[aria-label="帖子搜索结果"] > article',
    category: '[aria-label="板块帖子"] > article',
  };

  /**
   * 直接借用当前页面原生卡片的 class 串作为卡壳。
   * 这样首页的 spacious（min-h-46）与搜索页的紧凑版（min-h-42 / max-desktop:p-4）
   * 会自动跟站点一致，不会差那几个像素。
   */
  function nativeCardShell(kind) {
    const el = document.querySelector(NATIVE_CARD_SEL[kind] || NATIVE_CARD_SEL.home);
    const cn = el && typeof el.className === 'string' ? el.className.trim() : '';
    return cn && cn.includes('grid') ? cn : DEFAULT_CARD_SHELL;
  }

  function avatarHTML(author) {
    const name = author?.username || '匿名';
    const src = author?.avatar?.url || '';
    if (src) {
      return `<img src="${esc(src)}" alt="" loading="lazy" class="size-5 shrink-0 rounded-full object-cover">`;
    }
    return `<span class="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">${esc(
      name.slice(0, 1)
    )}</span>`;
  }

  /** 三项时间：发布时间（最老那一版）/ 最近更新 / 最近回复 */
  function timesHTML(t) {
    const created = t.createdAt;
    const edited = t.editedAt;
    const replied = t.lastActivityAt;
    const item = (label, stamp) => {
      if (!stamp) return '';
      const abs = new Date(stamp).toLocaleString('zh-CN', { hour12: false });
      return `<time class="z-20 min-w-0 whitespace-nowrap text-dimmed" datetime="${esc(stamp)}" title="${label}：${esc(
        abs
      )}"><span class="text-dimmed">${label}</span> ${esc(timeAgo(stamp))}</time>`;
    };
    const parts = [
      item('发布', created),
      edited && edited !== created ? item('更新', edited) : '',
      replied && replied !== created ? item('回复', replied) : '',
    ].filter(Boolean);
    if (!parts.length) return '';
    return `<div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-4.5 font-medium">${parts.join(
      '<span class="text-dimmed opacity-50">·</span>'
    )}</div>`;
  }

  function cardHTML(t, timeKey, shell, kind) {
    const author = t.author || {};
    const name = author.username || '匿名';
    const href = t.matchPostNumber ? `/forum/post/${esc(t.id)}#post-${esc(t.matchPostNumber)}` : `/forum/post/${esc(t.id)}`;
    const stamp = t[timeKey] || t.lastActivityAt || t.createdAt;
    const abs = stamp ? new Date(stamp).toLocaleString('zh-CN', { hour12: false }) : '';

    const tags = settings.showTags ? (t.tags || []).slice(0, 4) : [];
    const tagsHTML = tags.length
      ? `<div class="mt-1 flex flex-wrap gap-x-5 gap-y-1">${tags
          .map(
            (tag) =>
              `<a href="/forum/category/${esc(tag.slug)}" class="relative z-20 inline-flex h-5 items-center text-xs font-semibold text-primary hover:underline">#${esc(
                tag.name
              )}</a>`
          )
          .join('')}</div>`
      : '';

    // 搜索结果里要分清「帖子」和「评论」：命中评论时站点给的是 match.postNumber
    // 第 1 楼就是帖子正文本身，别标成「评论」
    const isCommentHit =
      t.matchPostNumber !== null && t.matchPostNumber !== undefined && Number(t.matchPostNumber) > 1;
    const kindBadge =
      kind === 'search'
        ? `<span class="px-kind" data-kind="${isCommentHit ? 'comment' : 'topic'}">${
            isCommentHit ? `评论 · 第 ${t.matchPostNumber} 楼` : '帖子'
          }</span>`
        : '';

    // 原生卡片只给「回复 / 浏览」，这里把能拿到的都补上
    const stats = [
      { icon: 'chat', label: '回复', value: fmtNum(t.replyCount) },
      { icon: 'eye', label: '浏览', value: fmtNum(t.viewCount) },
    ];
    if (settings.showLikes && typeof t.likeCount === 'number') stats.push({ icon: 'heart', label: '赞', value: fmtNum(t.likeCount) });
    if (settings.showBookmarks && typeof t.bookmarkCount === 'number')
      stats.push({ icon: 'bookmark', label: '收藏', value: fmtNum(t.bookmarkCount) });

    return `<article class="${shell || DEFAULT_CARD_SHELL}">
      <div class="min-w-0">
        <div class="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <div class="flex min-w-0 flex-1 items-start gap-2">
            ${settings.showPinned && t.pinned ? `<span class="mt-0.75 shrink-0 text-primary" title="置顶帖子">${icon('pin')}</span>` : ''}
            ${kindBadge}
            <h2 title="${esc(t.title)}" class="min-w-0 text-base leading-[1.4] font-extrabold text-default desktop:text-[17px]">
              <a href="${href}" class="${CARD_LINK}"><span class="line-clamp-2">${esc(t.title)}</span></a>
            </h2>
          </div>
        </div>
        ${tagsHTML}
        ${t.excerpt ? `<p class="mt-0.5 line-clamp-2 text-[13px] leading-[1.55] text-muted desktop:text-sm">${esc(t.excerpt)}</p>` : ''}
      </div>
      <div class="mt-auto flex w-full min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs leading-4.5 text-dimmed">
        <div class="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 font-medium">
          <a href="/profile/${esc(author.id || '')}" class="relative z-20 flex min-w-0 items-center gap-1.5">
            ${avatarHTML(author)}
            <span title="${esc(name)}" class="min-w-0 truncate font-semibold text-muted">${esc(name)}</span>
          </a>
          ${
            settings.showTimes
              ? ''
              : `<time class="z-20 min-w-0 font-medium text-dimmed" ${stamp ? `datetime="${esc(stamp)}"` : ''} title="${esc(
                  abs
                )}">${esc(timeAgo(stamp))}</time>`
          }
        </div>
        <ul aria-label="帖子数据" class="ml-auto flex shrink-0 items-center gap-3.5 font-normal">
          ${stats
            .map(
              (s) =>
                `<li class="inline-flex items-center gap-1" title="${s.label}：${s.value}">${icon(s.icon)}<span class="sr-only">${
                  s.label
                }</span>${s.value}</li>`
            )
            .join('')}
        </ul>
      </div>
      ${settings.showTimes ? timesHTML(t) : ''}
    </article>`;
  }

  /* ============================================================
   * 7. 列表视图
   * ============================================================ */
  class FeedView {
    /**
     * @param {HTMLElement} panel
     * @param {'home'|'search'} kind
     * @param {{q?:string, tag?:string, boards?:string[]}} ctx
     * @param {() => HTMLElement[]} getNativeNodes 取当前需要隐藏的原生节点
     */
    constructor(panel, kind, ctx, getNativeNodes, tabsEl) {
      this.panel = panel;
      this.kind = kind;
      this.ctx = ctx;
      this.getNativeNodes = getNativeNodes;
      this.listEl = panel.querySelector('.px-list');
      this.noteEl = panel.querySelector('.px-note');
      this.footEl = panel.querySelector('.px-foot');
      this.tabEls = [...(tabsEl || panel).querySelectorAll('.px-tab')];

      this.activeKey = 'default';
      this.timeKey = 'lastActivityAt';
      this.token = 0;
      this.serverCursor = null;
      this.serverHasMore = false;
      this.serverItems = [];
      this.pool = null;
      this.poolItems = [];
      this.poolVisible = 0;
      this.poolTotal = 0;
      this.feedState = null;
      this.loading = false;
      this.errorText = '';

      this.tabEls.forEach((btn) => {
        btn.addEventListener('click', () => this.select(btn.dataset.sort));
      });

      this.footEl.addEventListener('click', (e) => {
        if (e.target.closest('.px-more')) this.loadMore();
      });
      this.listEl.addEventListener('click', (e) => {
        if (e.target.closest('[data-px-retry]')) {
          e.preventDefault();
          this.loadMore(true);
        }
      });
    }

    get sort() {
      return SORT_MAP.get(this.activeKey) || SORT_MAP.get('latest');
    }

    syncTabs() {
      this.tabEls.forEach((b) => {
        const on = b.dataset.sort === this.activeKey;
        b.dataset.active = on ? 'true' : 'false';
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
    }

    select(key) {
      if (!SORT_MAP.has(key)) return;
      this.activeKey = key;
      lastSortKey[this.kind] = key;
      // 「最新」「最早」卡片显示的本来就是发布时间；其余排序显示最近活跃时间
      this.timeKey = key === 'latest' || key === 'earliest' ? 'createdAt' : 'lastActivityAt';
      this.syncTabs();
      this.hideNative();
      this.reset();
      this.loadMore();
    }

    reset() {
      this.token++;
      this.serverCursor = null;
      this.serverHasMore = false;
      this.serverItems = [];
      this.pool = null;
      this.poolItems = [];
      this.poolVisible = 0;
      this.poolTotal = 0;
      this.feedState = null;
      this.loading = false;
      this.errorText = '';
      this.listEl.innerHTML = '';
      this.footEl.innerHTML = '';
      this.noteEl.hidden = true;
    }

    async loadMore(force) {
      if (this.loading && !force) return;
      const token = ++this.token;
      this.loading = true;
      if (!this.listEl.children.length || this.errorText) {
        this.listEl.innerHTML = `<div class="px-state">正在加载…</div>`;
      } else {
        this.footEl.innerHTML = `<button class="px-more" disabled>加载中…</button>`;
      }
      this.errorText = '';

      try {
        const mode = this.sort.mode;
        if (mode === 'server') await this.loadServerPage(token);
        else if (mode === 'feed') await this.loadFeedPage(token);
        else await this.loadPool(token);
      } catch (err) {
        if (token !== this.token) return;
        log('load error', err);
        this.errorText = errorTextOf(err, this.sort);
        this.listEl.innerHTML = `<div class="px-state">${esc(this.errorText)}<br><button data-px-retry>重试</button></div>`;
        this.footEl.innerHTML = '';
        this.setNote('');
      } finally {
        if (token === this.token) this.loading = false;
      }
    }

    async loadServerPage(token) {
      // 相关度排序只在有关键词时成立；纯标签浏览时站点会直接 400
      if (this.sort.serverSort === 'relevance' && !this.ctx.q) {
        this.listEl.innerHTML = `<div class="px-state">这一页没有搜索关键词，用不了「站内搜索」相关度<br>换「最新 / 最多回复 / 最热」试试</div>`;
        this.setNote('站内搜索需要关键词');
        this.footEl.innerHTML = '';
        return;
      }
      const page = await fetchTopicPage(this.ctx, this.sort.serverSort, this.serverCursor);
      if (token !== this.token) return;
      const seen = new Set(this.serverItems.map((i) => i.id));
      this.serverItems.push(...page.items.filter((i) => !seen.has(i.id)));
      this.serverCursor = page.next;
      this.serverHasMore = !!page.next;

      this.renderCards(this.serverItems);
      this.setNote(`${this.sort.note} · 已加载 ${this.serverItems.length} 条`);
      this.renderFoot(this.serverHasMore, '加载更多');
    }

    /** 关注 / 推荐流：翻 pages 页，板块页再按标签过滤 */
    /**
     * 关注 / 推荐流：一次拉一页（推荐流单页上限 30），底部给「继续加载」。
     * 站点的推荐游标绑定本次浏览，下一批可能直接回 RECOMMENDATION_CURSOR_INVALID，
     * 这种情况保留已显示的条目，只把提示写清楚，不把列表清空。
     */
    async loadFeedPage(token) {
      const scope = this.sort.feedScope;
      const tag = this.ctx.tag || '';
      const ck = ['feed', scope, this.kind, tag].join('|');
      if (!this.feedState || this.feedState.key !== ck) {
        this.feedState = { key: ck, items: [], scanned: 0, cursor: null, done: false, started: false };
      }
      const st = this.feedState;
      const isMore = st.started;
      st.started = true;

      let page;
      try {
        page = await fetchFeedPage(scope, st.cursor);
      } catch (err) {
        if (!isMore) throw err; // 第一页就失败 → 交给上层显示错误
        if (token !== this.token) return;
        const expired = err && err.code === 'RECOMMENDATION_CURSOR_INVALID';
        this.renderCards(this.serverItems);
        this.setNote(`${this.sort.note} · 下一批没取到（${expired ? '这一轮推荐已过期' : '接口报错'}），再点一次试试`);
        this.renderFoot(true, '继续加载');
        return;
      }
      if (token !== this.token) return;

      st.scanned += page.items.length;
      const fresh = tag ? page.items.filter((i) => (i.tags || []).some((t) => t.slug === tag)) : page.items;
      const seen = new Set(st.items.map((i) => i.id));
      st.items.push(...fresh.filter((i) => !seen.has(i.id)));
      st.cursor = page.next;
      st.done = !page.next;
      this.serverItems = st.items.slice();

      this.renderCards(this.serverItems);
      const base = `${this.sort.note} · 已显示 ${this.serverItems.length} 条`;
      this.setNote(
        tag
          ? `${base}（关注 / 推荐流是全站流，只保留 #${tag} 板块内的帖子；已扫过 ${st.scanned} 条）`
          : base
      );
      this.renderFoot(!st.done, '继续加载');
    }

    /**
     * 候选池排序（浏览 / 点赞 / 回复 / 收藏）。
     * 默认池子是 9 页（最新 6 + 热帖 3）；池子里的都看完了还会继续往后翻，
     * 所以「9 页」只是起点，不是上限。
     */
    async loadPool(token) {
      if (!this.pool) {
        const st = await createPool(this.ctx);
        if (token !== this.token) return;
        this.pool = st;
        this.poolVisible = 0;
        await this.enrichPool(token);
        if (token !== this.token) return;
        this.derivePool();
      } else if (this.poolVisible >= this.poolItems.length && !this.poolDone()) {
        // 池子见底但两条链还有下一页 → 往后翻一批
        this.footEl.innerHTML = `<button class="px-more" disabled>正在往后翻（已翻 ${this.pool.pages} 页）…</button>`;
        await extendPool(this.ctx, this.pool);
        if (token !== this.token) return;
        await this.enrichPool(token);
        if (token !== this.token) return;
        this.derivePool();
      }

      const asc = !!this.sort.asc;
      this.poolItems.sort((a, b) => {
        if (asc) {
          // 「最早」：按发布时间正序（同一时间再按楼层/更新时间兜底）
          const pa = a.pinned ? 0 : 1;
          const pb = b.pinned ? 0 : 1;
          if (pa !== pb) return pa - pb;
          const d = new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
          if (d !== 0) return d;
          return new Date(a.lastActivityAt || 0) - new Date(b.lastActivityAt || 0);
        }
        const d = (b[this.sort.metric] || 0) - (a[this.sort.metric] || 0);
        if (d !== 0) return d;
        return new Date(b.lastActivityAt || 0) - new Date(a.lastActivityAt || 0);
      });

      this.poolVisible = Math.min(this.poolItems.length, Math.max(20, this.poolVisible + 20));
      if (!this.poolItems.length) {
        // 典型场景：搜索结果接口根本不返回 bookmarkCount，收藏排序无数据可排（不假装排了）
        const metricLabel = { viewCount: '浏览量', likeCount: '点赞数', replyCount: '回复数', bookmarkCount: '收藏数' }[
          this.sort.metric
        ];
        this.listEl.innerHTML = `<div class="px-state">这个页面的接口不返回${esc(
          metricLabel
        )}，这一项排不了<br>换「最新 / 最多点赞 / 最多回复」试试</div>`;
        this.setNote(`${this.sort.note} · 候选池 ${this.poolTotal} 条里没有一条带${esc(metricLabel)}`);
        this.footEl.innerHTML = '';
        return;
      }
      this.renderCards(this.poolItems.slice(0, this.poolVisible));
      const scopeNote = this.ctx.tag ? `仅 #${this.ctx.tag} 板块内` : '全站';
      const pagesNote = `已翻 ${this.pool.pages} 页`;
      this.setNote(
        this.poolItems.length < this.poolTotal
          ? `${this.sort.note} · 候选池 ${this.poolTotal} 条（${scopeNote}，${pagesNote}），其中 ${this.poolItems.length} 条带这项数据、参与排序`
          : `${this.sort.note} · 候选池 ${this.pool.items.length} 条（${scopeNote}，${pagesNote}）`
      );
      if (this.poolVisible < this.poolItems.length) this.renderFoot(true, '再多看几条');
      else if (!this.poolDone()) this.renderFoot(true, `继续往后翻（已翻 ${this.pool.pages} 页）`);
      else this.renderFoot(false);
    }

    /** 两条链都到底了才算真的没得翻了 */
    poolDone() {
      return !!(this.pool && this.pool.doneLatest && this.pool.doneHot);
    }

    /** 搜索接口不返回点赞数，排「最多点赞」前先把有数的那批补上 */
    async enrichPool(token) {
      if (this.sort.metric !== 'likeCount') return;
      const need = this.pool.items.filter((i) => i.likeCount === null || i.likeCount === undefined);
      if (!need.length) return;
      this.setNote(`正在补齐点赞数…（候选池里 ${Math.min(need.length, ENRICH_MAX)} 条）`);
      await enrichLikes(this.pool.items, ENRICH_MAX);
      if (token !== this.token) return;
    }

    /** 按当前指标挑出能参与排序的条目（没这项数据的排除，绝不拿 0 充数） */
    derivePool() {
      const metric = this.sort.metric;
      this.poolTotal = this.pool.items.length;
      this.poolItems = this.pool.items.filter((i) => i[metric] !== null && i[metric] !== undefined);
    }

    setNote(text) {
      this.noteEl.hidden = !text;
      this.noteEl.textContent = text || '';
    }

    renderFoot(hasMore, label) {
      this.footEl.innerHTML = hasMore
        ? `<button class="px-more">${esc(label)}</button>`
        : this.listEl.querySelector('article')
          ? `<span class="px-note" style="margin:0;padding:0">已经到底了</span>`
          : '';
    }

    renderCards(items) {
      if (!items.length) {
        this.listEl.innerHTML = `<div class="px-state">没有找到帖子</div>`;
        return;
      }
      const shell = nativeCardShell(this.kind);
      this.listEl.innerHTML = items.map((t) => cardHTML(t, this.timeKey, shell, this.kind)).join('');
    }

    hideNative() {
      const nodes = typeof this.getNativeNodes === 'function' ? this.getNativeNodes() : [];
      nativeHider.hide(nodes);
    }
  }

  /* ============================================================
   * 8. 原生列表隐藏器
   * ============================================================ */
  const nativeHider = {
    hidden: new Map(),
    hide(nodes) {
      nodes.forEach((el) => {
        if (!el || el.id === PANEL_ID || el.contains(document.getElementById(PANEL_ID))) return;
        if (!this.hidden.has(el)) this.hidden.set(el, el.style.display);
        if (el.style.display !== 'none') el.style.display = 'none';
      });
    },
    show() {
      this.hidden.forEach((prev, el) => {
        if (el.isConnected) el.style.display = prev;
      });
      this.hidden.clear();
    },
    prune() {
      for (const el of [...this.hidden.keys()]) if (!el.isConnected) this.hidden.delete(el);
    },
  };

  /* ============================================================
   * 9. 页面适配器（列表页）
   * ============================================================ */
  const homeAdapter = {
    kind: 'home',
    match: () => location.pathname === '/' || location.pathname === '/index',
    ctx: () => ({}),
    mountPoint() {
      const tabsRoot = document.querySelector('[aria-label="首页排序"]');
      if (!tabsRoot) return null;
      const feedSection = document.querySelector(
        'section[aria-label="推荐帖子"], section[aria-label="最新帖子"], section[aria-label="关注帖子"]'
      );
      if (!feedSection) return null;
      return { anchor: feedSection, tabsRoot };
    },
    nativeTabLabels(tabsRoot) {
      return [...(tabsRoot?.querySelectorAll('[role="tab"]') || [])].map((t) => t.textContent.trim());
    },
    nativeNodes(anchor) {
      const parent = anchor.parentElement;
      if (!parent) return [anchor];
      // 「全部替换」= 站内那排「关注 / 推荐 / 最新」换掉，列表换掉；
      // 但那行里的「板块」入口之类不属于排序，保留
      const nodes = [];
      for (const child of parent.children) {
        if (child.id === PANEL_ID) continue;
        const tabs = child.querySelector ? child.querySelector('[aria-label="首页排序"]') : null;
        if (tabs && !child.contains(anchor)) {
          nodes.push(tabs);
          continue;
        }
        nodes.push(child);
      }
      return nodes;
    },
  };

  /** 板块页（点标签进来就是这个）：/forum/category/:slug */
  const categoryAdapter = {
    kind: 'category',
    match: () => /^\/forum\/category\/[^/]+/.test(location.pathname),
    ctx() {
      const m = location.pathname.match(/^\/forum\/category\/([^/?#]+)/u);
      return { q: '', tag: m ? decodeURIComponent(m[1]) : '', boards: [] };
    },
    mountPoint() {
      // 站点真实节点：section[aria-label="{板块名}板块"] > section[aria-label="板块帖子"]
      // （v1.6.0 及以前误写成 div[...]，导致板块页一直不注入排序栏）
      const grid = document.querySelector(CATEGORY_LIST_SEL);
      if (!grid) return null;
      return { anchor: grid, tabsRoot: null };
    },
    nativeTabLabels: () => [],
    nativeNodes(anchor) {
      const nodes = [anchor];
      const parent = anchor.parentElement;
      if (parent) {
        // 列表后面那个「加载更多」/ 分页也一起藏掉
        let sib = anchor.nextElementSibling;
        while (sib) {
          if (sib.tagName === 'DIV' || sib.tagName === 'NAV') nodes.push(sib);
          sib = sib.nextElementSibling;
        }
      }
      return nodes;
    },
  };

  const searchAdapter = {
    kind: 'search',
    match: () => location.pathname.startsWith('/search'),
    ctx() {
      const sp = new URLSearchParams(location.search);
      return {
        q: (sp.get('q') || '').trim(),
        tag: sp.get('tag') || '',
        boards: sp.getAll('board').filter(Boolean),
      };
    },
    mountPoint() {
      const grid = document.querySelector('div[aria-label="帖子搜索结果"]');
      if (!grid) return null;
      return { anchor: grid, tabsRoot: null };
    },
    nativeTabLabels: () => [],
    nativeNodes(anchor) {
      const nodes = [anchor];
      const parent = anchor.parentElement;
      const nav = parent && parent.querySelector('nav[aria-label="帖子搜索分页"]');
      if (nav) nodes.push(nav);
      return nodes;
    },
  };

  const adapters = [homeAdapter, searchAdapter, categoryAdapter];
  const currentAdapter = () => adapters.find((a) => a.match()) || null;

  /* ============================================================
   * 10. 帖子详情页：折叠楼中楼 + 补全信息
   * ============================================================ */
  const COMMENT_SECTION = 'section#comments';
  const THREAD_SEL = 'article[aria-label$="的评论"]';
  /** null = 跟随默认策略；'all' = 全部折叠；'none' = 全部展开 */
  let detailGlobal = null;
  const topicInfoCache = new Map();

  /** 详情请求去重：帖子信息条 / 合集区块会同时要这份数据，只发一次 */
  const detailReq = new Map();
  function getTopicDetail(id) {
    if (topicInfoCache.has(id)) return Promise.resolve(topicInfoCache.get(id));
    const running = detailReq.get(id);
    if (running) return running;
    const p = apiGet('/topics/' + encodeURIComponent(id))
      .then((d) => {
        topicInfoCache.set(id, d);
        detailReq.delete(id);
        return d;
      })
      .catch((err) => {
        detailReq.delete(id);
        throw err;
      });
    detailReq.set(id, p);
    return p;
  }

  function detailTopicId() {
    const m = location.pathname.match(/^\/forum\/post\/([^/?#]+)/u);
    return m ? m[1] : '';
  }

  /** 折叠开关按钮，样式对齐站点回复行上的小按钮 */
  function makeThreadToggle() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.px = '1';
    btn.dataset.pxThreadToggle = '1';
    btn.className =
      'inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted hover:text-primary ' +
      'focus-visible:outline-2 focus-visible:outline-primary transition-colors';
    return btn;
  }

  /* 每楼的手动状态：key -> true(展开) / false(折叠)；没记录就走默认策略 */
  const threadState = new Map();

  /** 数一数这楼到底有多少条回复：站点的容器里可能还套了一层 wrapper，不能只数直接子节点 */
  function countReplies(box) {
    let n = box.querySelectorAll('[data-post-id]').length;
    if (!n) n = box.querySelectorAll('[id^="post-"]').length;
    if (!n) {
      n = [...box.children].filter((el) => el.tagName === 'DIV' || el.tagName === 'ARTICLE').length;
    }
    // 再兜一层：容器里只有一个 wrapper 时，按 wrapper 的子元素算
    if (n <= 1) {
      const grand = [...box.querySelectorAll(':scope > *')].reduce((a, el) => a + el.children.length, 0);
      if (grand > n) n = grand;
    }
    return n;
  }

  function applyThreadState(article, box, btn, count, key) {
    let expanded;
    if (threadState.has(key)) expanded = threadState.get(key);
    else if (detailGlobal === 'all') expanded = false;
    else if (detailGlobal === 'none') expanded = true;
    else expanded = count < (Number(settings.collapseMin) || 2); // 默认策略：回复很少就不折

    box.style.display = expanded ? '' : 'none';
    const tPager = article.querySelector('[data-px-thread-pager]');
    if (tPager) tPager.style.display = expanded ? '' : 'none';
    if (!btn) return;
    btn.dataset.expanded = expanded ? '1' : '0';
    btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    btn.innerHTML = `${icon('chat', 13)}<span>${expanded ? `收起 ${count} 条回复` : `展开 ${count} 条回复`}</span>`;
    btn.title = expanded ? '折叠这一楼的回复' : '展开这一楼的全部回复';
  }

  function setupThread(article) {
    const box = article.querySelector('.post-comment-replies');
    let btn = article.querySelector('[data-px-thread-toggle]');
    if (!box) {
      if (btn) btn.remove();
      return;
    }
    // 功能总开关关掉：全部展开，也不放按钮
    if (!settings.collapse) {
      if (btn) btn.remove();
      box.style.display = '';
      applyThreadPaging(article);
      return;
    }
    const count = countReplies(box);
    const min = Number(settings.collapseMin) || 2;

    // 只有 1 条回复的楼不折腾：既不放按钮，也不折叠（除非用户点了「折叠全部」）
    if (count < min) {
      if (btn) btn.remove();
      applyThreadState(article, box, null, count, threadKeyOf(article));
      applyThreadPaging(article);
      return;
    }

    const key = threadKeyOf(article);
    if (!btn) {
      btn = makeThreadToggle();
      btn.style.marginLeft = '46px';
      btn.style.marginTop = '4px';
      // 挂在回复块之后（而不是插在楼与回复之间），尽量不扰动 Vue 对这两个子节点的 diff
      box.insertAdjacentElement('afterend', btn);
    } else if (btn.previousElementSibling !== box) {
      box.insertAdjacentElement('afterend', btn);
    }
    btn.dataset.key = key;
    btn.dataset.count = String(count);
    applyThreadState(article, box, btn, count, key);
    applyThreadPaging(article);
  }

  /* ------------------------------------------------------------
   * 楼中楼分页：一层楼里的回复 ≥10 条才给页码（不足 10 条不显示）
   * ------------------------------------------------------------ */
  const THREAD_PAGE_SIZE = 10;
  const THREAD_PAGE_MIN = 10;
  const threadPage = new Map();

  /** 这层楼里真正的「一条回复」（排除嵌套在别的回复里的） */
  function threadReplyNodes(box) {
    if (!box) return [];
    let nodes = [...box.querySelectorAll('[data-post-id]')].filter((el) => el.closest('[data-post-id]') === el);
    if (!nodes.length) nodes = [...box.querySelectorAll('[id^="post-"]')];
    return nodes;
  }

  function applyThreadPaging(article) {
    const box = article.querySelector('.post-comment-replies');
    let pager = article.querySelector('[data-px-thread-pager]');
    if (!box) {
      if (pager) pager.remove();
      return;
    }
    const nodes = threadReplyNodes(box);
    if (!settings.commentPaging || nodes.length < THREAD_PAGE_MIN) {
      if (pager) pager.remove();
      nodes.forEach((el) => {
        if (el.dataset.pxTpage) {
          el.style.display = '';
          delete el.dataset.pxTpage;
        }
      });
      return;
    }

    const key = threadKeyOf(article);
    const total = Math.max(1, Math.ceil(nodes.length / THREAD_PAGE_SIZE));
    let cur = threadPage.get(key) || 1;
    cur = Math.min(total, Math.max(1, cur));
    threadPage.set(key, cur);
    const start = (cur - 1) * THREAD_PAGE_SIZE;
    const end = start + THREAD_PAGE_SIZE;
    nodes.forEach((el, i) => {
      const show = i >= start && i < end;
      if (show) {
        if (el.dataset.pxTpage) {
          el.style.display = '';
          delete el.dataset.pxTpage;
        }
      } else if (!el.dataset.pxTpage) {
        el.style.display = 'none';
        el.dataset.pxTpage = '1';
      }
    });

    if (!pager) {
      pager = document.createElement('div');
      pager.dataset.px = '1';
      pager.dataset.pxThreadPager = '1';
      pager.className = 'pxc-tpager';
      box.insertAdjacentElement('afterend', pager);
    } else if (pager.previousElementSibling !== box) {
      box.insertAdjacentElement('afterend', pager);
    }
    const html =
      `<span class="pxc-tpager-sum">${cur}/${total} 页 · 共 ${nodes.length} 条</span>` +
      `<button type="button" data-px-tpage="prev"${cur <= 1 ? ' disabled' : ''}>上一页</button>` +
      `<button type="button" data-px-tpage="next"${cur >= total ? ' disabled' : ''}>下一页</button>`;
    if (pager.dataset.html !== html) {
      pager.innerHTML = html;
      pager.dataset.html = html;
    }
    pager.style.display = box.style.display === 'none' ? 'none' : '';
  }

  /* ------------------------------------------------------------
   * 长评论折叠：超过 300 字 → 只留前 200 字 + 「展开全文」
   * ------------------------------------------------------------ */
  const TRUNC_LIMIT = 300;
  const TRUNC_KEEP = 200;
  const truncState = new WeakMap();

  /** 找一条评论的正文容器：优先所有 <p> 的共同父节点，兜底取文本最多的 div */
  function bodyBlockOf(row) {
    const ps = [...row.querySelectorAll('p')];
    if (ps.length) {
      let el = ps[0].parentElement;
      while (el && el !== row && !ps.every((p) => el.contains(p))) el = el.parentElement;
      return el && el !== row ? el : ps[0].parentElement;
    }
    let best = null;
    let len = 0;
    row.querySelectorAll('div').forEach((d) => {
      const t = (d.textContent || '').trim().length;
      if (t > len) {
        len = t;
        best = d;
      }
    });
    return best;
  }

  function applyCommentTruncate(row) {
    if (!row || row.dataset.pxExpanded === '1') return;
    // 已经截断过（按钮还在）就别重复做；Vue 把正文整块重置后按钮会消失，这里会自动补回来
    if (row.querySelector('[data-px-expand]')) return;
    if ((row.textContent || '').trim().length <= TRUNC_LIMIT) return;

    const el = bodyBlockOf(row);
    if (!el) return;
    const total = (el.textContent || '').trim().length;
    if (total <= TRUNC_LIMIT) return;

    // 按文本节点累进到 TRUNC_KEEP，只在最后一个节点上截（保留原有行内格式）
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    const saved = [];
    let left = TRUNC_KEEP;
    let cutNode = null;
    let n;
    while ((n = walker.nextNode())) {
      const v = n.nodeValue || '';
      if (!v.trim()) continue;
      if (v.length <= left) {
        left -= v.length;
        continue;
      }
      saved.push([n, v]);
      n.nodeValue = v.slice(0, left).replace(/\s+$/, '') + '…';
      cutNode = n;
      break;
    }
    if (!cutNode) return;

    // 截断点之后的块级兄弟整个藏掉：不留空项目符号，也不留大段空白
    let cur = cutNode.parentElement;
    while (cur && cur !== el) {
      let sib = cur.nextElementSibling;
      while (sib) {
        if (sib.dataset.pxTruncHidden !== '1') {
          sib.dataset.pxTruncHidden = '1';
          sib.style.display = 'none';
        }
        sib = sib.nextElementSibling;
      }
      cur = cur.parentElement;
    }
    // 同一段里截断点之后的节点也收掉
    let sibNode = cutNode.nextSibling;
    while (sibNode) {
      const next = sibNode.nextSibling;
      if (sibNode.nodeType === 1) {
        sibNode.dataset.pxTruncHidden = '1';
        sibNode.style.display = 'none';
      } else if (sibNode.nodeType === 3 && sibNode.nodeValue.trim()) {
        saved.push([sibNode, sibNode.nodeValue]);
        sibNode.nodeValue = '';
      }
      sibNode = next;
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.px = '1';
    btn.dataset.pxExpand = '1';
    btn.textContent = '展开全文';
    btn.title = `共 ${total} 字`;
    btn._pxSaved = saved;
    btn._pxHost = row;
    // 紧跟在省略号后面，不另起一行
    cutNode.parentNode.insertBefore(btn, cutNode.nextSibling);
  }

  function expandComment(btn) {
    const host = btn._pxHost;
    if (!host) {
      btn.remove();
      return;
    }
    (btn._pxSaved || []).forEach(([node, v]) => {
      node.nodeValue = v;
    });
    host.querySelectorAll('[data-px-trunc-hidden]').forEach((el) => {
      el.style.display = '';
      delete el.dataset.pxTruncHidden;
    });
    host.dataset.pxExpanded = '1';
    btn.remove();
  }

  /** 楼的稳定标识：优先用首楼的 postId，退化用楼层号/位置 */
  function threadKeyOf(article) {
    const row = article.querySelector('[data-post-id]');
    if (row && row.getAttribute('data-post-id')) return row.getAttribute('data-post-id');
    const anchored = article.querySelector('[id^="post-"]');
    if (anchored) return anchored.id;
    const n = [...document.querySelectorAll(`${COMMENT_SECTION} ${THREAD_SEL}`)].indexOf(article);
    return 'idx-' + n;
  }

  function refreshThreads(scope) {
    const roots = scope ? [scope] : [...document.querySelectorAll(`${COMMENT_SECTION} ${THREAD_SEL}`)];
    roots.forEach((article) => {
      setupThread(article);
      const floor = article.querySelector('[data-post-id]');
      if (floor) applyCommentTruncate(floor);
      threadReplyNodes(article.querySelector('.post-comment-replies')).forEach(applyCommentTruncate);
    });
    syncGlobalToggle();
  }

  function syncGlobalToggle() {
    const btn = document.querySelector('[data-px-global-toggle]');
    if (!btn) return;
    const collapsed = detailGlobal === 'all';
    btn.textContent = collapsed ? '展开全部回复' : '折叠全部回复';
    btn.setAttribute('aria-pressed', collapsed ? 'true' : 'false');
  }

  function injectGlobalToggle(section) {
    const nativeTabs = section.querySelector('[aria-label="评论排序"]');
    const anchorEl = commentSortBarEl() || nativeTabs;
    const exist = section.querySelector('[data-px-global-toggle]');
    if (!settings.globalToggle) {
      if (exist) exist.remove();
      return;
    }
    if (!anchorEl) return;
    let btn = exist;
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.px = '1';
      btn.dataset.pxGlobalToggle = '1';
      btn.className =
        'text-xs font-medium text-muted hover:text-primary focus-visible:outline-2 focus-visible:outline-primary ' +
        'rounded-lg px-2 py-1 transition-colors';
      anchorEl.insertAdjacentElement('afterend', btn);
    } else if (btn.previousElementSibling !== anchorEl) {
      anchorEl.insertAdjacentElement('afterend', btn);
    }
    syncGlobalToggle();
  }

  /* ============================================================
   * 10.3 评论区排序（改版）
   * ------------------------------------------------------------
   * 站内那个「评论排序」其实是一个下拉组件（Nuxt UI USelect，aria-label="评论排序"），
   * 不是一排 tab —— 所以绝不能靠"点站内按钮"来切排序。这里改成自己算顺序：
   *   - 最热 / 最新 / 最早：直接按 /topics/{id}/posts?sort=hot|latest|earliest 的返回顺序
   *   - 最多点赞 / 最多楼高：拉一份评论索引（postId → likeCount / 楼中楼层数），客户端排
   *   - 关注：拉当前账号的关注列表，只留下关注的人发的楼层
   * 排序方式不是搬 DOM 节点（Vue 一重渲染就会还原），而是给楼层加 CSS `order`，
   * 把列表容器临时设成纵向 flex。Vue 重渲染不会清掉这个行内 order，也不会
   * 触发 MutationObserver 死循环，点赞 / 回复 / 楼中楼折叠等原生交互全部保留。
   * 原版模式下这一整套逻辑一条都不跑，只保留「折叠全部回复」。
   * ============================================================ */
  const COMMENT_SORT_ID = 'pictExt-comment-sort';
  const COMMENT_SORTS = [
    { key: 'hot', label: '最热', server: 'hot' },
    { key: 'following', label: '关注' },
    { key: 'earliest', label: '最早', server: 'earliest' },
    { key: 'latest', label: '最新', server: 'latest' },
    { key: 'likes', label: '最多点赞' },
  ];
  /** 当前评论区排序（native = 原版不动） */
  let commentSortKey = 'native';
  /** topicId|sort -> {at, ids, map} */
  const commentIndexCache = new Map();
  let followingCache = null;
  /** 我们改过布局的容器，退出改版时要还原（Set 而不是 WeakSet：要能遍历） */
  const touchedContainers = new Set();

  function commentSortBarEl() {
    return document.getElementById(COMMENT_SORT_ID);
  }

  /** 评论索引：一次拉多页，返回该排序下顶层的 id 顺序 + postId 明细 */
  async function loadCommentIndex(topicId, sortKey) {
    const ck = `${topicId}|${sortKey}`;
    const hit = commentIndexCache.get(ck);
    if (hit && Date.now() - hit.at < CACHE_TTL) return hit;
    const map = new Map();
    const ids = [];
    let cursor = null;
    for (let i = 0; i < 6; i++) {
      const data = await apiGet('/topics/' + encodeURIComponent(topicId) + '/posts', {
        limit: PAGE_LIMIT,
        sort: sortKey,
        cursor,
      });
      for (const p of data.items || []) {
        if (!p || !p.id) continue;
        const kids = Array.isArray(p.children) ? p.children : [];
        if (!map.has(p.id)) ids.push(p.id);
        map.set(p.id, {
          likeCount: Number(p.likeCount ?? 0),
          depth: kids.reduce((n, c) => n + 1 + (Array.isArray(c.children) ? c.children.length : 0), 0),
          authorId: p.author?.id || '',
          createdAt: p.createdAt || null,
          pinned: !!p.pinned,
          postNumber: Number(p.postNumber ?? 0),
        });
      }
      const next = data.pageInfo && data.pageInfo.nextCursor;
      if (!next) break;
      cursor = next;
    }
    const rec = { at: Date.now(), ids, map };
    commentIndexCache.set(ck, rec);
    return rec;
  }

  /** 当前登录用户关注的人（用于评论「关注」筛选）；失败返回 null */
  async function loadFollowingSet() {
    if (followingCache && Date.now() - followingCache.at < CACHE_TTL) return followingCache.set;
    if (!settings.useSession) return null;
    let meId = '';
    try {
      const me = await apiGet('/session', null, { auth: true });
      meId = me?.user?.id || me?.session?.user?.id || me?.userId || me?.id || '';
    } catch {
      meId = '';
    }
    if (!meId) return null;
    const set = new Set();
    let cursor = null;
    for (let i = 0; i < 4; i++) {
      const data = await apiGet('/users/' + encodeURIComponent(meId) + '/following', { limit: PAGE_LIMIT, cursor });
      for (const it of data.items || []) {
        const id = it?.user?.id || it?.id;
        if (id) set.add(id);
      }
      const next = data.pageInfo && data.pageInfo.nextCursor;
      if (!next) break;
      cursor = next;
    }
    followingCache = { at: Date.now(), set };
    return set;
  }

  function threadPostId(article) {
    const row = article.querySelector('[data-post-id]');
    const id = row && row.getAttribute('data-post-id');
    if (id) return id;
    const anchored = article.querySelector('[id^="post-"]');
    return anchored ? anchored.id.replace(/^post-/, '') : article.id.replace(/^post-/, '');
  }

  /** 楼层列表容器（所有顶层楼层共同的父节点） */
  function commentContainer(section) {
    const arts = [...section.querySelectorAll(THREAD_SEL)];
    if (arts.length < 2) return arts.length === 1 ? arts[0].parentElement : null;
    const parent = arts[0].parentElement;
    if (!parent) return null;
    return arts.every((a) => a.parentElement === parent) ? parent : null;
  }

  /** 清掉我们加过的一切（order / flex / 隐藏） */
  function resetCommentLayout(section) {
    section.querySelectorAll(`${THREAD_SEL}[data-px-hidden]`).forEach((el) => {
      el.style.display = '';
      delete el.dataset.pxHidden;
    });
    section.querySelectorAll('[data-px-order]').forEach((el) => {
      el.style.order = '';
      delete el.dataset.pxOrder;
    });
    section.querySelectorAll(`${THREAD_SEL}[data-px-page]`).forEach((el) => {
      el.style.display = '';
      delete el.dataset.pxPage;
    });
    touchedContainers.forEach((parent) => {
      if (!parent) return;
      if (parent.isConnected) {
        parent.style.display = '';
        parent.style.flexDirection = '';
        delete parent.dataset.pxFlex;
      } else {
        touchedContainers.delete(parent);
      }
    });
  }

  /** 按 id 顺序给楼层打 order（CSS 顺序，不动 DOM 节点） */
  function applyCommentLayout(section, ids) {
    const parent = commentContainer(section);
    if (!parent) return '楼层结构变了，暂时排不了这一种';
    const rank = new Map(ids.map((id, i) => [id, i]));
    const arts = [...section.querySelectorAll(THREAD_SEL)];

    if (parent.style.display !== 'flex') {
      parent.style.display = 'flex';
      parent.style.flexDirection = 'column';
      parent.dataset.pxFlex = '1';
      touchedContainers.add(parent);
    }
    let unknown = 0;
    arts.forEach((a) => {
      const id = threadPostId(a);
      let r;
      if (rank.has(id)) r = rank.get(id);
      else r = 5000 + unknown++;
      a.style.order = String(r);
      a.dataset.pxOrder = '1';
    });
    // 「加载更多回复」之类的块永远排最后
    [...parent.children].forEach((ch) => {
      if (ch.matches && ch.matches(THREAD_SEL)) return;
      ch.style.order = '9000';
      ch.dataset.pxOrder = '1';
    });
    return unknown ? `另有 ${unknown} 条不在已加载的评论里，排在最后` : '';
  }

  /** 算出当前排序下的楼层 id 顺序 */
  async function buildCommentOrder(topicId, key) {
    if (key === 'likes') {
      const { map } = await loadCommentIndex(topicId, 'earliest');
      const entries = [...map.entries()];
      const metric = 'likeCount';
      entries.sort((a, b) => {
        const pa = a[1].pinned ? 1 : 0;
        const pb = b[1].pinned ? 1 : 0;
        if (pa !== pb) return pb - pa;
        const d = (b[1][metric] || 0) - (a[1][metric] || 0);
        if (d !== 0) return d;
        return (a[1].postNumber || 0) - (b[1].postNumber || 0);
      });
      return entries.map(([id]) => id);
    }
    const { ids } = await loadCommentIndex(topicId, key);
    return ids;
  }

  async function applyCommentOrder(section, key) {
    if (!key || key === 'native') return '';
    const arts = [...section.querySelectorAll(THREAD_SEL)];
    if (!arts.length) return '还没有回复';
    const topicId = detailTopicId();
    if (!topicId) return '没认出这是哪个帖子（地址栏不是 /forum/post/…）';

    if (key === 'following') {
      resetCommentLayout(section);
      const set = await loadFollowingSet();
      if (!set) return '关注筛选需要登录，且要能读到你的关注列表';
      const { map } = await loadCommentIndex(topicId, 'earliest');
      let shown = 0;
      for (const a of arts) {
        const info = map.get(threadPostId(a));
        const hit = info && set.has(info.authorId);
        if (hit) shown++;
        else {
          a.style.display = 'none';
          a.dataset.pxHidden = '1';
        }
      }
      return `只显示你关注的 ${shown} 条楼层`;
    }

    // 其余排序：清掉上一次的隐藏状态再排
    section.querySelectorAll(`${THREAD_SEL}[data-px-hidden]`).forEach((el) => {
      el.style.display = '';
      delete el.dataset.pxHidden;
    });
    const ids = await buildCommentOrder(topicId, key);
    return applyCommentLayout(section, ids);
  }

  /* ------------------------------------------------------------
   * 评论区翻页（仿 B 站）：按当前排序一页显示 N 层楼
   * ------------------------------------------------------------
   * 楼层太多时全渲染会把浏览器拖死，所以这里只控制「显示」，不改 DOM 节点：
   * 用 order 决定顺序、display 决定这一页露谁。首页 / 关注筛选 / 排序 / 翻页
   * 四者互不干扰（被「关注」隐藏的楼层不参与分页计数）。
   * ------------------------------------------------------------ */
  const COMMENT_PAGER_ID = 'pictExt-comment-pager';
  const commentPage = { topic: '', page: 1 };

  function commentPageSize() {
    return clampInt(settings.commentPageSize, 1, 20, 10);
  }

  function commentPagerEl() {
    return document.getElementById(COMMENT_PAGER_ID);
  }

  /** 楼层按当前呈现顺序排好（有 order 用 order，没有按 DOM 顺序） */
  function orderedThreads(section) {
    const arts = [...section.querySelectorAll(THREAD_SEL)];
    const domIdx = new Map(arts.map((a, i) => [a, i]));
    return arts.sort(
      (a, b) => Number(a.style.order || 0) - Number(b.style.order || 0) || domIdx.get(a) - domIdx.get(b)
    );
  }

  function renderCommentPager(section, total, shown, counts) {
    const container = commentContainer(section);
    if (!container) return;
    let pager = commentPagerEl();
    if (!pager) {
      pager = document.createElement('div');
      pager.id = COMMENT_PAGER_ID;
      pager.dataset.px = '1';
      container.insertAdjacentElement('afterend', pager);
      // 点击由 document 级委托统一处理（见 12.1），节点被重建也不会点两次
    } else if (pager.previousElementSibling !== container) {
      container.insertAdjacentElement('afterend', pager);
    }

    const cur = commentPage.page;
    // 页码列表：1 ... cur-1 cur cur+1 ... total
    const nums = new Set([1, total, cur, cur - 1, cur + 1]);
    if (total <= 7) for (let i = 1; i <= total; i++) nums.add(i);
    const list = [...nums].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
    let html = `<span class="pxcp-sum">共 ${total} 页</span>`;
    html += `<button class="pxcp-btn" type="button" data-px-page="prev"${cur <= 1 ? ' disabled' : ''}>上一页</button>`;
    let prev = 0;
    for (const n of list) {
      if (prev && n - prev > 1) html += '<span class="pxcp-gap">…</span>';
      html += `<button class="pxcp-btn" type="button" data-px-page="${n}" data-active="${
        n === cur ? 'true' : 'false'
      }">${n}</button>`;
      prev = n;
    }
    html += `<button class="pxcp-btn" type="button" data-px-page="next"${cur >= total ? ' disabled' : ''}>下一页</button>`;
    if (shown && counts.totalAll > counts.visible) html += `<span class="pxcp-sum">（筛掉 ${counts.totalAll - counts.visible} 层）</span>`;
    if (pager.dataset.html !== html) {
      pager.innerHTML = html;
      pager.dataset.html = html;
    }
    pager.dataset.px = '1';
  }

  function applyCommentPaging(section) {
    if (!section || !section.isConnected) return;
    const pager = commentPagerEl();
    // 关掉开关 / 原版且没开分页：把隐藏的楼层全放出来
    if (!settings.commentPaging) {
      section.querySelectorAll(`${THREAD_SEL}[data-px-page]`).forEach((el) => {
        el.style.display = '';
        delete el.dataset.pxPage;
      });
      if (pager) pager.remove();
      return;
    }

    const all = orderedThreads(section);
    if (!all.length) {
      if (pager) pager.remove();
      return;
    }
    const visible = all.filter((a) => !a.dataset.pxHidden);
    if (!visible.length) {
      if (pager) pager.remove();
      return;
    }
    const size = commentPageSize();
    const total = Math.max(1, Math.ceil(visible.length / size));
    const topic = detailTopicId();
    if (commentPage.topic !== topic) {
      commentPage.topic = topic;
      commentPage.page = 1;
    }
    commentPage.page = Math.min(total, Math.max(1, commentPage.page));
    // 只有一页就别碍眼了（B 站也是这么干的）
    if (total <= 1) {
      section.querySelectorAll(`${THREAD_SEL}[data-px-page]`).forEach((el) => {
        el.style.display = '';
        delete el.dataset.pxPage;
      });
      const p1 = commentPagerEl();
      if (p1) p1.remove();
      return;
    }
    const start = (commentPage.page - 1) * size;
    const end = start + size;

    visible.forEach((a, i) => {
      const show = i >= start && i < end;
      if (show) {
        if (a.dataset.pxPage) {
          a.style.display = '';
          delete a.dataset.pxPage;
        }
      } else if (!a.dataset.pxPage) {
        a.style.display = 'none';
        a.dataset.pxPage = '1';
      }
    });

    renderCommentPager(section, total, visible.length, { visible: visible.length, totalAll: all.length });
  }

  function scheduleCommentOrder(section) {
    if (!section || commentSortKey === 'native') return;
    clearTimeout(scheduleCommentOrder.t);
    scheduleCommentOrder.t = setTimeout(async () => {
      const sec = section && section.isConnected ? section : document.querySelector(COMMENT_SECTION);
      if (!sec) return;
      const key = commentSortKey;
      const label = (COMMENT_SORTS.find((s) => s.key === key) || {}).label || '';
      try {
        const msg = await applyCommentOrder(sec, key);
        applyCommentPaging(sec);
        if (key === commentSortKey) setCommentNote(msg ? `${label} · ${msg}` : `${label} · 已重排`);
      } catch (err) {
        log('comment order failed', err);
        if (key === commentSortKey) setCommentNote(`${label} · 排序失败：` + (err && err.message ? err.message : '接口没给数据'));
      }
    }, 200);
  }

  function setCommentNote(text) {
    const bar = commentSortBarEl();
    if (!bar) return;
    const note = bar.querySelector('.pxc-note');
    if (note) {
      note.textContent = text || '';
      note.hidden = !text;
    }
  }

  function mountCommentSort(section, topicId) {
    const nativeBar = section.querySelector('[aria-label="评论排序"]');
    let bar = commentSortBarEl();

    // 原版：把站内那套还回去，自己的整条拆掉，布局复位
    if (settings.commentSortMode !== 'replace') {
      if (commentSortKey !== 'native') commentSortKey = 'native';
      if (bar) bar.remove();
      if (nativeBar) nativeBar.style.display = '';
      resetCommentLayout(section);
      return;
    }

    if (!nativeBar) return;
    if (!bar) {
      bar = document.createElement('div');
      bar.id = COMMENT_SORT_ID;
      bar.dataset.px = '1';
      bar.setAttribute('role', 'tablist');
      bar.setAttribute('aria-label', 'pictExt 评论排序');
      bar.innerHTML =
        COMMENT_SORTS.map(
          (s) =>
            `<button type="button" class="pxc-tab" role="tab" data-csort="${s.key}" data-active="false" aria-selected="false">${esc(
              s.label
            )}</button>`
        ).join('') + '<span class="pxc-note" hidden></span>';
      bar.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-csort]');
        if (!btn) return;
        selectCommentSort(btn.dataset.csort);
      });
      nativeBar.insertAdjacentElement('beforebegin', bar);
    }
    // 站内那个下拉整体藏掉（不点它，排序全由扩展自己算）
    if (nativeBar.style.display !== 'none') nativeBar.style.display = 'none';
    if (commentSortKey === 'native') commentSortKey = 'hot';
    syncCommentTabs();
    // 已经挂上来的楼层补一次排序（首次进入 / 加载更多之后）
    scheduleCommentOrder(section);
  }

  function syncCommentTabs() {
    const bar = commentSortBarEl();
    if (!bar) return;
    bar.querySelectorAll('[data-csort]').forEach((b) => {
      const on = b.dataset.csort === commentSortKey;
      b.dataset.active = on ? 'true' : 'false';
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  function selectCommentSort(key) {
    if (!COMMENT_SORTS.some((s) => s.key === key)) return;
    const section = document.querySelector(COMMENT_SECTION);
    if (!section) return;
    commentSortKey = key;
    syncCommentTabs();
    setCommentNote('');
    scheduleCommentOrder(section);
  }

  function statItem(label, value) {
    return `<span class="inline-flex items-center gap-1"><span class="text-dimmed">${label}</span><span class="font-semibold text-muted">${esc(
      value
    )}</span></span>`;
  }

  function renderTopicInfo(d) {
    const parts = [
      statItem('浏览', fmtNum(d.viewCount)),
      statItem('回复', fmtNum(d.replyCount)),
      statItem('点赞', fmtNum(d.firstPost?.likeCount ?? 0)),
      statItem('发布于', timeAgo(d.createdAt)),
    ];
    if (d.lastActivityAt && d.lastActivityAt !== d.createdAt) parts.push(statItem('最后活跃', timeAgo(d.lastActivityAt)));
    if (d.kind === 'QUESTION') parts.push(statItem('类型', '问答'));
    if (d.pinned || d.pinnedGlobally) parts.push(statItem('状态', '置顶'));
    if (d.closedAt) parts.push(statItem('状态', '已关闭'));

    const tags = (d.tags || [])
      .map(
        (t) =>
          `<a href="/forum/category/${esc(t.slug)}" class="inline-flex items-center gap-1 text-primary hover:underline">${icon(
            'tag',
            12
          )}${esc(t.name)}</a>`
      )
      .join('');
    return parts.join('') + (tags ? `<span class="inline-flex flex-wrap items-center gap-x-2 gap-y-1">${tags}</span>` : '');
  }

  async function injectTopicInfo(section, topicId) {
    if (!topicId) return;
    let bar = section.querySelector('[data-px-topic-info]');
    if (!settings.topicInfo) {
      if (bar) bar.remove();
      return;
    }
    if (bar && bar.dataset.loaded === '1') return;
    if (!bar) {
      bar = document.createElement('div');
      bar.dataset.px = '1';
      bar.dataset.pxTopicInfo = '1';
      bar.className = 'mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs leading-5';
      bar.textContent = '正在读取帖子信息…';
      const first = section.firstElementChild;
      if (first) first.insertAdjacentElement('beforebegin', bar);
      else section.appendChild(bar);
    }
    if (bar.dataset.pending === '1') return;
    bar.dataset.pending = '1';
    try {
      const data = await getTopicDetail(topicId);
      if (!bar.isConnected) return;
      bar.innerHTML = renderTopicInfo(data);
      bar.dataset.loaded = '1';
    } catch {
      if (bar.isConnected) bar.textContent = '帖子信息读取失败';
    } finally {
      bar.dataset.pending = '0';
    }
  }

  /* ============================================================
   * 10.6 帖子右侧栏：所属合集 + 合集内切换
   * ------------------------------------------------------------
   * 数据：GET /topics/{id} → collection{id,name}（匿名可读）
   *       GET /topic-collections/{id}/topics（匿名可读，游标分页）
   * 站点自己只在侧栏放「文章目录」，这里把合集接在下面。
   * 「最早」= 接口原始顺序（就是合集目录顺序）；其余在本地按字段排。
   * 「最热」站点没暴露热度分，用互动加权估算并在状态里写明。
   * ============================================================ */
  const COLLECTION_BOX_ID = 'pictExt-collection';
  const COL_SORTS = [
    { key: 'earliest', label: '最早' },
    { key: 'views', label: '最多浏览' },
    { key: 'likes', label: '最多点赞' },
    { key: 'replies', label: '最多回复' },
    { key: 'bookmarks', label: '最多收藏' },
    { key: 'hot', label: '最热' },
  ];
  const COL_PAGES_MAX = 10; // 一个合集最多拉 10 页 × 50 = 500 篇
  const colState = { sort: 'earliest', expanded: false };
  const collectionListCache = new Map(); // collectionId -> {at, items}

  function hotScoreOf(t) {
    return (t.likeCount || 0) * 4 + (t.replyCount || 0) * 3 + Math.min(t.viewCount || 0, 5000) / 50;
  }

  async function loadCollectionTopics(colId) {
    const hit = collectionListCache.get(colId);
    if (hit && Date.now() - hit.at < CACHE_TTL) return hit.items;
    const items = [];
    const seen = new Set();
    let cursor = null;
    for (let i = 0; i < COL_PAGES_MAX; i++) {
      const page = await apiGet('/topic-collections/' + encodeURIComponent(colId) + '/topics', {
        limit: PAGE_LIMIT,
        cursor,
      });
      for (const it of page.items || []) {
        if (!it || !it.id || seen.has(it.id)) continue;
        seen.add(it.id);
        items.push(normalize(it));
      }
      const next = page.pageInfo && page.pageInfo.nextCursor;
      if (!next) break;
      cursor = next;
    }
    collectionListCache.set(colId, { at: Date.now(), items });
    return items;
  }

  function collectionBoxHTML(col, items, currentId) {
    const idx = items.findIndex((i) => i.id === currentId);
    const pos = idx >= 0 ? `${idx + 1}/${items.length}` : `—/${items.length}`;

    const list = items.slice();
    if (colState.sort !== 'earliest') {
      const key = colState.sort;
      list.sort((a, b) => {
        const va = key === 'hot' ? hotScoreOf(a) : Number(a[`${key === 'views' ? 'viewCount' : key === 'likes' ? 'likeCount' : key === 'replies' ? 'replyCount' : 'bookmarkCount'}`] || 0);
        const vb = key === 'hot' ? hotScoreOf(b) : Number(b[`${key === 'views' ? 'viewCount' : key === 'likes' ? 'likeCount' : key === 'replies' ? 'replyCount' : 'bookmarkCount'}`] || 0);
        if (vb !== va) return vb - va;
        return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
      });
    }

    const sortHTML = COL_SORTS.map(
      (s) =>
        `<button type="button" data-px-colsort="${s.key}" data-active="${s.key === colState.sort}">${esc(s.label)}</button>`
    ).join('');

    const rows = list
      .map((t) => {
        const meta = colState.expanded
          ? `<span class="pxcol-meta">${[
              `<span>${icon('chat', 11)} ${fmtNum(t.replyCount)}</span>`,
              `<span>${icon('eye', 11)} ${fmtNum(t.viewCount)}</span>`,
              `<span>${icon('heart', 11)} ${fmtNum(t.likeCount ?? 0)}</span>`,
              `<span>${icon('bookmark', 11)} ${fmtNum(t.bookmarkCount ?? 0)}</span>`,
            ].join('')}</span>${
              t.excerpt ? `<span class="pxcol-excerpt">${esc(t.excerpt)}</span>` : ''
            }`
          : '';
        return `<li><a class="pxcol-item" href="/forum/post/${esc(t.id)}"${t.id === currentId ? ' data-current="true" aria-current="page"' : ''} data-px-coltopic="${esc(
          t.id
        )}"><span class="pxcol-title">${esc(t.title || '（无标题）')}</span>${meta}</a></li>`;
      })
      .join('');

    return `<div class="pxcol-head"><span class="pxcol-name" title="${esc(col.name)}">${esc(
      col.name
    )}</span><span class="pxcol-idx">${pos}</span></div>
      <div class="pxcol-sort" role="tablist" aria-label="合集排序">${sortHTML}</div>
      <ol class="min-w-0" role="list">${rows}</ol>
      <button type="button" class="pxcol-toggle" data-px-coltoggle="1">${
        colState.expanded ? '收起统计与简介' : '显示统计与简介'
      }</button>`;
  }

  async function mountCollectionBox(topicId) {
    const aside = document.querySelector('aside[aria-label="帖子信息"]');
    let box = document.getElementById(COLLECTION_BOX_ID);
    if (!aside) {
      if (box) box.remove();
      return;
    }
    if (!topicId) {
      if (box) box.remove();
      return;
    }

    let data = null;
    try {
      data = await getTopicDetail(topicId);
    } catch {
      if (box) box.remove();
      return;
    }
    const col = data && data.collection;
    if (!col || !col.id) {
      if (box) box.remove();
      return;
    }

    if (!box) {
      box = document.createElement('section');
      box.id = COLLECTION_BOX_ID;
      box.dataset.px = '1';
      box.setAttribute('aria-label', '所属合集');
      box.textContent = '正在读取合集…';
      box.className = 'text-sm';
      aside.appendChild(box);
    }

    let items = [];
    try {
      items = await loadCollectionTopics(col.id);
    } catch {
      items = [];
    }
    collectionBoxCache.set(topicId, { col, items });
    renderCollectionBox();
  }

  /** topicId -> {col, items}，切换排序时不用重新请求 */
  const collectionBoxCache = new Map();

  function renderCollectionBox() {
    const box = document.getElementById(COLLECTION_BOX_ID);
    if (!box) return;
    const topicId = detailTopicId();
    const rec = collectionBoxCache.get(topicId);
    if (!rec) return;
    const sig = [rec.col.id, rec.items.length, colState.sort, colState.expanded, topicId].join('|');
    if (box.dataset.sig === sig) return;
    box.innerHTML = collectionBoxHTML(rec.col, rec.items, topicId);
    box.dataset.sig = sig;
    box.dataset.px = '1';
    // 当前这篇滚进可视区（合集很长时能立刻看到自己在哪）
    const cur = box.querySelector('[data-current="true"]');
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest' });
  }

  /* ------------------------------------------------------------
   * 从搜索结果跳进来：#post-{楼层号} → 展开所在楼、翻到那页、并高亮
   * ------------------------------------------------------------ */
  let lastFocusHash = '';
  let lastFocusTopic = '';

  function highlightComment(el) {
    if (!el) return;
    document.querySelectorAll('[data-px-focus]').forEach((x) => x.removeAttribute('data-px-focus'));
    el.setAttribute('data-px-focus', '1');
    // 10 秒后自己淡出，别一直亮着
    setTimeout(() => {
      if (el.isConnected && el.getAttribute('data-px-focus') === '1') el.removeAttribute('data-px-focus');
    }, 10000);
    setTimeout(() => {
      if (!el.isConnected || typeof el.scrollIntoView !== 'function') return;
      try {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      } catch {
        el.scrollIntoView();
      }
    }, 80);
  }

  /** 返回 true 表示这次真的定位到了 */
  function focusHashComment() {
    const m = (location.hash || '').match(/^#post-(\d+)/u);
    if (!m) return false;
    const target = document.getElementById('post-' + m[1]);
    if (!target) return false; // 评论还没渲染出来，等下一轮 processDetail 再试

    const article = target.closest(THREAD_SEL);
    if (!article) return false;
    const box = article.querySelector('.post-comment-replies');
    const inThread = !!(box && box.contains(target));

    if (inThread) {
      // 1) 这层楼如果折着，先展开
      const key = threadKeyOf(article);
      detailGlobal = null;
      threadState.set(key, true);
      refreshThreads(article);
      // 2) 楼中楼分页：翻到目标所在的那一页
      const nodes = threadReplyNodes(box);
      const idx = nodes.findIndex((el) => el === target || el.contains(target));
      if (idx >= 0) {
        threadPage.set(key, Math.floor(idx / THREAD_PAGE_SIZE) + 1);
        applyThreadPaging(article);
      }
    } else {
      // 顶层楼层：翻到它所在的那一页
      const section = document.querySelector(COMMENT_SECTION);
      if (section) {
        const visible = orderedThreads(section).filter((a) => !a.dataset.pxHidden);
        const idx = visible.indexOf(article);
        if (idx >= 0) {
          commentPage.topic = detailTopicId();
          commentPage.page = Math.floor(idx / commentPageSize()) + 1;
          applyCommentPaging(section);
        }
      }
    }

    highlightComment(target);
    return true;
  }

  function maybeFocusHash() {
    const topic = detailTopicId();
    // 换帖子了就把「已经定位过」的记录清掉，同一个 #post-N 也能再定位
    if (topic !== lastFocusTopic) {
      lastFocusTopic = topic;
      lastFocusHash = '';
    }
    const h = location.hash || '';
    if (!h || h === lastFocusHash) return;
    if (focusHashComment()) lastFocusHash = h;
  }

  function processDetail() {
    const section = document.querySelector(COMMENT_SECTION);
    if (!section) return;
    const topicId = detailTopicId();
    injectTopicInfo(section, topicId);
    mountCommentSort(section, topicId);
    injectGlobalToggle(section);
    refreshThreads();
    applyCommentPaging(section);
    mountCollectionBox(topicId);
    maybeFocusHash();
    expandReplyToolbars();
    if (settings.commentSortMode === 'replace') scheduleCommentOrder(section);
  }

  /* ============================================================
   * 10.4 回复区格式工具栏：默认展开站内自带的那一排
   * ------------------------------------------------------------
   * 站点的回复框（ForumPostCommentEditor）其实内置了和发帖页同一个
   * ForumEditorToolbar，只是收在底部「格式工具」按钮里，默认折叠。
   * 这里不自己画按钮、不注入样式、不碰 Vue 的数据模型：只在回复框已经
   * 可交互时替用户点一下那个按钮，站点的表情 / 图片 / 预览 / 字数校验
   * 逻辑全部原样保留。用户自己点过「格式工具」的回复框不再由扩展接管。
   * 站点若改掉这个按钮，本功能自动失效（不报错、不弄坏页面）。
   * ============================================================ */
  const REPLY_TOGGLE_SEL = 'button[aria-label="格式工具"]';
  const REPLY_COMPOSER_SEL = '.reply-composer';
  const REPLY_INPUT_SEL = 'textarea.reply-composer-input';
  /** 用户手动操作过的回复框：尊重用户选择，不再自动展开 / 收起 */
  const manualReplyComposers = new WeakSet();
  /** 由扩展展开过的回复框：关掉开关时只收起这些，不碰用户自己展开的 */
  const autoReplyComposers = new Set();

  /** 真实用户点按钮前一定有 pointerdown / keydown；程序 .click() 没有，用它区分 */
  function markManualReplyToggle(e) {
    const btn = e.target && e.target.closest ? e.target.closest(REPLY_TOGGLE_SEL) : null;
    if (!btn) return;
    const composer = btn.closest(REPLY_COMPOSER_SEL);
    if (composer) manualReplyComposers.add(composer);
  }

  function bindReplyToolbarEvents() {
    document.addEventListener('pointerdown', markManualReplyToggle, true);
    document.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') markManualReplyToggle(e);
      },
      true
    );
    document.addEventListener(
      'focusin',
      (e) => {
        if (e.target && e.target.matches && e.target.matches(REPLY_INPUT_SEL)) scheduleReplyToolbar();
      },
      true
    );
  }

  function expandReplyToolbars() {
    const on = !!settings.replyToolbar;
    for (const el of [...autoReplyComposers]) if (!el.isConnected) autoReplyComposers.delete(el);

    document.querySelectorAll(REPLY_TOGGLE_SEL).forEach((btn) => {
      const composer = btn.closest(REPLY_COMPOSER_SEL);
      if (!composer || manualReplyComposers.has(composer)) return;
      // 回复框收起时站内给工具行加了 inert，此时点按钮不会响应；
      // 而且站内的展开处理会把焦点移进输入框，所以只在用户已经点进这个框时才动手
      const tools = btn.closest('.reply-composer-tools');
      if ((tools && tools.hasAttribute('inert')) || !composer.contains(document.activeElement)) return;

      const expanded = btn.getAttribute('aria-expanded') === 'true';
      if (on && !expanded && !btn.disabled) {
        btn.click();
        autoReplyComposers.add(composer);
      } else if (!on && expanded && autoReplyComposers.has(composer)) {
        btn.click();
        autoReplyComposers.delete(composer);
      }
    });
  }

  const scheduleReplyToolbar = debounce(() => {
    try {
      expandReplyToolbars();
    } catch (err) {
      log('reply toolbar failed', err);
    }
  }, 120);

  /* ============================================================
   * 10.5 设置页：注入 PICTEXT 设置板块
   * ============================================================ */
  const SORT_OPTIONS = [
    ['following', '关注'],
    ['recommended', '站内推荐'],
    ['default', '默认排序（仅板块页）'],
    ['search', '站内搜索（仅搜索页）'],
    ['latest', '最新'],
    ['earliest', '最早'],
    ['views', '最多浏览'],
    ['likes', '最多点赞'],
    ['replies', '最多回复'],
    ['bookmarks', '最多收藏'],
    ['hot', '最热'],
  ];

  const SETTINGS_ROWS = [
    {
      key: 'sortMode',
      type: 'select',
      label: '帖子排序模式',
      desc:
        '「原版」= 插件完全不替换，站内本来怎么排就怎么排（默认）。「全部替换」= 首页、所有板块页、搜索页统一换成一套：关注 / 站内推荐 / 最新 / 最早 / 最多浏览 / 最多点赞 / 最多回复 / 最多收藏 / 最热（板块页另有「默认排序」）。',
      options: [
        ['native', '原版（不替换，默认）'],
        ['replace', '全部替换（8 项）'],
      ],
    },
    {
      key: 'defaultSort',
      type: 'select',
      label: '默认排序',
      desc:
        '「全部替换」模式下进入页面时默认选中哪一项，手动切换过就以手动为准。搜索页的「站内推荐」会自动换成「站内搜索」。',
      options: SORT_OPTIONS,
    },
    {
      key: 'homeSort',
      type: 'switch',
      label: '首页也替换',
      desc: '「全部替换」模式下是否连首页一起换。关掉就只在板块页 / 搜索页生效。',
    },
    {
      key: 'categorySort',
      type: 'switch',
      label: '板块页替换',
      desc: '点帖子上的 #标签 进入的板块页（/forum/category/…）是否替换。8 项在任何一个板块页里都可用。',
    },
    {
      key: 'searchSort',
      type: 'switch',
      label: '搜索页替换',
      desc: '搜索结果的帖子列表是否替换，关键词与板块筛选会一起带过去。',
    },
    {
      key: 'poolLatestPages',
      type: 'number',
      min: 1,
      max: 100,
      label: '候选池：最新页数',
      desc: '「最多浏览 / 点赞 / 回复 / 收藏 / 最早」是在候选池里排的。这里设最新链先翻几页（每页 50 条，1-100 页）。',
    },
    {
      key: 'poolHotPages',
      type: 'number',
      min: 1,
      max: 100,
      label: '候选池：推荐页数',
      desc: '候选池里热帖（推荐）链先翻几页（每页 50 条，1-100 页）。池子看完还能在底部「继续往后翻」。',
    },
    {
      key: 'commentSortMode',
      type: 'select',
      label: '评论区排序模式',
      desc:
        '「原版」= 站内三个排序照旧，只多一个「折叠全部回复」（默认）。「改版」= 换成 最热 / 关注 / 最早 / 最新 / 最多点赞。',
      options: [
        ['native', '原版（默认）'],
        ['replace', '改版（5 项）'],
      ],
    },
    {
      key: 'commentPaging',
      type: 'switch',
      label: '评论区按页显示',
      desc: '楼层太多时别一口气全渲染：像 B 站那样一页显示若干楼，底部有「上一页 / 下一页 / 页码」。',
    },
    {
      key: 'commentPageSize',
      type: 'number',
      min: 1,
      max: 20,
      label: '评论每页楼层数',
      desc: '一页显示多少层楼（1-20，默认 10）。楼中楼算在同一层里。',
    },
    {
      key: 'showTimes',
      type: 'switch',
      label: '显示改良：三种时间',
      desc:
        '把卡片上那个「x 时间前」拆成三项：发布时间（最老的那一版）、最近更新（帖子改过才有）、最近回复（最新一条回复的时间）。',
    },
    {
      key: 'useSession',
      type: 'switch',
      label: '读取登录状态（仅内存）',
      desc:
        '开着才能用「关注」流和评论关注筛选：进入页面时把 Cookie 读进内存，页面关闭 / 切后台立刻清空，不写入任何存储。关掉后所有请求都是匿名只读。',
    },
    {
      key: 'collapse',
      type: 'switch',
      label: '楼中楼自动折叠',
      desc: '长贴里回复多的楼层默认折叠起来，点一下再展开；每层楼各自记住状态。',
    },
    {
      key: 'collapseMin',
      type: 'select',
      label: '折叠阈值',
      desc: '楼中楼条数达到多少才默认折叠。选「1 条」就是只要有回复就折起来。',
      options: [
        ['1', '1 条'],
        ['2', '2 条'],
        ['3', '3 条'],
        ['5', '5 条'],
        ['10', '10 条'],
      ],
    },
    {
      key: 'globalToggle',
      type: 'switch',
      label: '「折叠全部回复」按钮',
      desc: '在评论排序旁放一个按钮，一键折叠 / 展开整个帖子的楼中楼。',
    },
    {
      key: 'topicInfo',
      type: 'switch',
      label: '评论区帖子信息条',
      desc: '在评论区顶部补一行浏览 / 回复 / 点赞 / 发布时间 / 最后活跃 / 标签。',
    },
    {
      key: 'replyToolbar',
      type: 'switch',
      label: '回复区格式工具栏',
      desc: '点进帖子的回复框时，自动展开站内自带的 Markdown 工具栏（和发帖页同一套：粗体、链接、代码块、公式等）。自己点「格式工具」收起后，扩展不再干预这个回复框。',
    },
    { key: 'showLikes', type: 'switch', label: '卡片显示赞数', desc: '在帖子卡片上补出点赞数。' },
    {
      key: 'showBookmarks',
      type: 'switch',
      label: '卡片显示收藏数',
      desc: '在帖子卡片上补出收藏数。接口没返回这个字段时不显示，也不填 0。',
    },
    { key: 'showTags', type: 'switch', label: '卡片显示标签', desc: '在帖子卡片上显示 #标签，可点进对应板块。' },
    { key: 'showPinned', type: 'switch', label: '卡片显示置顶标记', desc: '置顶帖标题前加一枚图钉。' },
  ];

  function switchHTML(key, on) {
    const state = on ? 'checked' : 'unchecked';
    return `<button type="button" role="switch" data-px-set="${key}" data-state="${state}" aria-checked="${on}"
        class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-[background] duration-200 ease-out data-[state=checked]:bg-primary data-[state=unchecked]:bg-accented focus-visible:outline-3 focus-visible:outline-primary">
        <span data-state="${state}" class="pointer-events-none size-4 rounded-full bg-default shadow-lg transition-transform duration-200 ease-out data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0"></span>
      </button>`;
  }

  function selectHTML(key, value, options) {
    return `<select data-px-set="${key}"
        class="h-9 rounded-md border border-default bg-default px-3 text-sm text-default transition-colors focus-visible:outline-2 focus-visible:outline-primary">
        ${options
          .map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(value) ? ' selected' : ''}>${esc(l)}</option>`)
          .join('')}
      </select>`;
  }

  function numberHTML(row) {
    return `<input type="number" data-px-set="${row.key}" min="${row.min}" max="${row.max}" step="1"
        value="${esc(settings[row.key])}" aria-label="${esc(row.label)}"
        class="h-9 w-20 rounded-md border border-default bg-default px-3 text-sm text-default tabular-nums focus-visible:outline-2 focus-visible:outline-primary">`;
  }

  function rowHTML(row) {
    const value = settings[row.key];
    const control =
      row.type === 'switch'
        ? switchHTML(row.key, !!value)
        : row.type === 'number'
          ? numberHTML(row)
          : selectHTML(row.key, String(value), row.options);
    return `<div class="flex min-w-0 gap-4 py-4 first:pt-0 last:pb-0 items-center justify-between">
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2"><h3 class="text-sm font-medium text-default wrap-anywhere">${esc(
            row.label
          )}</h3></div>
          <p class="mt-1 text-sm leading-6 text-muted">${esc(row.desc)}</p>
        </div>
        <div class="flex shrink-0 flex-wrap items-center gap-2">${control}</div>
      </div>`;
  }

  function settingsSectionHTML() {
    return `<section id="pictExt-settings" data-px="1" aria-labelledby="pictExt-settings-title"
        class="rounded-lg overflow-hidden bg-default ring-0 shadow-none">
      <div class="p-4 desktop:p-6 sm:p-4">
        <div class="mb-5 flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div class="min-w-0">
            <h2 id="pictExt-settings-title" class="text-base font-semibold text-default">PICTEXT</h2>
            <p class="mt-1 text-sm leading-6 text-muted">pictExt 扩展的设置。改动即时生效，随时可以改回来。</p>
          </div>
          <div class="flex min-w-0 max-w-full flex-wrap items-center gap-2 desktop:ml-auto">
            <button type="button" data-px-reset
              class="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-elevated px-3 text-sm font-semibold text-default transition-colors hover:bg-accented">恢复默认</button>
          </div>
        </div>
        <div class="min-w-0 divide-y divide-default">
          ${SETTINGS_ROWS.map(rowHTML).join('')}
          <div class="flex min-w-0 gap-4 py-4 first:pt-0 last:pb-0 items-center justify-between">
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2"><h3 class="text-sm font-medium text-default wrap-anywhere">隐私</h3></div>
              <p class="mt-1 text-sm leading-6 text-muted">Cookie 只在当前页面的内存里过一手：进入页面读一次，只为判断「现在是不是登录状态」（关注流要用）；页面关闭、切到后台、路由切换都会立刻清空，不写入 localStorage / sessionStorage / IndexedDB，也不上传到任何地方，更不会改动站点本身的登录 Cookie。关掉「读取登录状态」后，所有请求回到匿名只读。这里的设置只写入本机 localStorage（键名 ${esc(
                SETTINGS_KEY
              )}）。</p>
            </div>
            <div class="flex shrink-0 flex-wrap items-center gap-2">
              <button type="button" data-px-clear
                class="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-elevated px-3 text-sm font-semibold text-default transition-colors hover:bg-accented">清除设置</button>
            </div>
          </div>
        </div>
      </div>
    </section>`;
  }

  function syncSettingsValues(sec) {
    sec.querySelectorAll('[data-px-set][role="switch"]').forEach((sw) => {
      const on = !!settings[sw.dataset.pxSet];
      sw.dataset.state = on ? 'checked' : 'unchecked';
      sw.setAttribute('aria-checked', on ? 'true' : 'false');
      const thumb = sw.querySelector('span');
      if (thumb) thumb.dataset.state = on ? 'checked' : 'unchecked';
    });
    sec.querySelectorAll('select[data-px-set]').forEach((sel) => {
      sel.value = String(settings[sel.dataset.pxSet]);
    });
    sec.querySelectorAll('input[type="number"][data-px-set]').forEach((inp) => {
      inp.value = String(settings[inp.dataset.pxSet]);
    });
  }

  /** 设置改动后：存盘 + 立刻重算各处状态 */
  function applySettings() {
    saveSettings();
    // 登录态开关一动，内存里的 Cookie 快照立刻跟着建立 / 抹掉
    if (settings.useSession) authState.read();
    else authState.wipe();
    if (view) {
      nativeHider.show();
      teardown();
    }
    if (detailTopicId()) processDetail();
    expandReplyToolbars();
    scheduleMount();
  }

  /** 左侧导航里加一项 PICTEXT（桌面侧栏 + 移动端横排都加） */
  function mountSettingsNav() {
    const navs = document.querySelectorAll('nav[aria-label="设置分类"]');
    navs.forEach((nav) => {
      let btn = nav.querySelector('[data-px-settings-nav]');
      if (!btn) {
        const template = nav.querySelector('button');
        btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.px = '1';
        btn.dataset.pxSettingsNav = '1';
        btn.className =
          template?.className ||
          'flex h-11 min-w-0 items-center gap-2.5 rounded-md px-4 text-left text-sm font-semibold whitespace-nowrap text-muted transition-colors hover:bg-accented hover:text-default focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary aria-pressed:bg-primary/10 aria-pressed:text-primary';
        btn.innerHTML =
          '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 256 256" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" aria-hidden="true" class="size-4.5 shrink-0">' +
          '<line x1="40" y1="80" x2="216" y2="80"></line><circle cx="100" cy="80" r="20" fill="currentColor" stroke="none"></circle>' +
          '<line x1="40" y1="176" x2="216" y2="176"></line><circle cx="156" cy="176" r="20" fill="currentColor" stroke="none"></circle>' +
          '</svg><span>PICTEXT</span>';
        btn.addEventListener('click', () => {
          settingsActive = true;
          renderSettingsArea();
        });
        nav.appendChild(btn);
      }
      btn.setAttribute('aria-pressed', settingsActive ? 'true' : 'false');
    });
  }

  /** 激活时把 PICTEXT 面板放进设置内容区，并把原生分区藏起来；未激活时完全还原 */
  function renderSettingsArea() {
    const container = document.querySelector('div[id^="settings-"]');
    if (!container) return;

    document.querySelectorAll('[data-px-settings-nav]').forEach((b) => {
      b.setAttribute('aria-pressed', settingsActive ? 'true' : 'false');
    });
    document.querySelectorAll('nav[aria-label="设置分类"] button:not([data-px-settings-nav])').forEach((b) => {
      if (settingsActive) b.setAttribute('aria-pressed', 'false');
    });

    let sec = document.getElementById('pictExt-settings');
    if (!settingsActive) {
      [...container.children].forEach((el) => {
        if (el.dataset.pxHiddenBy) {
          el.style.display = el.dataset.pxPrevDisplay || '';
          delete el.dataset.pxHiddenBy;
          delete el.dataset.pxPrevDisplay;
        }
      });
      if (sec) sec.remove();
      return;
    }

    if (!sec) {
      const holder = document.createElement('div');
      holder.innerHTML = settingsSectionHTML();
      sec = holder.firstElementChild;
    }
    if (!sec.isConnected) container.appendChild(sec);
    [...container.children].forEach((el) => {
      if (el === sec) return;
      if (!el.dataset.pxHiddenBy) {
        el.dataset.pxHiddenBy = '1';
        el.dataset.pxPrevDisplay = el.style.display;
        el.style.display = 'none';
      }
    });
    bindSettingsSection(sec);
    syncSettingsValues(sec);
  }

  function bindSettingsSection(sec) {
    if (sec.dataset.pxBound === '1') return;
    sec.dataset.pxBound = '1';

    sec.addEventListener('click', (e) => {
      const sw = e.target.closest('[data-px-set][role="switch"]');
      if (sw) {
        settings[sw.dataset.pxSet] = !settings[sw.dataset.pxSet];
        syncSettingsValues(sec);
        applySettings();
        return;
      }
      if (e.target.closest('[data-px-reset]')) {
        settings = { ...DEFAULT_SETTINGS };
        syncSettingsValues(sec);
        applySettings();
        return;
      }
      if (e.target.closest('[data-px-clear]')) {
        try {
          localStorage.removeItem(SETTINGS_KEY);
        } catch {
          /* ignore */
        }
        settings = { ...DEFAULT_SETTINGS };
        syncSettingsValues(sec);
        applySettings();
      }
    });

    sec.addEventListener('change', (e) => {
      const num = e.target.closest('input[type="number"][data-px-set]');
      if (num) {
        const row = SETTINGS_ROWS.find((r) => r.key === num.dataset.pxSet);
        const key = num.dataset.pxSet;
        if (row) {
          settings[key] = clampInt(num.value, row.min, row.max, settings[key]);
          num.value = String(settings[key]);
        }
        applySettings();
        return;
      }
      const sel = e.target.closest('select[data-px-set]');
      if (!sel) return;
      const key = sel.dataset.pxSet;
      settings[key] = key === 'collapseMin' ? Number(sel.value) : sel.value;
      applySettings();
    });
  }

  /* ============================================================
   * 11. 挂载 / 卸载
   * ============================================================ */
  let view = null;
  let mountedCtxKey = '';
  let observer = null;

  function panelHTML(kind, tabs) {
    const buttons = tabs
      .map(
        (s) =>
          `<button class="px-tab" type="button" role="tab" data-sort="${s.key}" data-active="false" aria-selected="false">${esc(
            s.label
          )}</button>`
      )
      .join('');
    return `<div class="px-bar"><div class="px-tabs" role="tablist" aria-label="pictExt 排序">${buttons}</div></div>
      <p class="px-note" hidden></p>
      <div class="px-list" aria-live="polite"></div>
      <div class="px-foot"></div>`;
  }

  function buildPanel(kind) {
    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement('div');
      panel.id = PANEL_ID;
    }
    panel.classList.toggle('px-align-end', kind === 'home');
    panel.dataset.kind = kind;
    return panel;
  }

  function teardown() {
    const panel = document.getElementById(PANEL_ID);
    if (panel) panel.remove();
    nativeHider.show();
    view = null;
    mountedCtxKey = '';
  }

  function mount() {
    // 帖子详情页：走折叠 / 信息补全
    if (detailTopicId()) {
      if (view) teardown();
      processDetail();
      return;
    }

    // 个人资料页：合集列表排序 / 搜索
    if (profileUid()) {
      if (view) teardown();
      mountProfileCollections();
      return;
    }

    // 设置页：注入 PICTEXT 设置板块
    if (location.pathname.startsWith('/settings')) {
      if (view) teardown();
      mountSettingsNav();
      renderSettingsArea();
      return;
    }

    const adapter = currentAdapter();
    if (!adapter) {
      if (view) teardown();
      return;
    }
    const mp = adapter.mountPoint();
    if (!mp || !mp.anchor || !mp.anchor.isConnected) {
      if (document.getElementById(PANEL_ID)) teardown();
      return;
    }

    const kind = adapter.kind;
    // 原版模式 = 插件完全不碰排序（默认）；只有「全部替换」才注入面板
    if (settings.sortMode !== 'replace') {
      if (document.getElementById(PANEL_ID)) teardown();
      return;
    }
    // 替换模式下也允许按页面关掉
    const enabledFor = { home: settings.homeSort, search: settings.searchSort, category: settings.categorySort };
    if (!enabledFor[kind]) {
      if (document.getElementById(PANEL_ID)) teardown();
      return;
    }
    const ctx = adapter.ctx();
    const ctxKey = JSON.stringify([kind, ctx.q || '', ctx.tag || '', ctx.boards || []]);
    const panel = document.getElementById(PANEL_ID);

    if (panel && panel.isConnected && view && mountedCtxKey === ctxKey && panel.dataset.kind === kind) {
      nativeHider.prune();
      nativeHider.hide(adapter.nativeNodes(mp.anchor));
      return;
    }

    nativeHider.show();

    // 每类页面固定 8 项：搜索页把「推荐流」换成「站内搜索」，其余页面相反
    const tabs = sortsFor(kind);

    const fresh = buildPanel(kind);
    fresh.innerHTML = panelHTML(kind, tabs);

    const tabsHost = fresh.querySelector('.px-tabs');

    if (mp.anchor.parentElement && mp.anchor.parentElement.contains(mp.anchor)) {
      mp.anchor.parentElement.insertBefore(fresh, mp.anchor);
    } else {
      mp.anchor.insertAdjacentElement('beforebegin', fresh);
    }

    view = new FeedView(fresh, kind, ctx, () => adapter.nativeNodes(mp.anchor), tabsHost);
    view.syncTabs();
    mountedCtxKey = ctxKey;

    // 记住的那一项 / 设置里的默认项，可能在这个页面不存在（比如搜索页的「推荐流」）
    const allowed = new Set(tabs.map((t) => t.key));
    const pick = (...cands) => cands.find((k) => k && allowed.has(k));
    const keep = pick(lastSortKey[kind], settings.defaultSort, kind === 'search' ? 'search' : 'latest', 'latest', 'hot');
    view.select(keep || tabs[0].key);
  }

  const scheduleMount = debounce(() => {
    try {
      mount();
    } catch (err) {
      log('mount failed', err);
    }
  }, 200);

  function isOwnNode(n) {
    const el = n.nodeType === 1 ? n : n.parentElement;
    if (!el || !el.closest) return false;
    return !!el.closest('#' + PANEL_ID) || !!el.closest('[data-px="1"]') || el.id === 'pictExt-style';
  }

  function startObserver() {
    if (observer) observer.disconnect();
    observer = new MutationObserver((records) => {
      const external = records.some((r) => {
        const nodes = [...r.addedNodes, ...r.removedNodes];
        if (!nodes.length) return false;
        return nodes.some((n) => !isOwnNode(n));
      });
      if (external) {
        scheduleMount();
        scheduleReplyToolbar();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  /** 点了站内的设置分类 → 退出 PICTEXT 面板 */
  function bindSettingsNavReset() {
    document.addEventListener(
      'click',
      (e) => {
        const btn = e.target.closest('nav[aria-label="设置分类"] button');
        if (!btn || btn.hasAttribute('data-px-settings-nav')) return;
        if (!settingsActive) return;
        settingsActive = false;
        setTimeout(renderSettingsArea, 0);
      },
      true
    );
  }

  /** 只在页面主世界有效：manifest.json 里声明了 "world": "MAIN" */
  function bindHashFocus() {
    window.addEventListener('hashchange', () => {
      lastFocusHash = '';
      setTimeout(() => {
        const sec = document.querySelector(COMMENT_SECTION);
        if (sec) processDetail();
      }, 160);
    });
  }

  function hookRouter() {
    const wrap = (fn) =>
      function (...args) {
        const ret = fn.apply(this, args);
        setTimeout(scheduleMount, 80);
        return ret;
      };
    history.pushState = wrap(history.pushState);
    history.replaceState = wrap(history.replaceState);
    window.addEventListener('popstate', () => setTimeout(scheduleMount, 80));
  }

  /* ============================================================
   * 10.7 个人资料页：合集列表排序 + 搜索
   * ------------------------------------------------------------
   * 站点把合集列表渲染在 [data-profile-collection-list]（aria-label="合集列表"）里，
   * 每个合集是 button[data-collection-id]。这里在列表上方加一条工具栏：
   *   - 搜索框：按合集中文名过滤（纯前端，不发请求）
   *   - 排序：最新（站点原始顺序）/ 最多浏览 / 最多点赞 / 最多回复
   * 浏览/点赞/回复是合集内所有帖子的合计，只能靠逐个合集拉主题列表算出来，
   * 所以只在点了这三项时才发请求，并且每个合集最多翻 3 页（150 篇）。
   * ============================================================ */
  const PROFCOL_BAR_ID = 'pictExt-profcol';
  const PROFCOL_LIST_SEL = '[data-profile-collection-list]';
  const PROFCOL_STAT_PAGES = 3;
  const profColState = { sort: 'latest', q: '' };
  const profColStats = new Map(); // collectionId -> {at, viewCount, likeCount, replyCount}

  function profileUid() {
    const m = location.pathname.match(/^\/profile\/([^/?#]+)/u);
    return m ? decodeURIComponent(m[1]) : '';
  }

  async function collectionTotals(colId) {
    const hit = profColStats.get(colId);
    if (hit && Date.now() - hit.at < CACHE_TTL * 4) return hit;
    const acc = { at: Date.now(), viewCount: 0, likeCount: 0, replyCount: 0 };
    let cursor = null;
    for (let i = 0; i < PROFCOL_STAT_PAGES; i++) {
      const page = await apiGet('/topic-collections/' + encodeURIComponent(colId) + '/topics', {
        limit: PAGE_LIMIT,
        cursor,
      });
      for (const t of page.items || []) {
        acc.viewCount += Number(t.viewCount || 0);
        acc.likeCount += Number(t.likeCount || 0);
        acc.replyCount += Number(t.replyCount || 0);
      }
      const next = page.pageInfo && page.pageInfo.nextCursor;
      if (!next) break;
      cursor = next;
    }
    profColStats.set(colId, acc);
    return acc;
  }

  function profColBarHTML() {
    const sorts = [
      ['latest', '最新'],
      ['views', '最多浏览'],
      ['likes', '最多点赞'],
      ['replies', '最多回复'],
    ];
    return `<div class="flex flex-wrap items-center gap-2">
        <input type="search" data-px-colq placeholder="搜索合集名字…" value="${esc(profColState.q)}"
          class="h-8 min-w-32 flex-1 rounded-md border border-default bg-default px-2.5 text-sm text-default focus-visible:outline-2 focus-visible:outline-primary">
        <div class="pxcol-sort" role="tablist" aria-label="合集排序">${sorts
          .map(
            ([k, l]) =>
              `<button type="button" data-px-profsort="${k}" data-active="${k === profColState.sort}">${esc(l)}</button>`
          )
          .join('')}</div>
        <span class="pxc-note" hidden></span>
      </div>`;
  }

  async function applyProfileCollectionView() {
    const list = document.querySelector(PROFCOL_LIST_SEL);
    if (!list) return;
    const items = [...list.children].filter((el) => el.nodeType === 1);
    const q = profColState.q.trim().toLowerCase();

    items.forEach((el) => {
      const hit = !q || (el.textContent || '').toLowerCase().includes(q);
      el.style.display = hit ? '' : 'none';
    });

    const bar = document.getElementById(PROFCOL_BAR_ID);
    const note = bar && bar.querySelector('.pxc-note');
    const setNote = (t) => {
      if (!note) return;
      note.textContent = t || '';
      note.hidden = !t;
    };

    if (profColState.sort === 'latest') {
      items.forEach((el) => {
        el.style.order = '';
        delete el.dataset.pxColOrder;
      });
      list.style.display = '';
      list.style.flexDirection = '';
      setNote('');
      return;
    }

    const metric = profColState.sort === 'views' ? 'viewCount' : profColState.sort === 'likes' ? 'likeCount' : 'replyCount';
    const withId = items.filter((el) => el.dataset.collectionId);
    if (!withId.length) {
      setNote('这个页面的合集卡片没带 id，排不了');
      return;
    }
    if (withId.length > 12) setNote('合集较多，只按前 12 个算合计');

    const totals = new Map();
    await Promise.all(
      withId.slice(0, 12).map(async (el) => {
        try {
          totals.set(el.dataset.collectionId, await collectionTotals(el.dataset.collectionId));
        } catch {
          totals.set(el.dataset.collectionId, { viewCount: 0, likeCount: 0, replyCount: 0 });
        }
      })
    );

    if (list.style.display !== 'flex') {
      list.style.display = 'flex';
      list.style.flexDirection = 'column';
    }
    const score = (el) => {
      const t = totals.get(el.dataset.collectionId);
      return t ? t[metric] || 0 : -1;
    };
    [...items]
      .sort((a, b) => score(b) - score(a))
      .forEach((el, i) => {
        el.style.order = String(i);
        el.dataset.pxColOrder = '1';
      });
    setNote(`按合集内帖子合计排序（每册最多算 ${PROFCOL_STAT_PAGES * PAGE_LIMIT} 篇）`);
  }

  function mountProfileCollections() {
    const list = document.querySelector(PROFCOL_LIST_SEL);
    let bar = document.getElementById(PROFCOL_BAR_ID);
    if (!list) {
      if (bar) bar.remove();
      return;
    }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = PROFCOL_BAR_ID;
      bar.dataset.px = '1';
      bar.className = 'mb-3';
      bar.innerHTML = profColBarHTML();
      list.insertAdjacentElement('beforebegin', bar);
    } else if (bar.nextElementSibling !== list) {
      list.insertAdjacentElement('beforebegin', bar);
    }
    applyProfileCollectionView();
  }

  /* ============================================================
   * 11.5 Cookie 快照的生命周期
   * ------------------------------------------------------------
   * 进入页面读一次（只在内存），离开 / 切后台 / 路由切换立刻抹掉。
   * 不写任何存储、不发往任何地方；站点的登录 Cookie 本身不会被改动。
   * ============================================================ */
  function bindCookieLifecycle() {
    if (settings.useSession) authState.read();

    const wipe = () => authState.wipe();
    window.addEventListener('pagehide', wipe);
    window.addEventListener('beforeunload', wipe);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') wipe();
    });

    // 路由切换 = 上一页的会话快照作废，进新页再读一次
    const onRoute = () => {
      authState.wipe();
      if (settings.useSession) authState.read();
    };
    history.pushState = ((orig) =>
      function (...args) {
        const ret = orig.apply(this, args);
        setTimeout(onRoute, 0);
        return ret;
      })(history.pushState);
    history.replaceState = ((orig) =>
      function (...args) {
        const ret = orig.apply(this, args);
        setTimeout(onRoute, 0);
        return ret;
      })(history.replaceState);
  }

  /* ============================================================
   * 12.1 统一事件委托
   * ------------------------------------------------------------
   * 站点是 Vue，会频繁重建我们插进去的节点。监听器挂在按钮自己身上时，
   * 一旦 mousedown 与 click 之间节点被换掉，click 就派发不到那颗按钮上，
   * 表现就是「点一次没反应，点两次才生效」。所以这里统一改成 document 级
   * 委托，并且只读 data-* 状态，节点被重建也不影响。
   * ============================================================ */
  /**
   * 扩展所有按钮的唯一入口。返回 true 表示「这个点击是我的，已处理」。
   * 只读 data-* 状态，不依赖闭包，节点被 Vue 重建也照样能用。
   */
  function runPxAction(target, ev) {
    if (!target || !target.closest) return false;
    const t = target;

    // 楼中楼：单楼展开 / 收起
    const th = t.closest('[data-px-thread-toggle]');
    if (th) {
      ev.preventDefault();
      const article = th.closest(THREAD_SEL);
      if (!article) return true;
      const key = th.dataset.key || threadKeyOf(article);
      const expanded = th.dataset.expanded === '1';
      detailGlobal = null; // 手动操作优先
      threadState.set(key, !expanded);
      refreshThreads(article);
      return true;
    }

    // 折叠 / 展开全部回复
    const gl = t.closest('[data-px-global-toggle]');
    if (gl) {
      ev.preventDefault();
      detailGlobal = detailGlobal === 'all' ? 'none' : 'all';
      threadState.clear();
      refreshThreads();
      return true;
    }

    // 长评论「展开全文」
    const ex = t.closest('[data-px-expand]');
    if (ex) {
      ev.preventDefault();
      expandComment(ex);
      return true;
    }

    // 评论区翻页
    const pg = t.closest('[data-px-page]');
    if (pg) {
      if (pg.disabled) return true;
      ev.preventDefault();
      const v = pg.dataset.pxPage;
      commentPage.page = v === 'prev' ? commentPage.page - 1 : v === 'next' ? commentPage.page + 1 : Number(v);
      const sec = document.querySelector(COMMENT_SECTION);
      if (sec) applyCommentPaging(sec);
      return true;
    }

    // 楼中楼翻页
    const tp = t.closest('[data-px-tpage]');
    if (tp) {
      if (tp.disabled) return true;
      ev.preventDefault();
      const article = tp.closest(THREAD_SEL);
      if (!article) return true;
      const box = article.querySelector('.post-comment-replies');
      const nodes = threadReplyNodes(box);
      const total = Math.max(1, Math.ceil(nodes.length / THREAD_PAGE_SIZE));
      const key = threadKeyOf(article);
      const cur = threadPage.get(key) || 1;
      const v = tp.dataset.pxTpage;
      const next = v === 'prev' ? cur - 1 : v === 'next' ? cur + 1 : Number(v);
      threadPage.set(key, Math.min(total, Math.max(1, next)));
      applyThreadPaging(article);
      return true;
    }

    // 右侧栏合集：排序 / 展开详情
    const cs = t.closest('[data-px-colsort]');
    if (cs) {
      ev.preventDefault();
      colState.sort = cs.dataset.pxColsort;
      renderCollectionBox();
      return true;
    }
    const ct = t.closest('[data-px-coltoggle]');
    if (ct) {
      ev.preventDefault();
      colState.expanded = !colState.expanded;
      renderCollectionBox();
      return true;
    }

    // 个人资料合集：排序
    const ps = t.closest('[data-px-profsort]');
    if (ps) {
      ev.preventDefault();
      profColState.sort = ps.dataset.pxProfsort;
      const bar = document.getElementById(PROFCOL_BAR_ID);
      if (bar) {
        bar.querySelectorAll('[data-px-profsort]').forEach((b) => {
          b.dataset.active = b.dataset.pxProfsort === profColState.sort ? 'true' : 'false';
        });
      }
      applyProfileCollectionView();
      return true;
    }
    return false;
  }

  function bindDelegatedUI() {
    if (bindDelegatedUI.bound) return;
    bindDelegatedUI.bound = true;

    /**
     * 为什么不是只监听 click：
     * 站点（Vue）每 200ms 左右会 patch 一次评论区，我们插的按钮经常在
     * mousedown 与 click 之间被换掉 —— click 就派发不到那颗按钮，表现为
     * 「点一次没反应、要点好几下」。所以在 pointerdown 就先把动作做掉
     * （手指/鼠标一按下立即响应），随后那次 click 直接吞掉，避免重复执行。
     */
    let handledAt = 0;

    document.addEventListener(
      'pointerdown',
      (e) => {
        if (e.button !== 0) return;
        if (runPxAction(e.target, e)) {
          handledAt = Date.now();
          // 按下就算数：阻止后续 click 的默认行为（也避免触发站点对这段文本的选择/跳转）
          e.preventDefault();
        }
      },
      true
    );

    // 键盘（Enter/Space）与不支持 pointer 的环境仍然走 click
    document.addEventListener(
      'click',
      (e) => {
        if (Date.now() - handledAt < 600) return; // 这次点击刚在 pointerdown 处理过
        runPxAction(e.target, e);
      },
      true
    );

    // 个人资料合集搜索：输入即筛（180ms 防抖）
    let qTimer = null;
    document.addEventListener('input', (e) => {
      const inp = e.target && e.target.closest ? e.target.closest('[data-px-colq]') : null;
      if (!inp) return;
      clearTimeout(qTimer);
      qTimer = setTimeout(() => {
        profColState.q = inp.value || '';
        applyProfileCollectionView();
      }, 180);
    });
  }

  /* ============================================================
   * 12. 启动
   * ============================================================ */
  function boot() {
    injectStyle();
    hookRouter();
    bindCookieLifecycle();
    bindSettingsNavReset();
    bindReplyToolbarEvents();
    bindDelegatedUI();
    bindHashFocus();
    startObserver();
    scheduleMount();
    scheduleReplyToolbar();
    console.info(
      '%cpictExt%c v1.7.4 扩展已加载 · 只读 · Cookie 仅在本页内存驻留，离开即清除',
      'background:#3b82f6;color:#fff;border-radius:3px;padding:1px 5px;font-weight:700',
      'color:#6b7280'
    );
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();

})();
