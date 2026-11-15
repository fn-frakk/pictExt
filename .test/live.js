/** 真实接口联调：用线上数据跑一遍渲染，确认字段、排序、条目数都对 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const SCRIPT = fs.readFileSync(path.join(__dirname, '..', 'dist', 'content.js'), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const realFetch = globalThis.fetch;

const HOME_HTML = `<!doctype html><html><head></head><body>
<div id="__nuxt"><main><section class="min-w-0 flex-1 pt-3">
  <div role="group" aria-label="首页列表控制" class="mb-3">
    <div role="group" aria-label="首页排序"><div role="tablist">
      <button role="tab">关注</button><button role="tab">推荐</button><button role="tab">最新</button>
    </div></div>
  </div>
  <section aria-label="推荐帖子"><article>native</article></section>
</section></main></div></body></html>`;

(async () => {
  let cookiesSent = 0;
  const dom = new JSDOM(HOME_HTML, {
    url: 'https://pickcat.dao3.fun/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.localStorage.setItem('pictExt:settings:v1', JSON.stringify({ sortMode: 'replace', useSession: false }));
      window.fetch = async (url, init) => {
        if (init && init.credentials !== 'omit') cookiesSent++;
        return realFetch(url, { method: init.method, headers: init.headers });
      };
    },
  });
  const { window } = dom;
  window.eval(SCRIPT);
  await sleep(600);

  const doc = window.document;
  console.log('面板:', !!doc.getElementById('pictExt-panel'));

  for (const key of ['latest', 'views', 'likes', 'replies', 'bookmarks', 'hot', 'following', 'recommended']) {
    const btn = doc.querySelector(`[data-sort="${key}"]`);
    if (!btn) {
      console.log(`\n[${key}] 面板里没有这一项`);
      continue;
    }
    btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await sleep(4500);
    const cards = [...doc.querySelectorAll('#pictExt-panel .px-list article')];
    const note = doc.querySelector('#pictExt-panel .px-note').textContent;
    const first = cards[0];
    console.log(`\n[${key}] 卡片 ${cards.length} 张 | ${note}`);
    if (first) {
      const stats = [...first.querySelectorAll('ul[aria-label="帖子数据"] li')].map((li) => li.textContent.trim()).join(' · ');
      console.log('  首条:', first.querySelector('h2').textContent.trim().slice(0, 26), '|', stats);
    }
  }

  // ---- 搜索页：真实关键词 ----
  console.log('\n===== 搜索页 q=Box =====');
  const searchDom = new JSDOM(
    `<!doctype html><html><body><div id="__nuxt"><main><section>
      <div aria-label="帖子搜索结果"><article>native</article></div>
      <nav aria-label="帖子搜索分页"><button>下一页</button></nav>
    </section></main></div></body></html>`,
    {
      url: 'https://pickcat.dao3.fun/search?q=Box',
      runScripts: 'outside-only',
      pretendToBeVisual: true,
      beforeParse(w) {
        w.localStorage.setItem('pictExt:settings:v1', JSON.stringify({ sortMode: 'replace', useSession: false }));
        w.fetch = async (url, init) => {
          if (init && init.credentials !== 'omit') cookiesSent++;
          return realFetch(url, { method: init.method, headers: init.headers });
        };
      },
    }
  );
  const sw = searchDom.window;
  sw.eval(SCRIPT);
  await sleep(600);
  const sdoc = sw.document;
  for (const key of ['latest', 'likes', 'bookmarks']) {
    sdoc.querySelector(`[data-sort="${key}"]`).dispatchEvent(new sw.MouseEvent('click', { bubbles: true }));
    await sleep(key === 'likes' ? 9000 : 4000);
    const cards = [...sdoc.querySelectorAll('#pictExt-panel .px-list article')];
    console.log(`[搜索/${key}] 卡片 ${cards.length} 张 | ${sdoc.querySelector('#pictExt-panel .px-note').textContent}`);
    if (cards[0]) {
      const stats = [...cards[0].querySelectorAll('ul[aria-label="帖子数据"] li')].map((li) => li.textContent.trim()).join(' · ');
      console.log('  首条:', cards[0].querySelector('h2').textContent.trim().slice(0, 26), '|', stats);
    }
  }

  // ---- 帖子详情页：真实帖子的信息条 + 折叠 ----
  console.log('\n===== 帖子详情页（真实数据）=====');
  const latest = await (await realFetch('https://pickcat.dao3.fun/api/v1/topics?limit=1&sort=latest')).json();
  const realId = latest.items[0].id;
  const detailDom = new JSDOM(
    `<!doctype html><html><body><div id="__nuxt"><main>
      <section id="comments" class="mt-12">
        <div class="min-w-0"><div class="flex"><h2>全部评论</h2>
          <div aria-label="评论排序"><div role="tablist"><button role="tab">最热</button></div></div>
        </div></div>
        <article aria-label="某人 的评论" class="min-w-0 py-4">
          <div data-post-id="p1" class="grid"><div>首楼</div></div>
          <div class="post-comment-replies"><div data-post-id="a1">A</div><div data-post-id="a2">B</div><div data-post-id="a3">C</div></div>
        </article>
      </section></main></div></body></html>`,
    {
      url: 'https://pickcat.dao3.fun/forum/post/' + realId,
      runScripts: 'outside-only',
      pretendToBeVisual: true,
      beforeParse(w) {
        w.localStorage.setItem('pictExt:settings:v1', JSON.stringify({ commentSortMode: 'replace' }));
        w.fetch = async (url, init) => {
          if (init && init.credentials !== 'omit') cookiesSent++;
          return realFetch(url, { method: init.method, headers: init.headers });
        };
      },
    }
  );
  detailDom.window.eval(SCRIPT);
  await sleep(3500);
  const ddoc = detailDom.window.document;
  console.log('信息条:', ddoc.querySelector('[data-px-topic-info]')?.textContent.trim().slice(0, 140));
  const dbox = ddoc.querySelector('.post-comment-replies');
  const dbtn = ddoc.querySelector('[data-px-thread-toggle]');
  console.log('楼中楼默认折叠:', dbox && dbox.style.display === 'none', '| 按钮:', dbtn && dbtn.textContent.trim());
  console.log('全局按钮:', ddoc.querySelector('[data-px-global-toggle]')?.textContent.trim());
  console.log('\n非 omit 请求数:', cookiesSent);
  process.exit(0);
})();
