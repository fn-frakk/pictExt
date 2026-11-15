# legacy/

早期的一次性脚本，**不参与构建，也不在 CI 里跑**，只作为「当时怎么反查站点 chunk / 怎么打补丁」的记录留档。

- `patch1..7.js`：v1.1 ~ v1.3 期间的一次性改写脚本；
- `at.js` `find.js` `scan.js` `seg.js` `slice.js` `switchtheme.js`：查 chunk、切主题、切片段的小工具。

它们里面还写着旧的 `content.js` 路径（已拆成 `src/`），直接跑大概率报错——要用的话自己改路径。
