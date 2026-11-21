/** 线上实测：候选池深翻的墙钟耗时（并发开/关）+ 排序结果是否正常 */
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

async function run(settings, label, pages) {
  let reqs = 0;
  const dom = new JSDOM(HOME_HTML, {
    url: 'https://pickcat.dao3.fun/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.localStorage.setItem('pictExt:settings:v1', JSON.stringify({ sortMode: 'replace', useSession: false, ...settings }));
      window.fetch = async (url, init) => {
        if (String(url).includes('/topics?') && String(url).includes('cursor')) reqs++;
        return realFetch(url, { method: init.method, headers: init.headers });
      };
    },
  });
  const { window } = dom;
  const t0 = Date.now();
  window.eval(SCRIPT);
  const doc = window.document;
  let done = 0;
  for (let i = 0; i < pages * 5 + 40; i++) {
    await sleep(200);
    const note = doc.querySelector('#pictExt-panel .px-note')?.textContent || '';
    const m = note.match(/已翻 (\d+) 页/);
    if (m && Number(m[1]) >= pages) {
      done = Date.now() - t0;
      break;
    }
  }
  await sleep(400);
  const note = doc.querySelector('#pictExt-panel .px-note')?.textContent || '';
  const cards = doc.querySelectorAll('#pictExt-panel .px-list article').length;
  const titles = [...doc.querySelectorAll('#pictExt-panel .px-list article h2')].slice(0, 3).map((h) => h.textContent.trim());
  console.log(`\n[${label}] 目标 ${pages} 页 · 完成耗时 ${done ? (done / 1000).toFixed(1) + 's' : '未完成(超时)'} · 带游标的请求 ${reqs} 次 · 卡片 ${cards}`);
  console.log('  note:', note);
  console.log('  前三:', titles.join(' | '));
  window.dispatchEvent(new window.Event('pagehide'));
  return { note, reqs, cards, done };
}

(async () => {
  await run({ defaultSort: 'views', poolLatestPages: 30, poolHotPages: 10, poolParallel: false }, '串行 40 页', 40);
  await run({ defaultSort: 'views', poolLatestPages: 30, poolHotPages: 10, poolParallel: true }, '并发 40 页', 40);
})();
