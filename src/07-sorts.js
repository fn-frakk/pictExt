  /* ============================================================
   * 5. 排序定义（v1.5：固定 8 项，全部板块页 / 首页 / 搜索页通用）
   * ------------------------------------------------------------
   * mode:
   *   server —— 服务端排序（/topics?sort=latest|hot）
   *   feed   —— 关注流 / 推荐流（/topic-recommendations）
   *   pool   —— 服务端没有这个排序，客户端在候选池里排
   * 站点 /topics 只接受 relevance|latest|hot，浏览量 / 点赞 / 回复 / 收藏
   * 都没有服务端排序，所以这 4 项只能在候选池里排。
   *
   * poolChains：这个排序需要哪几条链喂池子。
   *   站内 sort=latest 实际是按「最后活跃时间」（被回复就往前顶），
   *   所以「最新 = 按发布时间」也得在池子里重排（只翻最新这一条链就够：
   *   刚发的帖子活跃时间必然最新，一定落在最前面几页里）。
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
    {
      key: 'latest',
      label: '最新',
      mode: 'server',
      serverSort: 'latest',
      note: '按发布时间倒序',
      poolChains: ['latest'],
    },
    // /topics 只接受 relevance|latest|hot，没有「最早」，只能在候选池里按 createdAt 正序
    {
      key: 'earliest',
      label: '最早',
      mode: 'pool',
      metric: 'createdAt',
      asc: true,
      poolChains: ['latest'],
      note: '在候选池里按发布时间正序（接口没有服务端最早）',
    },
    { key: 'views', label: '最多浏览', mode: 'pool', metric: 'viewCount', poolChains: ['latest', 'hot'], note: '按浏览量排序' },
    { key: 'likes', label: '最多点赞', mode: 'pool', metric: 'likeCount', poolChains: ['latest', 'hot'], note: '按点赞数排序' },
    { key: 'replies', label: '最多回复', mode: 'pool', metric: 'replyCount', poolChains: ['latest', 'hot'], note: '按回复数排序' },
    { key: 'bookmarks', label: '最多收藏', mode: 'pool', metric: 'bookmarkCount', poolChains: ['latest', 'hot'], note: '按收藏数排序' },
    { key: 'hot', label: '最热', mode: 'server', serverSort: 'hot', note: '站内热度排名（服务端 all-time 热度分）' },
  ];
  const SORT_MAP = new Map(SORTS.map((s) => [s.key, s]));

  /**
   * 实际执行的排序（设置会影响的那几项在这里改道）。
   * 「最新」默认走候选池按发布时间排 —— 站内 sort=latest 是按活跃时间，
   * 一个老帖被回复就会顶到前面，看着不像「最新」。设置里关掉就回到服务端顺序。
   */
  function resolveSort(key) {
    const s = SORT_MAP.get(key) || SORT_MAP.get('latest');
    if (key === 'latest' && settings.latestByCreated) {
      return {
        ...s,
        mode: 'pool',
        metric: 'createdAt',
        desc: true,
        poolChains: ['latest'],
        note: '按帖子发布时间倒序（站内「最新」其实按活跃时间，这里在候选池里重排）',
      };
    }
    return s;
  }

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
