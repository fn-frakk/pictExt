const fs = require('fs');
const p = 'make-preview.js';
let s = fs.readFileSync(p, 'utf8');

s = s.replace(
  `  setDom.window.eval(SCRIPT);
  await sleep(400);
  const settingsHTML = setDom.window.document.getElementById('pictExt-settings')?.outerHTML || '';`,
  `  setDom.window.eval(SCRIPT);
  await sleep(400);
  const sdoc = setDom.window.document;
  sdoc.querySelector('[data-px-settings-nav]')?.dispatchEvent(new setDom.window.MouseEvent('click', { bubbles: true }));
  await sleep(300);
  const settingsHTML = sdoc.getElementById('pictExt-settings')?.outerHTML || '';
  const settingsNavHTML = sdoc.querySelector('[data-px-settings-nav]')?.outerHTML || '';`
);

s = s.replace(
  `  <div class="sec-title">设置页：PICTEXT 设置板块</div>
  <div class="shell" style="padding:0">
\${settingsHTML}
  </div>`,
  `  <div class="sec-title">设置页：左侧导航里的 PICTEXT 入口</div>
  <div class="shell" style="padding:0">
    <div class="flex gap-3" style="align-items:flex-start">
      <aside aria-label="设置" class="min-w-0" style="width:220px">
        <nav aria-label="设置分类" class="flex flex-col gap-1">
          <button type="button" class="flex h-11 min-w-0 items-center gap-2.5 rounded-md px-4 text-left text-sm font-semibold whitespace-nowrap text-muted transition-colors hover:bg-accented hover:text-default">个人资料</button>
          <button type="button" class="flex h-11 min-w-0 items-center gap-2.5 rounded-md px-4 text-left text-sm font-semibold whitespace-nowrap text-muted transition-colors hover:bg-accented hover:text-default">账号安全</button>
          \${settingsNavHTML}
        </nav>
      </aside>
      <div style="flex:1;min-width:0">
\${settingsHTML}
      </div>
    </div>
  </div>`
);

fs.writeFileSync(p, s);
console.log('patched');
