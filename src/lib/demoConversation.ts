// Demo conversation seeder — drops a fully-rendered example turn into
// the active conversation so the user can see chat + thinking +
// tool-call rendering live in the browser, without needing a real
// Claude CLI to be installed. Pattern follows aionui's first-launch
// "see it in action" affordance: one click, the transcript lights up.
import { useConversationStore } from "@/stores/conversationStore";
import type { Message, ToolCall } from "@/types/message";
import { useModelStore } from "@/stores/useModelStore";

const generateId = () => Math.random().toString(36).substring(2, 15);

export function seedDemoConversation(): void {
  const model = useModelStore.getState();
  const agentId = model.currentApp || "claude";
  const conversationId = generateId();
  const now = Date.now();

  const userMsg: Message = {
    id: generateId(),
    type: "text",
    role: "user",
    content: "帮我分析 IntentLoom 的 sidebar 组件结构，看看能不能抽出复用的逻辑。",
    timestamp: now,
  };

  const tc1: ToolCall = {
    id: "tc-tree",
    name: "Bash",
    arguments: { command: "ls -la src/ && find src -name '*.tsx' -path '*idebar*'" },
    status: "completed",
    result: "src/\n├── App.tsx\n├── ReasonixApp.tsx\n├── components/\n│   ├── Chat/\n│   ├── LeftPanel/\n│   └── layout/\n├── lib/\n├── stores/\n└── styles/\n\nsrc/components/LeftPanel/  (项目面板，未使用)",
    kind: "execute",
    title: "Inspect project layout",
  };

  const tc2: ToolCall = {
    id: "tc-reasonix",
    name: "Read",
    arguments: { file_path: "/Users/zyh/PycharmProjects/IntentLoom/src/ReasonixApp.tsx", offset: 420, limit: 60 },
    status: "completed",
    result: "<nav className={\`sidebar\${isSidebarExpanded ? \" sidebar--expanded\" : \"\"}\`} data-testid=\"sidebar\" data-tour=\"sidebar\" onMouseEnter={...} onMouseLeave={...}>\n  <div className=\"sidebar__header\">…</div>\n  <div className=\"sidebar__nav\">\n    {NAV_GROUPS.map((group, gi) => (\n      <div key={gi} className=\"sidebar__nav-group\">\n        {isSidebarExpanded && group.label && (…)}\n        {group.items.map((item) => (\n          <button … className=\"sidebar__nav-item…\" />\n        ))}\n      </div>\n    ))}\n  </div>",
    kind: "read",
    title: "Read sidebar JSX",
  };

  const tc3: ToolCall = {
    id: "tc-css",
    name: "Read",
    arguments: { file_path: "/Users/zyh/PycharmProjects/IntentLoom/src/styles/globals.css", offset: 1040, limit: 40 },
    status: "completed",
    result: "/* Pill-shaped nav button. The collapsed variant centers the icon; the expanded variant adds horizontal margin so the pill doesn't touch the rail edge. */\n.sidebar__nav-item { display: flex; align-items: center; gap: 10px; padding: 8px; border-radius: 8px; }\n.sidebar.sidebar--expanded .sidebar__nav-item { margin: 1px 8px; padding: 7px 10px; }\n.sidebar__nav-item:hover, .sidebar__nav-item.active { background: var(--bg-elev); color: var(--fg); }",
    kind: "read",
    title: "Read sidebar pill CSS",
  };

  const tc4: ToolCall = {
    id: "tc-grep",
    name: "Grep",
    arguments: { pattern: "isSidebarHovered|isSidebarExpanded", output_mode: "content", path: "src" },
    status: "completed",
    result: "src/ReasonixApp.tsx:159:  const [isSidebarHovered, setIsSidebarHovered] = useState(false);\nsrc/ReasonixApp.tsx:160:  const [isSidebarPinned, setIsSidebarPinned] = useState(false);\nsrc/ReasonixApp.tsx:163:    isSidebarHovered || isSidebarPinned || rightPanelOpen;\nsrc/ReasonixApp.tsx:428:        className={\`sidebar\${isSidebarExpanded ? \" sidebar--expanded\" : \"\"}\`}",
    kind: "execute",
    title: "Search for existing rail pattern",
  };

  // An Edit with a real `diff` exercises the inline-diff branch of
  // `ToolCard` (the one that lights up W3 of the loom plan). The
  // diff shape mirrors what `parseDiff` / `inferToolKind` produce
  // on the live stream — `type: "diff"` paired with `oldText` /
  // `newText` so the reviewer can scan both halves side by side.
  const tc5: ToolCall = {
    id: "tc-edit",
    name: "Edit",
    arguments: {
      file_path: "/Users/zyh/PycharmProjects/IntentLoom/src/ReasonixApp.tsx",
      old_string: "<nav ...>",
      new_string: "<nav aria-label=\"Primary navigation\" ...>",
    },
    status: "completed",
    result: "File edited successfully.",
    kind: "edit",
    title: "Add aria-label to <nav> for screen readers",
    diff: [
      {
        type: "diff",
        path: "/Users/zyh/PycharmProjects/IntentLoom/src/ReasonixApp.tsx",
        oldText: '  data-testid="sidebar"',
        newText: '  data-testid="sidebar"\n  aria-label="Primary navigation"',
      },
    ],
  };

  const assistantMsg: Message = {
    id: generateId(),
    type: "text",
    role: "assistant",
    content: [
      "IntentLoom 现在只有 **一个** sidebar —— 写在 `ReasonixApp.tsx` 里，跟顶层 `app` 布局和 right-panel 状态机耦合在一起，没有独立的组件。",
      "",
      "观察后我建议三步走：",
      "",
      "1. 把 `<nav className=\"sidebar\">` 抽成 `components/Sidebar/Sidebar.tsx`，只接受 `expanded: boolean` 和 `items: NavItem[]` 两个 prop；",
      "2. 提一个 `useIconRail(items, isActive)` hook，统一处理「hover/pin/active」三态的展开判定和 tooltip；",
      "3. 借这次抽取顺手把 nav-item 的 `aria-current` 和键盘导航补上，让 sidebar 真正可以无鼠标使用。",
      "",
      "如果你同意，我可以开一个 plan，分三步把现在的 56 行业务代码迁出去。",
    ].join("\n"),
    timestamp: now + 1,
    thinking: [
      "用户想分析 sidebar 能不能抽出复用逻辑。先看一眼仓库结构。",
      "",
      "1. 只有一个 sidebar 实现在 ReasonixApp.tsx 第 421 行附近（inline 渲染，没有独立组件）。",
      "2. 展开行为：isSidebarHovered || isSidebarPinned || rightPanelOpen，集中在 163 行。",
      "3. 视觉：.sidebar__nav-item 在 collapsed/expanded 下走不同 padding+margin，active 用 var(--bg-elev) + var(--accent)。",
      "",
      "项目里没有第二个 icon-rail 形态（grep 'isSidebarHovered' 只命中 ReasonixApp.tsx），所以这是「唯一实现」。",
      "",
      "复用价值：",
      " - 三个展开源（hover / pin / active）分散在 React state、CSS 变量、URL 三处，新人理解成本高；",
      " - 当前 toggle 按钮同时承担「pin」和「open」的语义，未来加设置页会很乱；",
      " - nav-item 的 active 高亮、键盘可达、a11y 都还没做。",
      "",
      "抽出方案：",
      " - Sidebar.tsx 只关心渲染；",
      " - useIconRail(items) hook 返回 { expanded, isActive, onHover, onLeave, onTogglePin }；",
      " - 这样以后做 settings 的 icon-rail、或者文档的 outline 都能复用。",
    ].join("\n"),
    // tc5 (Edit) appended after the existing four so the transcript
    // walks the user through read → search → execute → edit in the
    // same order the assistant described them in the thinking block.
    toolCalls: [tc1, tc2, tc3, tc4, tc5],
  };

  useConversationStore.setState((state) => ({
    conversations: [
      {
        id: conversationId,
        name: "示例：sidebar 复用分析",
        createdAt: now,
        updatedAt: now + 1,
        metadata: { agentId },
        messages: [userMsg, assistantMsg],
      },
      ...state.conversations,
    ],
    currentConversationId: conversationId,
  }));
}
