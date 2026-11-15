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
