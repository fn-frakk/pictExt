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
      desc: '「最新 / 最早 / 最多浏览 / 点赞 / 回复 / 收藏」都是在候选池里排的。这里设最新链先翻几页（每页 50 条，1-100 页）。设大能覆盖更多帖子，配合「深翻并发加速」也不会太慢。',
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
      key: 'poolRenderChunk',
      type: 'number',
      min: 10,
      max: 100,
      label: '候选池：每次多显示几条',
      desc: '点「再多看几条」一次多放几张卡出来（10-100，默认 20）。设小一点更省内存，设大一点一屏能看更多。',
    },
    {
      key: 'latestByCreated',
      type: 'switch',
      label: '「最新」按发布时间',
      desc:
        '开着：候选池里按帖子发布时间重排，刚发出来的排最前（默认）。关掉：用站内 sort=latest 的原生顺序 —— 它其实是按「最后活跃时间」，老帖被人回复一句就会被顶到前面。',
    },
    {
      key: 'poolParallel',
      type: 'switch',
      label: '深翻并发加速',
      desc:
        '候选池页数设得很大时（比如各 100 页），把要翻的页按活跃时间点切成几段同时拉，墙钟时间大约缩到 1/4～1/6。游标读不懂或请求失败会自动退回一页一页串行，不会出错。',
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
    {
      key: 'showStats',
      type: 'switch',
      label: '首页「PICKCAT 数据统计」卡片',
      desc:
        '在首页加一张可折叠的统计卡片（帖子发布 / 回复热度两张图，仿编程猫统计风格）。默认关。开启后卡片默认也是收起的，点开才去读数据；抓取是独立低优先级的，站点推荐流照常加载，互不干扰。结果在本机缓存 24 小时。',
    },
    {
      key: 'superPoolPages',
      type: 'number',
      min: 1,
      max: 30,
      label: 'Super 搜索：候选池深度',
      desc:
        '每次同步候选池时翻几页主题（每页 50 条，1-30）。池子越大，能搜到的老帖越多；同步只拉「水位线之后」的新内容，不会重复翻老页。',
    },
    {
      key: 'superSearch',
      type: 'switch',
      label: 'Super 搜索（严格匹配）',
      desc:
        '把站内那套模糊搜索换掉：搜索页直接显示 Super 面板（任何页面按 Ctrl/⌘+K 也能唤出）。所有关键词都要命中才算结果，支持「精确短语」、-排除、title: / author: 限定；结果来自本地候选池，按时间水位线增量拉取，帖子或回复被删会自动从池里剔除。',
    },
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
    if (detailScope()) processDetail();
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
