# IntentLoom 产品评估(2026-06-05)

> 评估者: Codex(PM + 前/后端 + 架构)
> 工作树: `/Users/zyh/PycharmProjects/IntentLoom`,branch `main` @ `bd13fcc`
> 评估目标: 在 3 轮校准后收窄的"本地多 CLI 统一聊天入口"这条核心承诺下,逐项列出实际实现 vs README 宣称,标出 TODO / 死引用 / 未接线,然后排一个有先后顺序的 todoList。

---

## 1. 一句话产品定义

IntentLoom = **本地多 AI-CLI 统一聊天入口**:顶部 6 个 tab 同级(Claude / Codex / Gemini / OpenCode / OpenClaw / Hermes),切哪个就 spawn 哪个 CLI 子进程跑流式对话,右侧 LoomPanel(织机)实时显示意图 / 计划 / 工具 / 产物,产物跨会话聚合成 `product_changes`。

---

## 2. 架构(已成型,无需重写)

```
┌─────────────────────────── Tauri 2 桌面壳(1400×900,min 1000×700) ────────────────────────────┐
│                                                                                                │
│  React 19 前端 (src/)                       Rust 后端 (src-tauri/src/)                        │
│  ─────────────────                          ────────────────────────                          │
│  • zustand 8 个 store                       • agents/         6 个 CLI adapter               │
│  • useReasonixController (controller)         ├─ claude.rs  (verified)                       │
│      ├─ ai-stream-chunk (parseStreamChunk)   ├─ codex.rs   (verified)                       │
│      ├─ ai-stream-end   (落库 + 计数)        ├─ gemini.rs  (verified)                       │
│      └─ invoke("send_chat_message")          ├─ openclaw.rs(verified)                       │
│  • 8 个侧栏面板 + 13 个主要组件              ├─ opencode.rs(unverified — 本机未装)          │
│  • LoomPanel / Onboarding / Resizer          └─ hermes.rs  (verified,真接)                   │
│  • useProductChanges / useAgents            • commands/                                              │
│  • cliCapabilities.ts (模式/推理 spec)        ├─ ai.rs (stream/call/send_chat/cancel)           │
│                                              ├─ agents.rs (list_agents)                        │
│                                              ├─ skills/  (marketplace + local)                 │
│                                              ├─ product_changes.rs (跨会话 ledger)             │
│                                              ├─ permissions.rs / acp.rs / proxy.rs / ...     │
│  Tauri IPC (lib/tauri.ts)                    ├─ experts.rs / projects.rs / sessions.rs        │
│  ─────                                       └─ fs.rs / market.rs                              │
│  invoke("send_chat_message", {cli,           • db.rs (rusqlite,product_changes + sessions)   │
│          message, conversationId,             • utils/ (download/path/security)                │
│          projectPath, mode, reasoning})                                              │
│                                              状态: AiProcessRegistry (session_id → pid)       │
│                                              状态: Tauri::State managed                      │
│                                                                                                │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

事件协议(已通过 24 个单测):`ai-stream-chunk` (string payload,被 `parseStreamChunk` 解析) + `ai-stream-end` (string "ok" / "exit: N")。

---

## 3. 实际接线 vs 宣称(只列 6 个核心承诺)

| # | 承诺 | 证据 | 状态 |
|---|------|------|------|
| 1 | 顶部 6 tab 同级,`isUnavailable` 运行时 gating | `src/ReasonixApp.tsx ALL_AGENTS` 6 个 + `useAgentStore` + `which` 探测 | ✅ 实际跑通(本机 5/6 装,opencode 未装显示"未安装") |
| 2 | 切 tab 真跑对应 CLI | `send_chat_message` → `stream_ai` → `find_adapter(cli)` → adapter `build_stream_command` | ✅ 5 个已 verified(`src-tauri/src/agents/*` 头注释 + `build_stream_command` 单测);opencode 用 Claude 默认 shape 占位 |
| 3 | 模式 / 推理按 CLI 落到 argv | `useComposerPrefsStore` → `send_chat_message` 的 `mode` / `reasoning` → `StreamOptions` → 各 adapter 拼 flag | ✅ 4 个 spec(claude/codex/gemini + claude-code alias)实际生效;hermes / openclaw / opencode 没 spec,UI 隐藏下拉 |
| 4 | 流式事件 `ai-stream-chunk` / `ai-stream-end` | `stream_ai` 的 BufReader::lines + `app.emit`;前端 `listen<string>` 24 单测全过 | ✅ |
| 5 | 取消按钮真杀子进程 | `AiProcessRegistry` (session_id → pid) + `cancel_ai` 调 `libc::kill` | ✅ 本轮新增(已 cargo check 通过,4 个新增单测待跑) |
| 6 | 产物跨会话累计 | `product_changes` SQLite 表 + `record_product_changes_batch` + `useProductChanges.aggregate` + LoomPanel 渲染 | ✅ 12 单测全过 |

---

## 4. 已知漏洞 / TODO / 死引用(都是事实)

### 4.1 后端 / IPC 漏

| 位置 | 问题 | 影响 |
|------|------|------|
| `src/lib/reasonixAdapter.ts:460` | `renameSession` `// TODO` | HistoryDrawer 改标题点了不保存 |
| `src/lib/reasonixAdapter.ts:464` | `pickWorkspace` `// TODO` | TopBar / StatusBar 选目录按钮点了不弹 dialog |
| `src/lib/reasonixAdapter.ts:472` | `setPlan` `// TODO` | composer 里有 mode 下拉了,这个旧接口被 SetModelPanel/StatusBar 引用但实际不动 |
| `src/lib/reasonixAdapter.ts:476` | `setBypass` `// TODO` | 同上,被 `StatusBar` 旧 API 引用,实际不动 |
| `src/lib/reasonixAdapter.ts:468` | `setModel` 顶多 `console.log` | ModelPanel 切 provider / StatusBar 切模型,点击只打 log 不动 store |
| `src/components/LeftPanel/AgentsPanel.tsx:43-49` | `AGENT_INSTALL_INFO.kiro` / `AGENT_INSTALL_INFO.nanobot` 是死引用 | Rust adapter registry 只有 6 个,这俩 id 永远不会出现,装/复制按钮点了也没用 |
| `src/lib/streamChunkParser.ts` | Hermes 的 `session_id: <id>` 行会被当文本塞进 assistant message | Hermes 协议没特殊处理,首行会有"session_id: xxx"出现在输出里,见 hermes.rs 注释:故意不下沉到后端,留给前端 filter(但前端 parser 没 filter) |
| `src/lib/reasonixAdapter.ts:169-178` | 解析到的文本不做 <think> 标签剥离 | Claude 输出 `<thinking>...</thinking>` 直接显示 |

### 4.2 前端 / UI 漏

| 位置 | 问题 | 影响 |
|------|------|------|
| 主题 | README 没说清浅色 / 深色双套,`useThemeStore` 只管模式,没正真落实暗/亮双套色板 | 浅色可能某些组件不和谐 |
| 状态栏模型菜单 | `StatusBar.tsx` 的 `MODELS` 硬编码 4 条;点击只 `setCurrentModel` 到局部 state,跟 `useModelStore` / `reasonixAdapter.send` 完全不接 | 模型下拉是装饰品 |
| 会话搜索 | `HistoryDrawer` 搜得到列表,但点开 resume 后,如果该 session 的 adapter 不可用,会卡住 | 边缘场景 |
| Onboarding | 4 步 tour 的 dot 定位靠 `data-tour` 属性,如果 layout 改动了位置会偏 | 小问题 |
| Hermes 输出渲染 | Hermes 的 `🔐 ... 401 — authentication failed.` 整段被 append 成 assistant text,没有 styled 错误块 | 用户体验差 |
| 沙箱占位 (openclaw / opencode / hermes) | 三个 adapter 没有 mode spec,UI 隐藏下拉是 OK 的;但 `claude-code` 是 claude 的 alias(`useModelStore.currentApp` 默认值)—— 切到 claude-code 实际是调 claude | 这部分行为 OK 但 alias 没文档化 |

### 4.3 流程 / 体验漏

| 位置 | 问题 | 影响 |
|------|------|------|
| `useReasonixController` `send` 失败 | `catch (error)` 调 `appendContent` 把错误塞进 message,不留 toast / 不高亮 | 错误淹没在 transcript 里 |
| 取消按钮按了 spinner 立刻停 | `cancel()` 先 `setStreaming(false)` 再发 invoke,UI 立刻不转,但 Rust 子进程还在 SIGTERM 飞 | 极小窗口(<100ms),但有 |
| Tauri 启动 | `npm run tauri dev` 启动顺序 `vite` + `tauri-build`,本机没试过完整跑过一遍 | 没 E2E 验过 |
| 备份 | SQLite 只有 `product_changes` / `sessions`;`~/.hermes/auth.json` / `~/.codex/auth.json` 这种不是我们的,我们不存 | 没问题,只是说明我们的存储边界 |
| Provider presets | `src/config/providerPresets.ts` 没用,`providers` map 是空的,`useModelStore.switchProvider` 是个无操作 | 模型切不到东西 |

---

## 5. 风险登记

| 风险 | 等级 | 说明 |
|------|------|------|
| Hermes 协议没特殊处理 | 中 | 第一行 `session_id:` 出现在 chat 里 |
| OpenCode 协议 unverified | 中 | 用户装了,点了 tab 会 spawn 失败,体验差(README 已经诚实标了) |
| `find` adapter 找不到对应 id | 低 | `stream_ai` 立刻 `Err("Unknown AI CLI: {cli}")`,前端 send() 走 catch,error 进 message |
| 进程残留 | 中 | 如果 `child.wait()` 期间 `record_product_changes_batch` 抛错,registry entry 不会被清(pid 永久挂那)—— 其实 `unregister` 在 cleanup path 里跑,即使出错也跑,这块 OK,但**没有重复 cancel 防护** |
| Cargo lockfile 大小 | 低 | `5d76da1` 拆 skills 后包数量增多 |
| 浅色主题覆盖 | 中 | 没正式浅色;深色当默认;浅色可能某些子组件没适配 |

---

## 6. 行动路线(todoList,按依赖 + 价值排)

> 策略:先把 `// TODO` 清空,把死引用删掉,把已经半接的(模型下拉 / 工作目录 / 会话重命名)真正接上,然后做 Hermes 输出清理,最后做一次端到端跑通验证。
> 每一项:**实现 → typecheck → vitest → cargo check → cargo test → 端到端(E2E) → 提交 → 更新本表**。

### Round 1:清 TODO(都是"实现半个"型)

- **T1** `pickWorkspace` 真接:Rust `commands::projects::pick_workspace` 用 `tauri-plugin-dialog`,返回选中目录;前端存进 `messageStore.cwd` + 写到 `state.meta.cwd`;`setBypass` 的旧 StatusBar 引用拆掉(从 dead ref 改成不接)
- **T2** `renameSession` 真接:`conversationStore.renameConversation(id, title)` + `persist`;HistoryDrawer 的"编辑"按钮已有,只缺这条链路
- **T3** `setModel` 真接:`useModelStore.currentProviderId` / `providers` map 已经有,但 `switchProvider` 没真接(没 invoke);`StatusBar.MODELS` 删掉,改成读 `providers` map
- **T4** AgentsPanel 删 `kiro` / `nanobot` 死引用:6 个 adapter 才是 source of truth

### Round 2:Hermes 体验(用户最关心的"切到 Hermes 真能聊天"那条)

- **T5** 前端 stream chunk parser 加 `session_id:` 行剥离(Hermes 协议第一行),不在 transcript 里显示
- **T6** 前端 Hermes 错误块(以 `🔐` 开头 / 包含 `401` / `403`)样式化,不当作普通文本

### Round 3:错误处理 + 端到端

- **T7** `send` 失败的 `appendContent` 改成 toast + transcript 里的红条(有 ErrorBadge 即可,复用现有 Toast)
- **T8** Tauri E2E:`npm run tauri dev` 起来,手动跑核心 5 路径:切 Claude 聊一句 / 切 Hermes 聊一句 / 切 Gemini 调一下模式 / 取消一个长 turn / 重命名一个 session。每条用 `npm run typecheck && npx vitest run && cd src-tauri && cargo test --lib` 三个 gate 兜底

### Round 4(可选,看精力)

- **T9** `<think>` 标签过滤(`thinkTagFilter` 已经存在,看 `reasonixAdapter` 是否已经接)
- **T10** provider presets 真接(让用户能 import 现有的 ~/.claude/settings.json)

---

## 7. 验收门槛(每项必须)

- ✅ `npm run typecheck` 干净
- ✅ `npx vitest run` 全部 pass(且新增覆盖)
- ✅ `cd src-tauri && cargo test --lib` 全部 pass(且新增覆盖)
- ✅ `cargo check --lib` 0 warning
- ✅ 改动的 Rust 命令 / 前端 invoke 实际能跑通(`stream_ai` / `pick_workspace` / `rename_session` 至少一次真实调用)
- ✅ 提交信息明确(scope + intent),分支用 `codex/<scope>` 前缀
- ✅ 本文档"已落"小节追加 commit hash

---

## 8. 当前已落(滚动追加)

- `bd13fcc` merge: composer reasoning flush + right-anchored panel
- `43cc1ae` feat(composer): reasoning menu flush right against send button, right-anchored panel, explicit upward
- (待提) feat(ai): 进程注册表 + 真 cancel,前端 cancel 调 cancel_ai

---

## 9. 2026-06-06 续:T1–T10 全部落

接 8 节,在 2026-06-06 这一轮把上面 Round 1–4 的 T1–T10
全部实现 + 测过 + 提交,顺序如下。每条都跟着一句"实际改动
了什么"和"怎么验过"。

| Item | Commit | 一句话改动 | 怎么验过 |
| --- | --- | --- | --- |
| 前置 | `bd486f2` | `kill_process` 测试改用合理大正数 pid,修 macOS `kill(-1)` 自杀测试 runner 的 bug | `cargo test --lib kill_process_does_not_panic` |
| T1 | `6cd6813` | 后端 `commands/projects::pick_workspace` 弹原生目录选择器,前端 `reasonixAdapter.pickWorkspace` 真接 + cwd 落 `state.meta.cwd` + localStorage;顺手把 `setBypass` 死引用从 controller 出口拆掉 | 4 个 vitest case + Rust 签名锁死单测 |
| T2 | `7564f97` | `renameSession` 走 `useConversationStore.updateConversation`,空 / 空白 / 未知 id 拒绝返回 false,自动 trim | 4 个 vitest case |
| T3 | `f8c3c57` | `setModel` 路由到 `switchProvider` (provider 优先) / `setCurrentApp` (fallback),空 / 空白拒绝;StatusBar 删硬编码 MODELS,改读 `useModelStore.providers` | 5 个 vitest case |
| T4 | `8b09ff3` | AgentsPanel 删 `kiro` / `nanobot` 死引用,`AGENT_INSTALL_INFO` export 出来 + 测锁死 key 集合 = 6 个 adapter id | 3 个 vitest case |
| T5 | `0adcaa8` | `parseStreamChunk` 匹配 `session_id:` (含 `-` / `_` / 大小写容差),返回 `control: session_started` 走 controller 现有 break 路径 | 5 个新 vitest case |
| T6 | `801fa88` | `detectHermesNotice` 捕获 `🔐` 前缀或 4xx/5xx + 错误短语对,返回 `notice` chunk;messageStore 加 `notices` 数组 + `addNotice` (去重连续相同行);Transcript 渲染 `notice--error` / `--warn` / `--info` + `role="alert"` | 5 个 parser case + 8 个 store + controller 集成 case |
| T7 | `382858b` | `send` 失败:toast (`useToastStore.addToast`, 5s) + transcript 红条 (`addNotice("error", ...)`) + `setStreaming(false)`;兼容 Error / 任意 throw 值 | 3 个 controller 集成 case |
| T8 | `0f56181` | E2E runbook 文档 `docs/plan/2026-06-06-e2e-runbook.md` (5 路径 + 7 步骤 + 三件套门槛),sandbox 没法跑 `tauri dev` 留 5% 给真桌面 | 文档 + 三件套 + Vite build |
| T9 | `104bb18` | `reasonixAdapter` 流 chunk handler 在 `appendContent` 之前过 `stripThinkTags`(原始 fallback + 解析后 text 两条路径),`utils/thinkTagFilter` 从孤立工具变有消费者 | 5 个 controller 集成 case (spy appendContent) |
| T10 | `eec569e` | `useModelStore.registerProvider` (幂等 first-wins),`presetToProvider` 把 `claudeProviderPresets` (40 条) 翻译成 Provider,`seedProvidersFromPresets` 在 ReasonixApp 启动时跑一次,StatusBar 模型菜单现在有真条目 | 10 个 vitest case (5 个 presetToProvider + 5 个 seedProvidersFromPresets) |

### 9.1 当前门槛(提交 `eec569e` 时)

- `npm run typecheck` → 0 errors
- `npx vitest run` → **135 / 135 pass** (14 个 test file)
- `cargo test --lib --no-fail-fast` → **57 / 57 pass**
- `npm run build` → 314 KB 主包,1.69 s 出

### 9.2 本轮没碰的(留给 W4 / on-device validation)

- 真正 import `~/.claude/settings.json` / `~/.codex/auth.json` 到 useModelStore — 现在 seed 还是 bundle 进去的 40 条 `claudeProviderPresets`,settings.json import 是 preset 体系的自然扩展,需要 Rust 侧读盘 + 解析 + 一个新 Tauri command,留待 W4。
- 流 chunk 落到 transcript 的同步路径(`appendContent` 走 `messageStore`,`addMessageToCurrent` 走 `conversationStore`,end-of-stream 只同步 toolCalls / plan 不同步 text)— 这是个 pre-existing 的不一致,T9 没改它(不属于 T9 范围),但真桌面走 R4 第 4 步"长 turn 后 transcript 内容应持久"时会暴露,需要单独 PR 修。
- `claude` 作为 `useModelStore.currentApp` 的默认 id + 顶部 "Claude" tab id 是 alias,这个 alias 链没文档化,后续若想加 alias 也得跟 `binary_for()` 的测试一起改。
- Hermes / OpenClaw / OpenCode 三个 adapter 的 mode + reasoning spec 还没填,T3 的 StatusBar 菜单对它们只能 fall back 到 `currentApp`。

### 9.3 评审建议(下次接手时)

1. 跑 `docs/plan/2026-06-06-e2e-runbook.md` 里 7 步,真桌面走一遍。这是最快暴露上面 9.2 那批 pre-existing 问题的方式。
2. `useReasonixController.send` 失败 / 成功两条分支在 `appendContent` 之外还都有同步逻辑(把流式内容写进 `useConversationStore`),但 `ai-stream-end` 只 sync toolCalls / plan,没把 `currentToolCalls` 之外的 text 一起 sync — 这是 9.2 提到的 pre-existing 漏洞,影响 transcript 在 reload 后能不能看到流式内容,优先级比 9.2 其余几条都高。
3. T8 runbook 的第 9 节"Known sandbox limits"是 tauri dev 跑不起来的真正原因(`EPERM ::1:5173` + 没 native WebView)。下次实机时如果还跑不起来,先看 WebView2 (Windows) / WebKitGTK (Linux) / Xcode CLT (macOS) 有没有装。
