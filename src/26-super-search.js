  /* ============================================================
   * 13. Super 搜索 —— 严格关键词搜索 + 本地候选池（增量缓存 + 自动清理失效）
   * ------------------------------------------------------------
   * 为什么不用站内搜索：
   *   站内 /topics?q= 是「相关度」模糊匹配，搜 pick 出 29 条、搜 pickcat 出 500 条，
   *   关键词越短命中越多，完全没法当检索用。这里改成：
   *   1) 候选池：本地缓存全站主题 + 回复，按时间水位线增量拉取；
   *   2) 匹配：默认严格（所有词都要命中），也可切宽松（任意词命中）；
   *   3) 缓存增量：本次已加载到 YYYY-MM-DD HH:MM:SS，下次只拉这之后的内容；
   *   4) 清理失效：帖子 404 / 楼层 deleted / 整篇列表里消失的回复 → 自动剔出池子。
   *
   * 关键词来自站点的搜索框（URL 上的 q），面板里不再放第二个输入框。
   * ============================================================ */
  const SUPER_POOL_KEY = 'pictExt:superpool:v1';
  const SUPER_UI_KEY = 'pictExt:superui:v1';
  const SUPER_ID = 'pictExt-super';

  const SUPER_MAX_TOPICS = 1500;   // 池子里最多留多少主题（超了丢最老的）
  const SUPER_MAX_REPLIES = 3000;  // 池子里最多留多少条回复
  const SUPER_TOPIC_PAGES = 8;     // 一次同步最多翻几页主题（每页 50）
  const SUPER_POST_PAGES = 2;      // 每个有新活动的帖最多翻几页回复
  const SUPER_REPLY_TOPICS = 20;   // 一次同步最多给多少个帖子补回复（避免请求打爆）
  const SUPER_PRUNE_SAMPLE = 40;   // 每次同步后抽查多少个主题，确认是否已被删
  const SUPER_PRUNE_WORKERS = 6;   // 抽查并发
  const SUPER_REPLY_CHARS = 500;   // 单条回复正文最多留多少字（够搜就行）
  const SUPER_EXCERPT_CHARS = 600;
  const SUPER_RESULT_MAX = 200;    // 一次最多返回多少条结果

  /** 池子（内存态；持久化在 localStorage） */
  const superPool = {
    v: 1,
    watermark: 0,      // 已加载到的最后时间点（毫秒）
    updatedAt: 0,      // 上次同步完成时间
    lastPruneAt: 0,    // 上次清理时间
    pruneOffset: 0,    // 轮转抽查的游标
    topics: {},        // id -> 主题记录
    replies: {},       // id -> 回复记录
  };

  const superState = {
    scope: 'all',
    sort: 'relevance',
    mode: 'strict',
    host: null,
    mounted: false,
    urlQ: '',
    renderSig: '', // 上次渲染的「内容指纹」，用来避免无意义的重画
  };
  let superPoolLoaded = false;
  let superSyncing = false;
  let superSyncError = '';
  let superStatus = '';

  /* ------------------------------------------------------------
   * 13.1 存储
   * ---------------------------------------------------------- */

  function loadSuperPool() {
    if (superPoolLoaded) return superPool;
    superPoolLoaded = true;
    try {
      const raw = localStorage.getItem(SUPER_POOL_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (p && typeof p === 'object') {
          superPool.v = 1;
          superPool.watermark = Number(p.watermark) || 0;
          superPool.updatedAt = Number(p.updatedAt) || 0;
          superPool.lastPruneAt = Number(p.lastPruneAt) || 0;
          superPool.pruneOffset = Number(p.pruneOffset) || 0;
          superPool.topics = p.topics && typeof p.topics === 'object' ? p.topics : {};
          superPool.replies = p.replies && typeof p.replies === 'object' ? p.replies : {};
        }
      }
    } catch {
      /* 读不出来就当空池 */
    }
    return superPool;
  }

  /** 超配额时先砍掉最老的一半再存；实在存不进去就放弃这次落盘（内存里照用） */
  function saveSuperPool() {
    const pool = loadSuperPool();
    pool.updatedAt = Date.now();
    const trim = () => {
      const t = Object.values(pool.topics).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
      while (t.length > SUPER_MAX_TOPICS) delete pool.topics[t.shift().id];
      const r = Object.values(pool.replies).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
      while (r.length > SUPER_MAX_REPLIES) delete pool.replies[r.shift().id];
    };
    trim();
    try {
      localStorage.setItem(SUPER_POOL_KEY, JSON.stringify(pool));
    } catch {
      try {
        const t = Object.values(pool.topics).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
        while (t.length > Math.floor(SUPER_MAX_TOPICS / 2)) delete pool.topics[t.shift().id];
        const r = Object.values(pool.replies).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
        while (r.length > Math.floor(SUPER_MAX_REPLIES / 2)) delete pool.replies[r.shift().id];
        localStorage.setItem(SUPER_POOL_KEY, JSON.stringify(pool));
      } catch {
        /* 无痕模式等场景写不进去就算了，池子仍然在内存里可用 */
      }
    }
  }

  /** 面板偏好（范围 / 匹配方式 / 排序）单独存，跟设置项分开 */
  function loadSuperUI() {
    try {
      const raw = localStorage.getItem(SUPER_UI_KEY);
      if (raw) {
        const u = JSON.parse(raw) || {};
        if (u.scope) superState.scope = u.scope;
        if (u.sort) superState.sort = u.sort;
        if (u.mode) superState.mode = u.mode;
      }
    } catch {
      /* 忽略 */
    }
  }
  function saveSuperUI() {
    try {
      localStorage.setItem(
        SUPER_UI_KEY,
        JSON.stringify({ scope: superState.scope, sort: superState.sort, mode: superState.mode })
      );
    } catch {
      /* 忽略 */
    }
  }

  /* ------------------------------------------------------------
   * 13.2 文本处理
   * ---------------------------------------------------------- */

  const HTML_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ', apos: "'" };

  /** cookedHtml → 纯文本（去掉标签、还原实体、压空白） */
  function plainText(html, limit) {
    if (!html) return '';
    let s = String(html)
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/(p|div|li|h[1-6])>/gi, ' ')
      .replace(/<[^>]*>/g, '');
    s = s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, g) => {
      const key = g.toLowerCase();
      if (HTML_ENTITIES[key]) return HTML_ENTITIES[key];
      if (key.startsWith('#x')) {
        const code = parseInt(key.slice(2), 16);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      if (key.startsWith('#')) {
        const code = parseInt(key.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return m;
    });
    s = s.replace(/\s+/g, ' ').trim();
    if (limit && s.length > limit) s = s.slice(0, limit);
    return s;
  }

  const tsOf = (iso) => {
    const t = Date.parse(iso || '');
    return Number.isFinite(t) ? t : 0;
  };

  /** 毫秒 → 'YYYY-MM-DD HH:MM:SS'（本地时区，给人看的水位线） */
  function stampText(ms) {
    if (!ms) return '—';
    const d = new Date(ms);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }

  /* ------------------------------------------------------------
   * 13.3 候选池同步（增量 + 自动清理失效）
   * ---------------------------------------------------------- */

  function topicRecord(it) {
    return {
      id: it.id,
      title: it.title || '',
      kind: it.kind || '',
      text: plainText(it.excerpt || '', SUPER_EXCERPT_CHARS),
      authorId: it.author?.id || '',
      authorName: it.author?.username || '',
      replyCount: Number(it.replyCount ?? 0),
      viewCount: Number(it.viewCount ?? 0),
      likeCount: typeof it.likeCount === 'number' ? it.likeCount : null,
      bookmarkCount: typeof it.bookmarkCount === 'number' ? it.bookmarkCount : null,
      tags: Array.isArray(it.tags) ? it.tags.map((t) => t?.slug || '').filter(Boolean) : [],
      createdAt: it.createdAt || '',
      lastActivityAt: it.lastActivityAt || it.createdAt || '',
      _t: tsOf(it.createdAt),
      _a: tsOf(it.lastActivityAt || it.createdAt),
    };
  }

  function replyRecord(p, topic) {
    return {
      id: p.id,
      topicId: p.topicId || topic?.id || '',
      topicTitle: topic?.title || '',
      postNumber: Number(p.postNumber ?? 0),
      text: plainText(p.cookedHtml || '', SUPER_REPLY_CHARS),
      authorId: p.author?.id || '',
      authorName: p.author?.username || '',
      likeCount: Number(p.likeCount ?? 0),
      createdAt: p.createdAt || '',
      deleted: !!p.deleted,
      _t: tsOf(p.createdAt),
    };
  }

  /** 主题被删 → 连它的回复一起清掉 */
  function dropTopic(topicId) {
    const pool = loadSuperPool();
    delete pool.topics[topicId];
    for (const [rid, r] of Object.entries(pool.replies)) {
      if (r.topicId === topicId) delete pool.replies[rid];
    }
  }

  /** 回复被删（deleted=true 或整篇列表里消失）→ 从池子里剔掉 */
  function dropReply(replyId) {
    delete loadSuperPool().replies[replyId];
  }

  /**
   * 同步候选池（增量）。
   * @param {{onProgress?:(st:object)=>void, force?:boolean}} opts
   */
  async function syncSuperPool(opts) {
    const options = opts || {};
    const pool = loadSuperPool();
    if (superSyncing) return { skipped: true };
    superSyncing = true;
    superSyncError = '';
    const st = { pages: 0, topics: 0, replies: 0, removed: 0, done: false, error: '' };
    const report = () => {
      if (options.onProgress) options.onProgress({ ...st });
    };
    try {
      // deep=true：无视水位线截断，翻满设定页数（把更老的历史主题也收进池子）
      // —— 设置里改「候选池深度」后要的就是这个。
      const deep = !!options.deep;
      const wm = options.force ? 0 : pool.watermark || 0;
      const touched = new Map(); // topicId -> 主题记录（有新活动，需要补回复）
      let cursor = null;
      let maxSeen = wm;

      const maxPages = clampInt(settings.superPoolPages, 1, 30, SUPER_TOPIC_PAGES);
      for (let page = 0; page < maxPages; page++) {
        const data = await apiGet('/topics', { limit: PAGE_LIMIT, sort: 'latest', cursor });
        const items = data.items || [];
        if (!items.length) break;
        let newer = false;
        for (const it of items) {
          if (!it || !it.id) continue;
          const rec = topicRecord(it);
          if (rec._a >= wm) {
            newer = true;
            if (rec._a > maxSeen) maxSeen = rec._a;
          }
          const prev = pool.topics[rec.id];
          if (!prev) {
            pool.topics[rec.id] = rec;
            st.topics++;
            // 新主题：它下面的回复也要拉（池子里的回复才算全）
            if (rec._a >= wm) touched.set(rec.id, rec);
          } else {
            const changed =
              rec.replyCount !== prev.replyCount || rec._a > prev._a || rec.lastActivityAt !== prev.lastActivityAt;
            pool.topics[rec.id] = { ...prev, ...rec };
            if (changed && rec._a >= wm) touched.set(rec.id, pool.topics[rec.id]);
          }
        }
        st.pages++;
        report();
        cursor = data.pageInfo && data.pageInfo.nextCursor ? data.pageInfo.nextCursor : null;
        if (!cursor) break;
        // 整页都是旧内容 → 后面不会再有新的了（deep 模式不截断，继续往历史里翻）
        if (!newer && !deep) {
          cursor = null;
          break;
        }
      }

      // 有新活动的帖子：增量补回复（只收比水位线新的；顺带发现被删的）
      // 请求量控制：一次最多给 SUPER_REPLY_TOPICS 个帖子补回复，且优先最近活跃的
      const toSync = [...touched.values()]
        .filter((t) => t.replyCount > 0)
        .sort((a, b) => b._a - a._a)
        .slice(0, SUPER_REPLY_TOPICS);
      for (const topic of toSync) {
        try {
          const r = await syncTopicReplies(topic, wm);
          st.replies += r.added;
          st.removed += r.removed;
        } catch (err) {
          if (err && err.status === 404) {
            dropTopic(topic.id);
            st.removed++;
          }
        }
        report();
      }

      pool.watermark = Math.max(pool.watermark || 0, maxSeen);
      saveSuperPool();

      // 失效清理：自动做（之前手动点「清理失效」会一直卡住）
      const pruned = await autoPruneSuperPool();
      st.removed += pruned.removed;

      st.done = true;
      report();
      return st;
    } catch (err) {
      superSyncError = (err && err.message) || String(err);
      st.error = superSyncError;
      report();
      return st;
    } finally {
      superSyncing = false;
    }
  }

  /**
   * 补某个主题的回复：只收比水位线新的；整篇列完还缺的那些 = 已被删 → 剔除。
   */
  async function syncTopicReplies(topic, wm) {
    const pool = loadSuperPool();
    let cursor = null;
    let added = 0;
    let removed = 0;
    const seen = new Set();
    let complete = false;

    for (let page = 0; page < SUPER_POST_PAGES; page++) {
      const data = await apiGet('/topics/' + encodeURIComponent(topic.id) + '/posts', {
        limit: PAGE_LIMIT,
        sort: 'latest',
        cursor,
      });
      const items = data.items || [];
      const flat = [];
      const walk = (arr) => {
        for (const p of arr || []) {
          if (!p || !p.id) continue;
          flat.push(p);
          if (Array.isArray(p.children)) walk(p.children);
        }
      };
      walk(items);

      for (const p of flat) {
        seen.add(p.id);
        if (p.deleted) {
          if (pool.replies[p.id]) {
            dropReply(p.id);
            removed++;
          }
          continue;
        }
        const rec = replyRecord(p, topic);
        if (rec._t < wm) continue; // 水位线之前的：早就加载过了
        if (!pool.replies[rec.id]) {
          pool.replies[rec.id] = rec;
          added++;
        } else {
          pool.replies[rec.id] = { ...pool.replies[rec.id], ...rec };
        }
      }

      cursor = data.pageInfo && data.pageInfo.nextCursor ? data.pageInfo.nextCursor : null;
      if (!cursor) {
        complete = true;
        break;
      }
    }

    // 完整列过一遍：缓存里这条主题的回复不在列表里 → 已被删
    if (complete) {
      for (const [rid, r] of Object.entries(pool.replies)) {
        if (r.topicId === topic.id && !seen.has(rid)) {
          delete pool.replies[rid];
          removed++;
        }
      }
    }
    return { added, removed };
  }

  /**
   * 自动清理失效条目：抽查主题，确认是不是已经被删（404）。
   * 一次全量几百个请求太重（之前手动点「清理失效」就是卡在这儿），所以改成
   * **每轮只抽查 SUPER_PRUNE_SAMPLE 个、轮着来**（并发 6），这样每轮请求量恒定，
   * 池子里的老条目也会被逐轮覆盖到。
   */
  async function autoPruneSuperPool(opts) {
    const options = opts || {};
    const pool = loadSuperPool();
    const st = { checked: 0, removed: 0, done: false };
    const report = () => {
      if (options.onProgress) options.onProgress({ ...st });
    };
    const topics = Object.values(pool.topics).sort((a, b) => b._a - a._a);
    if (!topics.length) {
      st.done = true;
      return st;
    }
    // 轮转抽查：这一轮从上次的位置接着往后数
    const size = Math.min(SUPER_PRUNE_SAMPLE, topics.length);
    const start = (pool.pruneOffset || 0) % topics.length;
    const list = [];
    for (let i = 0; i < size; i++) list.push(topics[(start + i) % topics.length]);
    pool.pruneOffset = (start + size) % topics.length;
    pool.lastPruneAt = Date.now();

    let idx = 0;
    const worker = async () => {
      while (idx < list.length) {
        const t = list[idx++];
        try {
          await apiGet('/topics/' + encodeURIComponent(t.id));
        } catch (err) {
          if (err && err.status === 404) {
            dropTopic(t.id);
            st.removed++;
          }
        }
        st.checked++;
      }
    };
    await Promise.all(Array.from({ length: Math.min(SUPER_PRUNE_WORKERS, list.length) }, worker));

    saveSuperPool();
    st.done = true;
    report();
    return st;
  }

  /* ------------------------------------------------------------
   * 13.4 关键词匹配（严格 / 宽松）
   * ---------------------------------------------------------- */

  /**
   * 查询语法：
   *   普通词        —— 严格模式下必须全部命中；宽松模式下任意一个命中即可
   *   "整段短语"    —— 必须原样出现
   *   -词           —— 排除
   *   title:词      —— 只在标题里找
   *   author:词     —— 只在作者名里找
   *   in:topic / in:reply —— 限定范围
   */
  function parseSuperQuery(raw) {
    const q = String(raw || '').trim();
    const terms = [];
    const phrases = [];
    let scope = 'all';
    if (!q) return { terms, phrases, scope, empty: true };

    // 先把引号里的短语抠出来
    let rest = q;
    const re = /"([^"]+)"|“([^”]+)”/g;
    let m;
    while ((m = re.exec(q)) !== null) {
      const p = (m[1] || m[2] || '').trim();
      if (p) phrases.push(p.toLowerCase());
    }
    rest = rest.replace(/"([^"]+)"|“([^”]+)”/g, ' ');

    for (const rawTok of rest.split(/\s+/)) {
      const tok = rawTok.trim();
      if (!tok) continue;
      let negate = false;
      let t = tok;
      if (t.startsWith('-') && t.length > 1) {
        negate = true;
        t = t.slice(1);
      }
      let field = 'any';
      const fm = /^(title|author|in):(.+)$/i.exec(t);
      if (fm) {
        field = fm[1].toLowerCase();
        t = fm[2];
        if (field === 'in') {
          scope = /reply|comment/i.test(t) ? 'reply' : 'topic';
          continue;
        }
      }
      if (!t) continue;
      terms.push({ text: t.toLowerCase(), field, negate });
    }
    return { terms, phrases, scope, empty: !terms.length && !phrases.length };
  }

  const has = (hay, needle) => !!needle && hay.toLowerCase().includes(needle);

  /**
   * 单条候选（主题或回复）是否命中 + 打分。
   * mode='strict'：所有词都要命中；mode='loose'：任意一个词命中即可（命中越多分越高）。
   */
  function matchSuperItem(item, q, mode) {
    const title = (item.title || '').toLowerCase();
    const body = (item.text || '').toLowerCase();
    const author = (item.authorName || '').toLowerCase();
    let score = 0;
    let hitCount = 0;

    for (const term of q.terms) {
      let hit = false;
      let bonus = 0;
      if (term.field === 'title') {
        hit = has(title, term.text);
        bonus = 60;
      } else if (term.field === 'author') {
        hit = has(author, term.text);
        bonus = 40;
      } else {
        hit = has(title, term.text) || has(body, term.text) || has(author, term.text);
        bonus = has(title, term.text) ? 50 : has(body, term.text) ? 12 : 6;
      }
      if (term.negate) {
        if (hit) return null; // 排除词命中 → 整条出局
      } else {
        if (hit) {
          hitCount++;
          score += bonus;
        } else if (mode === 'strict') {
          return null; // 严格：所有词都要命中
        }
      }
    }

    for (const p of q.phrases) {
      if (!(has(title, p) || has(body, p))) return null;
      score += has(title, p) ? 200 : 40;
    }

    if (!q.terms.length && !q.phrases.length) return null;
    if (mode === 'loose' && hitCount === 0) return null;

    // 整串完全等于标题 → 最高分
    const whole = q.terms.map((t) => t.text).join(' ');
    if (whole && title === whole) score += 1000;
    // 越新越靠前（最多 +20）
    const age = Date.now() - (item._t || 0);
    score += Math.max(0, 20 - Math.floor(age / 86400000));
    return score;
  }

  /** 在池子里搜 */
  function searchSuperPool(rawQuery, opts) {
    const options = opts || {};
    const pool = loadSuperPool();
    const q = parseSuperQuery(rawQuery);
    const mode = options.mode || superState.mode || 'strict';
    if (q.empty) {
      return { query: rawQuery, parsed: q, items: [], total: 0, scope: q.scope, mode, watermark: pool.watermark };
    }

    const scope = options.scope && options.scope !== 'all' ? options.scope : q.scope;
    const hits = [];
    let total = 0;

    const consider = (item, type) => {
      if (scope === 'topic' && type !== 'topic') return;
      if (scope === 'reply' && type !== 'reply') return;
      const score = matchSuperItem(item, q, mode);
      if (score === null) return;
      total++;
      hits.push({
        type,
        id: item.id,
        topicId: type === 'reply' ? item.topicId : item.id,
        postNumber: type === 'reply' ? item.postNumber : null,
        title: type === 'reply' ? item.topicTitle : item.title,
        text: item.text || '',
        authorId: item.authorId || '',
        authorName: item.authorName || '',
        createdAt: item.createdAt || '',
        replyCount: type === 'topic' ? item.replyCount : null,
        viewCount: type === 'topic' ? item.viewCount : null,
        likeCount: type === 'topic' ? item.likeCount : null,
        bookmarkCount: type === 'topic' ? item.bookmarkCount : null,
        tags: type === 'topic' ? item.tags : null,
        score,
        _t: item._t || 0,
      });
    };

    for (const t of Object.values(pool.topics)) consider(t, 'topic');
    for (const r of Object.values(pool.replies)) consider(r, 'reply');

    // 命中的是回复时，统计数据取所属帖子的（池子里可能没有那个帖）
    for (const h of hits) {
      if (h.type !== 'reply') continue;
      const t = pool.topics[h.topicId];
      if (t) {
        h.replyCount = t.replyCount;
        h.viewCount = t.viewCount;
        h.likeCount = t.likeCount;
        h.bookmarkCount = t.bookmarkCount;
        h.tags = t.tags;
      }
    }

    const sort = options.sort || superState.sort || 'relevance';
    const num = (v) => (typeof v === 'number' ? v : -1);
    hits.sort((a, b) => {
      switch (sort) {
        case 'latest':
          return b._t - a._t;
        case 'earliest':
          return a._t - b._t;
        case 'views':
          return num(b.viewCount) - num(a.viewCount);
        case 'likes':
          return num(b.likeCount) - num(a.likeCount);
        case 'replies':
          return num(b.replyCount) - num(a.replyCount);
        case 'bookmarks':
          return num(b.bookmarkCount) - num(a.bookmarkCount);
        case 'hot':
          return num(b.replyCount) * 2 + num(b.likeCount) - (num(a.replyCount) * 2 + num(a.likeCount));
        default:
          return b.score - a.score || b._t - a._t;
      }
    });

    const limit = options.limit || SUPER_RESULT_MAX;
    return {
      query: rawQuery,
      parsed: q,
      items: hits.slice(0, limit),
      total,
      scope,
      mode,
      sort,
      watermark: pool.watermark,
      poolTopics: Object.keys(pool.topics).length,
      poolReplies: Object.keys(pool.replies).length,
    };
  }

  /* ------------------------------------------------------------
   * 13.5 渲染
   * ---------------------------------------------------------- */

  /** 关键词高亮（转义后再插 <mark>） */
  function highlightSuper(text, q) {
    const s = String(text || '');
    if (!s) return '';
    let html = esc(s);
    const needles = [];
    for (const p of q.phrases || []) if (p) needles.push(p);
    for (const t of (q.terms || [])) if (t && !t.negate && t.text) needles.push(t.text);
    if (!needles.length) return html;
    // 长词先替，避免短词把长词切碎
    const uniq = [...new Set(needles)].sort((a, b) => b.length - a.length);
    for (const n of uniq) {
      const safe = esc(n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      html = html.replace(new RegExp('(' + safe + ')', 'gi'), '<mark class="px-mark">$1</mark>');
    }
    return html;
  }

  /** 命中处上下文片段 */
  function snippetSuper(text, q, radius) {
    const s = String(text || '');
    if (!s) return '';
    const needles = [];
    for (const p of q.phrases || []) if (p) needles.push(p);
    for (const t of (q.terms || [])) if (t && !t.negate && t.text) needles.push(t.text);
    const low = s.toLowerCase();
    let at = -1;
    for (const n of needles) {
      const i = low.indexOf(n);
      if (i >= 0 && (at < 0 || i < at)) at = i;
    }
    const r = radius || 60;
    if (at < 0) return s.slice(0, r * 2);
    const start = Math.max(0, at - r);
    const end = Math.min(s.length, at + r);
    return (start > 0 ? '…' : '') + s.slice(start, end) + (end < s.length ? '…' : '');
  }

  const SUPER_SORTS = [
    ['relevance', '相关度'],
    ['latest', '最新'],
    ['earliest', '最早'],
    ['views', '最多浏览'],
    ['likes', '最多点赞'],
    ['replies', '最多回复'],
    ['bookmarks', '最多收藏'],
    ['hot', '最热'],
  ];

  /** 把命中项转成站点卡片结构（复用 08-cards 的 cardHTML，风格与首页帖子一致） */
  function superCardModel(hit) {
    const isReply = hit.type === 'reply';
    return {
      id: isReply ? hit.topicId : hit.id,
      title: hit.title,
      excerpt: '',
      author: { id: hit.authorId, username: hit.authorName },
      replyCount: hit.replyCount ?? 0,
      viewCount: hit.viewCount ?? 0,
      likeCount: hit.likeCount,
      bookmarkCount: hit.bookmarkCount,
      createdAt: hit.createdAt,
      editedAt: null,
      lastActivityAt: hit.createdAt,
      tags: (hit.tags || []).map((slug) => ({ slug, name: slug })),
      pinned: false,
      matchPostNumber: isReply ? hit.postNumber : null,
      pxKindLabel: isReply ? `回复 · 第 ${hit.postNumber} 楼` : '帖子',
    };
  }

  function superPanelHTML(q) {
    const sortChips = SUPER_SORTS.map(
      ([k, label]) => `<button type="button" data-px-super-sort="${k}" class="px-super-chip">${esc(label)}</button>`
    ).join('');
    return `<div class="px-super-head">
        <div class="px-super-brand"><span class="px-super-logo">⚡</span><span>Super 搜索</span></div>
        <div class="px-super-sub">严格 / 宽松关键词匹配 · 本地候选池增量缓存</div>
      </div>
      <div class="px-super-searchbar">
        <span class="px-super-keyword">关键词</span>
        <span class="px-super-keyword-value" data-px-super-keyword>${esc(q || '（在站内搜索框输入）')}</span>
        <span class="px-super-hint">用站点的搜索框输入关键词，这里用候选池做严格检索</span>
      </div>
      <div class="px-super-chips">
        <button type="button" data-px-super-scope="all" class="px-super-chip">全部</button>
        <button type="button" data-px-super-scope="topic" class="px-super-chip">只看帖子</button>
        <button type="button" data-px-super-scope="reply" class="px-super-chip">只看回复</button>
        <span class="px-super-sep"></span>
        <button type="button" data-px-super-mode="strict" class="px-super-chip">严格匹配</button>
        <button type="button" data-px-super-mode="loose" class="px-super-chip">宽松匹配</button>
        <span class="px-super-sep"></span>
        ${sortChips}
      </div>
      <div class="px-super-status" data-px-super-status></div>
      <div class="px-super-results" data-px-super-results aria-live="polite"></div>`;
  }

  /* ------------------------------------------------------------
   * 13.6 挂载
   * ---------------------------------------------------------- */

  function superStatusText(res) {
    const pool = loadSuperPool();
    const bits = [];
    if (superStatus) bits.push(superStatus);
    bits.push(`命中 ${res.total}`);
    if (res.items.length) bits.push(`显示 ${res.items.length}`);
    bits.push(`池子 ${Object.keys(pool.topics).length} 帖 / ${Object.keys(pool.replies).length} 回复`);
    bits.push(`已同步至 ${stampText(pool.watermark)}`);
    if (superSyncError) bits.push(`⚠ ${superSyncError}`);
    return bits.join(' · ');
  }

  function renderSuperResults(force) {
    const host = superState.host;
    if (!host) return;
    const q = new URLSearchParams(location.search).get('q') || '';
    const res = searchSuperPool(q, { scope: superState.scope, sort: superState.sort, mode: superState.mode });
    // 内容没变就别重画：重画会把鼠标底下的卡片换掉，悬停时看起来一直在闪
    const sig = [
      q,
      superState.scope,
      superState.sort,
      superState.mode,
      res.total,
      res.items.length,
      res.watermark,
      Object.keys(loadSuperPool().topics).length,
      Object.keys(loadSuperPool().replies).length,
    ].join('|');
    if (!force && sig === superState.renderSig) {
      const st = host.querySelector('[data-px-super-status]');
      if (st) st.textContent = superStatusText(res);
      return;
    }
    superState.renderSig = sig;
    const status = host.querySelector('[data-px-super-status]');
    const list = host.querySelector('[data-px-super-results]');
    const kw = host.querySelector('[data-px-super-keyword]');
    if (kw) kw.textContent = q || '（在站内搜索框输入）';
    if (status) status.textContent = superStatusText(res);
    // chip 选中态
    for (const b of host.querySelectorAll('[data-px-super-scope]')) {
      b.dataset.active = String(b.dataset.pxSuperScope === superState.scope);
    }
    for (const b of host.querySelectorAll('[data-px-super-mode]')) {
      b.dataset.active = String(b.dataset.pxSuperMode === superState.mode);
    }
    for (const b of host.querySelectorAll('[data-px-super-sort]')) {
      b.dataset.active = String(b.dataset.pxSuperSort === superState.sort);
    }
    if (!list) return;
    if (res.parsed.empty) {
      list.innerHTML = `<div class="px-super-empty">在站点的搜索框里输入关键词，这里会用候选池做严格检索</div>`;
      return;
    }
    if (!res.items.length) {
      list.innerHTML = `<div class="px-super-empty">没有命中。可以切「宽松匹配」，或等候选池同步到更新内容。</div>`;
      return;
    }
    const shell = nativeCardShell('search');
    list.innerHTML = res.items
      .map((h) => {
        const model = superCardModel(h);
        const snip = snippetSuper(h.text, res.parsed, 90);
        // 命中片段带高亮（pxSnippetHtml 是已转义 + <mark> 的 HTML，不再二次转义）
        model.pxSnippetHtml = highlightSuper(snip, res.parsed);
        return cardHTML(model, 'createdAt', shell, 'search');
      })
      .join('');
  }

  /** 只更新状态行，不动结果列表（同步进度刷新时用，避免把鼠标底下的卡片换掉） */
  function updateSuperStatus(host) {
    if (!host) return;
    const st = host.querySelector('[data-px-super-status]');
    if (!st) return;
    const q = new URLSearchParams(location.search).get('q') || '';
    const res = searchSuperPool(q, { scope: superState.scope, sort: superState.sort, mode: superState.mode });
    st.textContent = superStatusText(res);
  }

  /** 只做一次性的标记绑定；真正的点击走 document 级委托（40-events.js） */
  function superBind(host) {
    if (!host || host.dataset.pxBound === '1') return;
    host.dataset.pxBound = '1';
  }

  /** 搜索页接管：把站内结果区换成 Super 搜索面板 */
  function mountSuperSearch(anchor) {
    if (!anchor) return false;
    let host = document.getElementById(SUPER_ID);
    if (!host) {
      host = document.createElement('div');
      host.id = SUPER_ID;
    }
    host.className = 'px-super';
    if (!host.dataset.pxBuilt) {
      host.innerHTML = superPanelHTML('');
      host.dataset.pxBuilt = '1';
    }
    const q = new URLSearchParams(location.search).get('q') || '';
    if (superState.urlQ !== q) {
      superState.urlQ = q;
      const kw = host.querySelector('[data-px-super-keyword]');
      if (kw) kw.textContent = q || '（在站内搜索框输入）';
    }
    // 已经在正确位置就别再挪 —— 移动节点会打断鼠标悬停（看起来就是卡片在闪）
    const inPlace = host.isConnected && host.nextElementSibling === anchor && host.parentElement === anchor.parentElement;
    if (!inPlace) {
      if (anchor.parentElement) anchor.parentElement.insertBefore(host, anchor);
      else anchor.insertAdjacentElement('beforebegin', host);
    }
    superState.host = host;
    superState.mounted = true;
    superBind(host);
    // 不强制重画：内容没变就别动 DOM（强制重画会把鼠标底下的卡片换掉 → 悬停时闪烁）
    renderSuperResults();

    // 候选池自动更新：进面板就同步一次（增量），失效条目同步清掉
    const pool = loadSuperPool();
    const stale = !pool.updatedAt || Date.now() - pool.updatedAt > 5 * 60 * 1000;
    if (stale && !superSyncing) {
      superStatus = '正在同步候选池…';
      renderSuperResults();
      syncSuperPool({
        onProgress: (st) => {
          superStatus = st.done
            ? `已同步 ${st.pages} 页 · 新增 ${st.topics} 帖 / ${st.replies} 回复 · 清理失效 ${st.removed} 条`
            : `正在同步候选池…（${st.pages} 页）`;
          superState.host = host;
          updateSuperStatus(host); // 只刷状态行，别重画列表
        },
      }).then(() => {
        // 同步结束再整体重画一次（同步过程中只刷状态行，不动列表 → 鼠标底下的卡片不会被换掉）
        superStatus = '';
        superState.host = host;
        renderSuperResults(true);
      });
    }
    return true;
  }

  function unmountSuperSearch() {
    const host = document.getElementById(SUPER_ID);
    if (host) {
      host.remove();
      superState.mounted = false;
      superState.host = null;
      superState.urlQ = '';
      superState.renderSig = '';
    }
  }

  /**
   * 设置里改「候选池深度」后立刻生效：深挖一轮，把更老的历史主题也收进池子。
   * （普通同步是增量的，只收水位线之后的新内容；深挖才会往历史里翻。）
   */
  function refreshSuperPoolNow(opts) {
    const options = opts || {};
    const host = superState.host;
    superStatus = '正在按新深度刷新候选池…';
    if (host) updateSuperStatus(host);
    return syncSuperPool({
      deep: true,
      onProgress: (st) => {
        superStatus = st.done
          ? `已刷新 ${st.pages} 页 · 新增 ${st.topics} 帖 / ${st.replies} 回复 · 清理失效 ${st.removed} 条`
          : `正在按新深度刷新候选池…（${st.pages} 页）`;
        superState.host = host;
        if (host) updateSuperStatus(host);
      },
    }).then((st) => {
      superStatus = '';
      superState.host = host;
      renderSuperResults(true);
      return st;
    });
  }

  /**
   * 把 Super 候选池里已经缓存好的主题，转换成排序候选池能直接用的条目。
   * 首页 / 板块页的排序池（最新 / 最早 / 最多浏览…）可以白捡这些数据：
   * 本地已经有了，就不用再翻一次接口。
   */
  function superCachedTopics() {
    const pool = loadSuperPool();
    return Object.values(pool.topics).map((rec) => ({
      id: rec.id,
      title: rec.title,
      excerpt: rec.text,
      author: { id: rec.authorId, username: rec.authorName },
      replyCount: rec.replyCount,
      viewCount: rec.viewCount,
      likeCount: rec.likeCount,
      bookmarkCount: rec.bookmarkCount,
      createdAt: rec.createdAt,
      editedAt: null,
      lastActivityAt: rec.lastActivityAt,
      tags: (rec.tags || []).map((slug) => ({ slug, name: slug })),
      pinned: false,
      kind: rec.kind,
      _t: rec._t,
      _a: rec._a,
    }));
  }

  function initSuperSearch() {
    loadSuperUI();
  }
