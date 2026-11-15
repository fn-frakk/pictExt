# 贡献指南

感谢愿意帮 PICKCAT 把体验做好一点。这个项目很小，规则也就几条，看完再动手会省很多来回。

## 先确认这几件事

1. **不是官方项目**。这里只做前端增强，不改站点、不代发内容、不做自动化灌水。
2. **只读**。任何新增功能都只能调用站点的 GET 接口；`POST / PUT / PATCH / DELETE` 一律不收。
3. **不碰隐私**。不读 `localStorage` 里的登录凭据、不上报任何数据、不把 Cookie 写进任何存储（内存快照用完即清）。涉及账号态的功能默认关闭，并写清楚代价。
4. **默认不打扰**。新功能默认关，或默认走「原版」，让不想要的人看不到任何变化。

## 环境

- Node.js ≥ 18（构建与测试）
- Chrome / Edge 111+（`world: "MAIN"` 需要较新版本）
- 测试需要 `jsdom`：`npm install`

## 目录与加载顺序

源码在 `src/`，按文件名排序拼接成一个 IIFE，**顺序即依赖顺序**（后面的文件可以调用前面声明的函数）。

- 新增文件要同时改 `build.js` 里的 `ORDER` 数组；
- 拼接后共享同一个闭包，所以**不要出现重名**的顶层 `const` / `function`；
- 改完必须 `npm run build`，把 `dist/content.js` 一起提交（CI 会校验两者一致）。

## 开发流程

```bash
npm install          # 只为跑测试（构建不需要依赖）
npm run watch        # 改 src/ 自动重建 dist/content.js

# 另一个窗口：chrome://extensions → 开发者模式 → 加载已解压的扩展程序 → 选仓库根目录
# 改完回扩展页点「刷新」，再刷新站点页面
```

提交前请跑：

```bash
npm run check        # 构建 + 语法检查
npm test             # 142 项 jsdom 断言
```

新增行为请**补断言**（`.test/run.js` 按 `[A] [B] [D] [G] [H]` 分组），至少覆盖：注入位置、显隐、请求参数、状态恢复。只改文案的 PR 可以不补。

## 站点改版了怎么办

这个扩展完全依赖站点的 DOM 锚点（`aria-label`、`data-*`）和接口字段，站点一改就可能失效。排查顺序：

1. 打开 DevTools，对照 README 最后一节的「依赖的站点 DOM / 接口锚点」；
2. 锚点变了 → 改 `src/11-adapters.js`（列表页）、`src/20-detail.js`（详情页）、`src/22-collection.js`（合集）；
3. 字段变了 → 改 `src/05-data.js` 的 `normalize()`；
4. 顺手补一条断言，避免下次又静默失效。

**不要**为了修一个锚点去改站点行为、加定时重试轰炸接口，或者把请求频率调高。

## 提交规范

用 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/)：

```
feat(comment): 楼中楼按 10 条分页
fix(category): 板块页选择器写成 div，改为 section
docs: 补充合集接口说明
chore: 统一行尾为 LF
```

- 一个 PR 一件事，不要夹带无关格式化；
- 改动涉及 UI 的，PR 里贴一张截图或一段说明「改前 / 改后」；
- 不要提交：账号 Cookie、`localStorage` 导出、含个人信息的截图、`node_modules`。

## 发版

版本号三处要对齐：`manifest.json` 的 `version`、`package.json` 的 `version`、`src/_header.js` 顶部注释。然后：

```bash
npm run build
git add -A && git commit -m "chore(release): v1.8.0"
git tag -a v1.8.0 -m "v1.8.0"
git push origin main --follow-tags
```

同时在 `CHANGELOG.md` 顶部加一节。

## 行为准则

对事不对人。讨论锚点、请求、性能都可以很直接；对贡献者本人客气一点。
