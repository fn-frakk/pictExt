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

  /* ---------- 性能相关（v1.7.5） ---------- */
  const POOL_WORKERS = 8;         // 深翻时最多几个并行段（整池共享，按页数分配）
  const PAGES_PER_WORKER = 10;    // 每段至少 10 页才值得单开一个 worker
  const RENDER_CHUNK = 20;        // 「再多看几条」一次多渲染多少张卡
  const RENDER_CHUNK_MIN = 10;
  const RENDER_CHUNK_MAX = 100;
  const POOL_CACHE_MAX = 4;       // 候选池缓存最多留几个（每个可能上万条，不能无限存）

  /** 8 个排序键（v1.5 起「全部替换」模式固定就是这 8 个，不再跟站内合并） */
  const SORT_KEYS = new Set([
    'following', 'recommended', 'default', 'search', 'latest', 'earliest',
    'views', 'likes', 'replies', 'bookmarks', 'hot',
  ]);

  const log = (...a) => DEBUG && console.log('[pictExt]', ...a);
