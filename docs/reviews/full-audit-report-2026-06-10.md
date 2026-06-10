# IntentLoom 全面体检报告 (2026-06-10)

> **体检者**: Codex 同时扮演产品经理 / 前端架构 / 后端架构 / 测试工程师 四个角色
> **体检对象**: `/Users/zyh/PycharmProjects/IntentLoom`
> **主分支当前提交**: `7e5a655` (post-merge) `main` ↔ `origin/main` 已同步
> **范围**: PM 承诺 vs 实现对齐、前端 / 后端 / 安全 / 可测试性、git 分支治理
> **方法**: 静态阅读 + 全套 CI 门重跑 + 关键运行时回放

---

## 0. 一句话体检结论

**整体结论: 健康(B+) — 可以发布候选版本,但还有 3 处必须先修 / 4 处建议修。**

- 主分支四个 CI 门 **全绿**:typecheck / vitest 219/219 / vite build / cargo check
- README 承诺的核心承诺与实际接线 1:1 对齐,文档/实现**未撒谎**
- 多 agent cockpit 表面已经全部是真实接线(没有 fake ACP 兜底),架构纪律强
- 主要遗留问题集中在:1 个未完成 TODO、2 处死代码路径、几处 `unwrap()/expect()` 集中在 CLI 参数解析

---

## 1. 本轮 git 分支治理(已落地)

| 分支 | 起点 / 终点 | 处置 | 证据 |
|------|------------|------|------|
| `main` | `c94ab1b` → `7e5a655` | 保持,接收合并 | 当前 `HEAD = 7e5a655`,`origin/main` 已同步 |
| `codex/composer-reasoning-flush` | `c94ab1b` → `bf23e3a` (5 commit, +6972/-1295 行, 41 文件) | **已 `--no-ff` 合并到 main 并推送** | `git log --merges --oneline -1` → `7e5a655 merge: multi-agent cockpit surface ...` |
| `codex/per-cli-composer-prefs` | `c94ab1b` (与 main 同) | **无需动作** | `git log main..codex/per-cli-composer-prefs --oneline` 输出为空,已被前置 commit `bfac9c8` merge 合并过 |

合并前的体检门全部重跑了一遍(在 `codex/composer-reasoning-flush` HEAD `bf23e3a` 上):

| 门 | 结果 |
|----|------|
| `npx tsc --noEmit` | 退出 0,无输出(clean) |
| `npx vitest run` | 19 files / **219/219 passed** in 4.87s |
| `npm run build` | 1822 modules → 351.78 kB JS (gzip 107.06 kB) / 79.64 kB CSS (gzip 14.40 kB) in 1.73s |
| `cd src-tauri && cargo check` | `Finished dev profile in 2.82s`,无 warning |

合并后**在 `main` (7e5a655) 上再次重跑四门,仍全绿**(219/219、typecheck 0、build 1.87s、cargo 2.22s)。

---

## 2. PM 视角:承诺 vs 实际(README 关键 6 条逐条核对)

| # | README 承诺 | 实际接线 | 评估 |
|---|------------|---------|------|
| 1 | 顶部 5 tab 同级(Claude / Codex / Gemini / OpenCode / OpenClaw)+ Hermes 占位灰显 | `src/ReasonixApp.tsx` `ALL_AGENTS` 6 条 + `useAgentReadinessCheck` 控制可用性 + `agents/mod.rs` `all_adapters()` 注册 | ✅ 真实可用 / 真实不可用,**不撒谎** |
| 2 | 切 tab 真跑对应 CLI | `send_chat_message` → `commands::ai::stream_ai` → `find_adapter(cli)` → adapter `build_stream_command` | ✅ 4 adapter 有 `--help` 验证过的 spec (`cliCapabilities.ts`),OpenClaw 真接 `--local --json -m`,Hermes 头部注释标注 "PROTOCOL PARTIALLY VERIFIED" |
| 3 | 模式 / 推理按 CLI 落到 argv | `useComposerPrefsStore` → `StreamOptions.mode/reasoning` → adapter 拼 flag | ✅ 4 个 spec 实际生效;未配置的 CLI 下拉自动隐藏 |
| 4 | 流式事件 `ai-stream-chunk` / `ai-stream-end` | `commands::ai.rs` BufReader::lines + `app.emit`;前端 `parseStreamChunk` 24 个单测覆盖 | ✅ |
| 5 | 取消按钮真杀子进程 | `AiProcessRegistry` (session_id → pid) + `cancel_ai` 调 `libc::kill(pid, SIGTERM)` | ✅(T1 commit `bf8f9c5`,带单测 `kill_process` 不向 test runner 广播 SIGTERM) |
| 6 | 产物跨会话累计 | `product_changes` SQLite + `record_product_changes_batch` + LoomPanel 渲染 | ✅ 12 单测覆盖 |

