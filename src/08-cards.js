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
    // Super 搜索会自己指定标签文案（pxKindLabel：「帖子」/「回复 · 第 N 楼」）
    const isCommentHit =
      t.matchPostNumber !== null && t.matchPostNumber !== undefined && Number(t.matchPostNumber) > 1;
    const kindBadge =
      kind === 'search'
        ? `<span class="px-kind" data-kind="${isCommentHit ? 'comment' : 'topic'}">${esc(
            t.pxKindLabel || (isCommentHit ? `评论 · 第 ${t.matchPostNumber} 楼` : '帖子')
          )}</span>`
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
        ${
          t.pxSnippetHtml
            ? `<p class="mt-0.5 line-clamp-2 text-[13px] leading-[1.55] text-muted desktop:text-sm">${t.pxSnippetHtml}</p>`
            : t.excerpt
            ? `<p class="mt-0.5 line-clamp-2 text-[13px] leading-[1.55] text-muted desktop:text-sm">${esc(t.excerpt)}</p>`
            : ''
        }
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
