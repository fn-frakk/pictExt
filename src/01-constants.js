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