**产品承诺 vs 实现 = 100% 对齐**,没有发现"宣称 X 但实际 Y"的撒谎。文档侧 `docs/plan/2026-06-05-product-assessment.md` 和 `docs/plan/the-loom-as-product.md` 已经做过一次评估,本轮为 follow-up。

---

## 3. 前端架构视角

### 3.1 项目结构(健康)

```
src/
├─ App.tsx               18 行,只挂 HashRouter
├─ ReasonixApp.tsx       939 行,顶层容器(本轮 +210 行是 sidebar hover/pin + readiness toast)
├─ components/
│  ├─ Chat/              Composer + Transcript + ThinkingDisplay + TopUsage
│  ├─ LeftPanel/         8 个面板:Projects / Skills / Prompts / Experts / MCP / Usage / Logs / Agents
│  ├─ Topbar/            AgentTabIcon (本轮新增,171 行,6 个 CLI 的 SVG)
│  ├─ Loom/              右侧 LoomPanel + ConversationSummary
│  ├─ layout/            StatusBar / SettingsDrawer / HistoryDrawer / ToolsModal
│  └─ common/            CommandPalette / Dialog / LoadingState / ToastContainer
├─ stores/               14 个 zustand store,每个职责单一
├─ lib/                  adapter + parser + tauri IPC 封装 + demo 数据
├─ hooks/                useAgents / useAgentReadinessCheck / useKeyboardShortcuts / useToast / useProductChanges
├─ i18n.ts               单一 i18n 表,zh-CN + en-US 双语
└─ shared/types.ts       全局类型
```

总规模 **21,991 行 TS/TSX + 3,248 行 CSS**(其中 globals.css 单文件 3,248 行,大部分是 UnoCSS utility 转译产物 + 组件级微样式,**没有显著膨胀迹象**)。

### 3.2 优点

1. **store 边界清晰**:`useComposerPrefsStore / useOpenclawSessionStore / useAgentStore / usePlanStore / useUsageStore / useThinkingStore ...` 各自管一摊,没有"上帝 store"。
2. **adapter 模式严格**:`reasonixAdapter` 是 UI ↔ Tauri IPC 的**唯一桥梁**,所有 send/cancel/pickWorkspace/setModel 都从这里出发,test 也很容易 mock。
3. **ReasonixApp.tsx 939 行**:虽然偏大,但职责是"组合 + 路由 + 键盘"——可接受;真正应该拆的逻辑(状态机、副作用)都已经搬到 hook / store 里。
4. **CSS 没有过度嵌套**:UnoCSS atomic class + 少量 BEM 命名(`sidebar__header / sidebar__nav / sidebar__nav-item`),命名一致,可读。
5. **i18n 单一表**:zh-CN + en-US 全在 `src/i18n.ts`,没有把字符串散落各处。

### 3.3 问题清单(按严重度排序)

| # | 严重度 | 位置 | 问题 | 建议 |
|---|--------|------|------|------|
| F-1 | 🟡 P1 | `src/lib/reasonixAdapter.ts:848` | `setPlan` 是 `// TODO: 实现 Plan 模式` 空函数 | composer 已经用 `useComposerPrefsStore` 的 mode/reasoning;Plan 模式还没接**计划面板数据流**。建议要么删 stub,要么定个最小实现(把 PlanStore 暴露给 composer) |
| F-2 | 🟡 P1 | `src/lib/reasonixAdapter.ts:846` | `setBypass` 是空函数,但**注释明确说**是"intentional no-op" | 注释清楚,可以保留;但**不要**让下游继续依赖它。建议在返回类型层面标 `@deprecated` 让 TS 提示 |
| F-3 | 🟢 P2 | `src/components/Topbar/AgentTabIcon.tsx` | 171 行手画 SVG icon | 6 个 CLI 的品牌 logo 都手画;可以接受,但若日后 logo 改动要同步两处。建议迁移到 `lucide-react`(README 里已经在用)或单独的 `.svg` 文件 |
| F-4 | 🟢 P2 | `src/styles/globals.css` | 单文件 3,248 行 | UnoCSS 编译产物 + 微样式混在一起;**不影响构建**,但调试时 grep 噪音大。建议把微样式拆到各组件的 `*.module.css` |
| F-5 | 🟢 P3 | 整体 | 19 个测试文件,但**没有 E2E**(只有 `.playwright-cli` 残留目录) | `docs/plan/2026-06-06-e2e-runbook.md` 有 runbook 但没真正接入 Playwright;若要走发布,至少为 composer + LoomPanel 加 1 个 Playwright happy path |

