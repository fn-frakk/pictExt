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
    latestByCreated: true,    // 「最新」按发布时间（站内 sort=latest 其实是按活跃时间）
    poolParallel: true,       // 深翻时按时间锚点切段并行拉（读不懂游标就自动退回串行）
    poolRenderChunk: 20,      // 「再多看几条」一次多显示几条（10-100）
    commentPaging: true,      // 评论区按页显示（像 B 站那样）
    commentPageSize: 10,      // 评论每页楼层数（1-20）
    showStats: false,         // 首页「PICKCAT 数据统计」卡片（默认关，独立懒加载，不碰 feed）
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
      merged.poolRenderChunk = clampInt(merged.poolRenderChunk, RENDER_CHUNK_MIN, RENDER_CHUNK_MAX, RENDER_CHUNK);
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
