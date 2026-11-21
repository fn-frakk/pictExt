/**
 * 真站点端到端验证：Super 搜索在真实 API 上的表现（只读、低频）。
 * 用法：node .test/live-super.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const SCRIPT = fs.readFileSync(path.join(__dirname, '..', 'dist', 'content.js'), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ORIGIN = 'https://pickcat.dao3.fun';

const HTML = `<!doctype html><html><head></head><body><div id="__nuxt"><main>
  <div class="contents">
    <section class="min-w-0"><div class="space-y-5"><section aria-label="帖子">
      <div aria-label="帖子搜索结果" class="search-forum-results"><article>原生搜索结果</article></div>
      <nav aria-label="帖子搜索分页"><button>下一页</button></nav>
    </section></div></section>
  </div>
</main></div></body></html>`;

(async () => {
  const calls = [];
  const dom = new JSDOM(HTML, {
    url: ORIGIN + '/search?q=pickcat',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.fetch = async (url, init) => {
        calls.push(String(url));
        return fetch(url, init);
      };
    },
  });
  dom.window.eval(SCRIPT);
  const doc = dom.window.document;

  await sleep(1000);
  // 手动触发同步（自动同步 400ms 后也会跑，这里等它跑完）
  const btn = doc.querySelector('[data-px-super-sync]');
  if (btn) btn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  await sleep(25000);

  const status = doc.querySelector('[data-px-super-status]');
  console.log('状态行：', status ? status.textContent : '(无)');
  console.log('请求数：', calls.length);

  const probe = async (q) => {
    dom.window.history.pushState({}, '', '/search?q=' + encodeURIComponent(q));
    await sleep(800);
    const items = [...doc.querySelectorAll('.px-super-item')];
    const st = doc.querySelector('[data-px-super-status]').textContent;
    console.log(`\n查询「${q}」 → ${st}`);
    items.slice(0, 8).forEach((el) => {
      const title = el.querySelector('.px-super-title')?.textContent.trim();
      const kind = el.querySelector('.px-super-badge')?.textContent.trim();
      console.log('   ', kind, '|', title);
    });
    return items.length;
  };

  await probe('pickcat');
  await probe('pickcat 社区');
  await probe('MOSS');
  // 宽松模式
  doc.querySelector('[data-px-super-mode="loose"]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  await sleep(400);
  console.log('\n（宽松模式）');
  await probe('pickcat 社区');
  doc.querySelector('[data-px-super-mode="strict"]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  await sleep(300);
  // 排序：最早
  doc.querySelector('[data-px-super-sort="earliest"]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  await sleep(300);
  console.log('\n（最早）');
  await probe('pickcat');

  process.exit(0);
})();