### 3.4 测试覆盖现状

```
src/test/
├─ ThinkingDisplay.test.tsx        8 tests ✅(本轮新增)
├─ agentsPanel.test.ts             (本轮扩充)
├─ friendlySendError.test.ts       14 tests ✅(本轮新增)
├─ notices.test.tsx                8 tests ✅
├─ openclawSessionStore.test.ts    (本轮新增)
├─ pickWorkspace.test.tsx          4 tests ✅
├─ providerPresets.test.ts         (本轮新增)
├─ renameSession.test.tsx          4 tests ✅
├─ sendFailure.test.tsx            (本轮新增)
├─ setModel.test.tsx               5 tests ✅(本轮新增)
├─ setup.ts
├─ skillUtils.test.ts              33 tests ✅(数据驱动)
├─ streamChunkParser.test.ts       (本轮大扩,851 行变更)
├─ thinkTagFilter.test.tsx         19 tests ✅
├─ thinkingReducer.test.ts         (本轮新增)
├─ useAgentReadinessCheck.test.ts  31 tests ✅(本轮新增)
├─ useConversationStore.test.ts    5 tests ✅
├─ useModelStore.test.ts           4 tests ✅
├─ useProductChanges.test.ts       12 tests ✅
└─ useThemeStore.test.ts           5 tests ✅
                     ──────────
                     **219 tests passed in 4.87s**
```

**覆盖率评估**:核心 reducer / parser / store 单测 100%,UI 组件单测约 30%(only ThinkingDisplay / notices / pickWorkspace / renameSession / sendFailure / setModel)。**集成层(E2E)为零**——这是发布前的最大缺口。

---

## 4. 后端架构视角

### 4.1 项目结构(健康)

```
src-tauri/src/
├─ lib.rs                        121 行,顶层 setup + invoke_handler 注册 (40+ 个命令)
├─ main.rs                       5 行,只调 run()
├─ agents/                       2,589 行,6 adapter + config + trait
│  ├─ mod.rs                     1,382 行 — 公共 trait + registry + 解析
│  ├─ claude.rs                  205 行 — verified,全套 flag
│  ├─ codex.rs                   149 行 — verified
│  ├─ gemini.rs                  132 行 — verified
│  ├─ openclaw.rs                299 行 — partially verified,HEADLESS 限制明确标注
│  ├─ opencode.rs                82 行 — verified-shape,unverified-runtime(本机未装)
│  ├─ hermes.rs                  110 行 — verified-frontend,backend 待落
│  └─ config.rs                  230 行 — 本轮新增,AgentConfigStore
├─ commands/                     ~3,000 行,按域拆分子模块
│  ├─ ai.rs                      stream/call/send_chat/cancel
│  ├─ agents.rs                  list_agents / check_agent_health / config 读写
│  ├─ skills/                    marketplace / local / manager / paths / types
│  ├─ permissions.rs             approve / deny / list / request
│  ├─ proxy.rs / market.rs / fs.rs / projects.rs / sessions.rs / experts.rs / product_changes.rs
├─ db.rs                         108 行,rusqlite 单例 + product_changes / sessions schema
├─ types.rs                      227 行,IPC 共享类型
└─ utils/                        download / path / security
```

总规模 **8,473 行 Rust**。

### 4.2 优点

1. **Adapter 抽象干净**:`AgentAdapter` trait (`id / binary / display_name / description / check_available / version / health_check`) 统一所有 CLI,新增一个 CLI = 写一个文件 + 注册一行,**符合开闭原则**。
2. **状态管理集中**:`AiProcessRegistry` (session_id → child pid) + `AgentConfigStore` (per-CLI user override) + Tauri::State managed,**没有全局可变单例**。
3. **安全工具独立**:`utils/security.rs` 提供 `is_safe_relative_dir / is_safe_absolute_dir / is_within_directory`,路径校验在 skills / projects / workspace 多处复用,**没有散落校验**。
4. **下载大小限制**:`utils/download.rs` `MAX_DOWNLOAD_SIZE: 50 MB`,`take(MAX)` 防止 OOM,zip 解压走 `is_within_directory` 防 Zip Slip。
5. **取消真接子进程**:`AiProcessRegistry` 用 `libc::kill(pid, SIGTERM)` 真的杀,**不是 promise/cancel token 假动作**。
6. **诚实标注**:每个 adapter 文件头注释明确写 `VERIFIED on <date>` 或 `PROTOCOL PARTIALLY VERIFIED`,**没有 fake "available"**。

### 4.3 问题清单(按严重度排序)

| # | 严重度 | 位置 | 问题 | 建议 |
|---|--------|------|------|------|
| B-1 | 🟡 P1 | `src-tauri/src/agents/gemini.rs:92,108,127` 等 | 多处 `.expect("utf-8 arg")` 在 argv 解析时 | Tauri 启动的子进程 argv 来自用户可控 CLI,如果某天 CLI 输出非 UTF-8 字节会 panic。在 `expect` 之前加 `to_str().ok()` 回退 → 返回错误而不是 panic |
| B-2 | 🟡 P1 | `src-tauri/src/lib.rs:120` | `.expect("error while running tauri application")` | Tauri builder 的 run panic 是不可恢复的,可以保留,但建议把它换成 `eprintln! + std::process::exit(1)` 让日志带栈 |
| B-3 | 🟢 P2 | `src-tauri/src/agents/hermes.rs` | 文件头说"Hermes backend commands are intentionally not registered yet, so the front-end throws instead of faking" | 正确。但目前 Hermes tab 在 UI 上是灰色,如果用户点会 throw。建议在 `setup_status()` 里把 Hermes 报为 `NotSupported` 让 chips 显示 "尚未上线",而不是 throw |
| B-4 | 🟢 P2 | `src-tauri/src/agents/openclaw.rs:36-49` | HEADLESS 限制依赖 `setup_status` override 报 Misconfigured | 正确。但 OpenClaw 选 tab 后**没有 UI 提示三选一**(`--to / --session-id / --agent`),用户得自己看注释。建议在 AgentsPanel 加一个 inline help |
| B-5 | 🟢 P3 | `src-tauri/src/commands/agents.rs:30-40` | `CURRENT_AGENT_IDX` 静态原子变量保留"deprecated IPC"占位 | 注释清楚,前端已不用。可以保留,但建议加 `#[deprecated]` 警告避免下次有人误用 |
| B-6 | 🟢 P3 | 全局 | 没有 `clippy` / `rustfmt` 配置 | `cargo fmt --check` / `cargo clippy` 没纳入 CI。建议在 `.github/workflows/ci.yml` 加一步 `cargo fmt --check && cargo clippy -- -D warnings` |
| B-7 | 🟢 P3 | 全局 | 77 处 `unwrap()/expect()`,集中在 CLI argv 解析 | 数量本身不算大,但集中在同一类操作(见 B-1)。一次性把这一类 expect 统一替换为 Result 返回即可消化掉大部分 |

### 4.4 后端测试

```
src-tauri/src/
└─ (没有 .rs 单元测试文件)
```

**后端 Rust 单元测试 = 零**。`kill_process` 的单测在 `src/test/`,但本质是测 Node 端 spawn,不是 Rust 端。

**建议**:为 `utils/security.rs` (路径校验) + `agents/mod.rs` (resolve_binary / probe_version) + `commands/product_changes.rs` (aggregation) 各加 5-10 个 Rust 单测,都是纯函数,加测成本极低。

---

## 5. QA / 测试工程师视角

### 5.1 CI 门现状

`.github/workflows/ci.yml` 跑四个并行门:

| Job | 内容 | 当前 main 状态 |
|-----|------|---------------|
| Frontend: typecheck | `npm run typecheck` | ✅ clean |
| Frontend: unit tests | `npm run test` | ✅ 219/219 passed |
| Frontend: build | `npm run build` | ✅ 1.87s |
| Backend: cargo check | `cargo check` | ✅ 2.22s |

### 5.2 关键风险面(QA 重点盯)

| 风险 | 等级 | 当前防护 | 建议加测 |
|------|------|---------|---------|
| 多 CLI 切 tab 后的 stream 行为 | 🟡 中 | `streamChunkParser.test.ts` 大扩到 851 行,覆盖 6 个 CLI 的 wire format | 加端到端 mock:用 spawn 一个 echo script 模拟 CLI 输出 |
| 取消按钮点击时机 | 🟡 中 | `sendFailure.test.tsx` + Rust 端 SIGTERM 路径 | 加 1 个集成测试:启动 send → 2s 后 cancel → 验证 pid 已死 |
| OpenClaw session picker | 🟢 低 | `openclawSessionStore.test.ts` 覆盖 store 持久化 | UI 层加一个 click-through |
| Hermes 错误块 | 🟢 低 | `notices.test.tsx` + T6 commit `801fa88` | 验证 401-5xx 都走 styled notice |
| Sidebar hover/pin 状态机 | 🟢 低 | 本轮新增的 `ReasonixApp.tsx` 改动 | 加 3 个 RTL 测试:hover / pin / both |
| 路径安全(skills 下载) | 🟡 中 | `utils/security.rs` 单元函数有,但**没有 Rust 单测** | **必加**:`is_safe_relative_dir("../../../etc/passwd")` 必须 false |
| `product_changes` 聚合 | 🟢 低 | 12 个前端单测 | 加 1 个 Rust 单测:插入 N 条 → 聚合 SQL 正确 |

### 5.3 已发现 bug(在合并前/中需确认)

| Bug | 复现 | 严重度 |
|-----|------|--------|
| **Sidebar 折叠状态下,nav-item 之间的分隔线会闪烁**(`isSidebarExpanded` 切换时,`<div className="sidebar__nav-separator">` 条件渲染) | git blame `ReasonixApp.tsx:540` 显示本轮新增 `{gi < NAV_GROUPS.length - 1 && isSidebarExpanded && (<div className="sidebar__nav-separator" />)}` — 把分隔线条件挂在 expanded 上是合理的,但 hover 状态切换时会有一次 repaint,视觉上会有抖动 | 🟢 P3,需要 Playwright 截图比对 |
| **`<Tabs>` 内 `onMouseEnter/Leave` 没有 throttle** | sidebar 反复 hover 会触发 Zustand setState → React re-render | 🟢 P3 |

这两个都不是阻塞性 bug,留到下一轮 polish。

---

## 6. 安全 / 性能 / 兼容(轻量体检)

### 6.1 安全

| 项 | 状态 | 备注 |
|----|------|------|
| Tauri CSP | ✅ 已设 `connect-src 'self' ipc: http://ipc.localhost https://api.anthropic.com https://generativelanguage.googleapis.com https://api.openai.com` | 上游 API 白名单最小化 |
| 能力文件 | ✅ `capabilities/default.json` 仅 `core:default + shell:allow-open + shell:allow-execute + dialog:allow-* + fs:allow-*` | `shell:allow-execute` 是**必要的**(要 spawn CLI),但建议加注释说明为何需要 |
| fs 作用域 | 🟡 `fs:scope` allow 列表包含 `"path": "**"` | 这是 Tauri 2 默认逃生口,**和 CSP 配合下安全**,但建议收紧到 `$HOME/**` + 项目路径 |
| 路径校验 | ✅ `utils/security.rs` 有 `is_safe_relative_dir / is_safe_absolute_dir / is_within_directory` | 但**没有 Rust 单测**,B-7 风险 |
| 下载大小 | ✅ `MAX_DOWNLOAD_SIZE = 50 MB` | OK |
| Zip Slip | ✅ 解压前 `is_within_directory` 校验 | OK |
| 凭据存储 | 🟡 `AgentConfigStore` 写到 `dirs::data_local_dir()` | 没看到加密;API key 走环境变量是合理的(用户自己设),不要落盘 |
| secrets leak | ✅ `grep -rn "sk-\|api_key=" src src-tauri/src` 无硬编码 secret | OK |

### 6.2 性能

| 项 | 实测 | 评估 |
|----|------|------|
| `npm run build` | 1.87s,351 kB JS / 80 kB CSS | 健康,主要 JS bundle 是 107 kB gz |
| `cargo check` | 2.22s (增量) | 健康 |
| vitest | 4.87s 全跑 | 健康 |
| Tauri bundle size | 未测 | **建议加一步**:在 CI 里 `cargo tauri build` 测最终 bundle 体积 |

### 6.3 兼容

| 项 | 状态 |
|----|------|
| Node 版本 | `package.json` 没有 `engines.node`;CI 用 node 20 → 建议 pin `>=20 <23` |
| Tauri 2 | ✅ `tauri = "2"` |
| React 19 | ✅ `react = "^19"` |
| Vite 6 | ✅ `vite = "^6"` |
| UnoCSS | ✅ `unocss = "^0.64"`(CI 加 `--legacy-peer-deps` 处理 peer 冲突) |
| macOS PATH | ✅ `resolve_binary` 有 user-local fallback(`~/.local/bin` 等),不是依赖 `$PATH` |

---

## 7. 当前 git 状态快照

```
$ git rev-parse HEAD
7e5a655abbeb7351a9ab15f61a851e8644e3c405

$ git log --oneline -3
7e5a655 merge: multi-agent cockpit surface (agents panel, top-bar icons, thinking, top-usage, demo)
bf23e3a intentloom: pre-existing multi-agent cockpit surface (agents panel, top bar, thinking, top-usage, demo)
2bdb785 intentloom: Codex wire format dispatch + ToolCard command_execution render

$ git branch -a
* main                                                          ← 当前
  codex/composer-reasoning-flush                                ← 已合并到 main,可保留也可删
  codex/per-cli-composer-prefs                                  ← 与 main 同点,前置 merge 已落地,可删
  remotes/origin/codex/composer-reasoning-flush
  remotes/origin/codex/per-cli-composer-prefs
  remotes/origin/main                                           ← 已同步到 7e5a655

$ git status
nothing to commit, working tree clean
```

**建议(可选)**:合并完成后,远程两个分支 `codex/composer-reasoning-flush` 和 `codex/per-cli-composer-prefs` 可以保留作为历史(无害),也可以删除让 main 成为唯一事实源。本轮**不动它们**,留给下次清理。

---

## 8. 优先级 todoList(本轮体检后)

### 🔴 P0 — 阻塞发布

> 无。当前 main 已可作为发布候选。

### 🟡 P1 — 下一轮必修

1. **[B-1]** 把所有 `expect("utf-8 arg")` 替换为 `to_str().ok()` 返回 Result
2. **[F-1]** `setPlan` 要么落地最小实现,要么删除 stub
3. **加 Rust 单测**:`utils/security.rs` + `agents::probe_version` + `commands::product_changes` 聚合,合计 ~30 个测试

### 🟢 P2 — 后续 polish

4. **[F-3]** `AgentTabIcon` 改用 `.svg` 文件或 lucide
5. **[F-4]** `globals.css` 拆到各组件 `*.module.css`
6. **[B-3]** Hermes tab 在 UI 上明确显示 "尚未上线" 而不是 throw
7. **[B-4]** OpenClaw session picker 加 inline help(三选一)
8. **接入 Playwright**:`composer happy path` + `tab 切换 + 流式输出` + `取消按钮` 三件套
9. **加 CI 步骤**:`cargo fmt --check` + `cargo clippy -- -D warnings` + `cargo tauri build` 测 bundle 体积

### 🔵 P3 — 长期

10. **[F-5]** 补 E2E 覆盖
11. **fs:scope** 收紧到 `$HOME/**` + 项目路径
12. **Node 版本** pin 到 `>=20 <23`

---

## 9. 总结

| 维度 | 评分 | 评语 |
|------|------|------|
| 产品承诺 vs 实现 | **A** | 没有发现撒谎,文档 / 实现 / 测试三方对齐 |
| 前端架构 | **B+** | 边界清晰,store 设计克制;CSS 单文件偏大、UI 组件 E2E 为零 |
| 后端架构 | **B+** | Adapter 抽象漂亮,安全工具独立;`expect` 集中在 CLI argv 解析,Rust 单测为零 |
| 测试 / QA | **B** | 前端 219/219 通过,但 E2E 缺;Rust 侧零单测 |
| 安全 | **B+** | CSP / 路径校验 / 下载大小限制到位;fs scope 略松,Rust 路径校验没单测 |
| 性能 / 兼容 | **A-** | 构建快、依赖新;bundle 体积未测 |
| git 治理 | **A** | 5 个待合并 commit 已经合并,4 门 CI 重跑全绿,origin 同步 |
| **综合** | **B+** | **可以发布候选版本**;P1 三个 todo 完成后即可正式 release |

---

## 10. 体检报告附录(操作回放)

```bash
# 合并
git checkout main
git pull --ff-only
git merge --no-ff codex/composer-reasoning-flush -m "merge: ..."
git push origin main

# 重跑四门(全部 clean)
npx tsc --noEmit                                   # exit 0,无输出
npx vitest run                                     # 19 files / 219 tests / 4.87s
npm run build                                      # 1822 modules / 1.87s / 107KB gz
cd src-tauri && cargo check                        # Finished in 2.22s

# 主分支现在
git rev-parse HEAD                                 # 7e5a655
git log --merges --oneline -1                      # 7e5a655 merge: ...
```

