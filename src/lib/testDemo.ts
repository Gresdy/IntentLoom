/**
 * testDemo — one-shot injection of a fully-rendered example
 * conversation into `state.items`.
 *
 * AionUi port verification helper. The user's "查看示例对话"
 * button on the welcome screen used to be a no-op because
 * `seedDemoConversation` only created a record in the
 * conversation store — the reasonix controller never read
 * those messages. This file provides a parallel path that
 * pushes synthetic items straight into the test items
 * store, so the transcript renders them on the next render.
 *
 * It is exposed on `window.__seedTestDemo` so Playwright /
 * manual debugging can call it without going through the
 * button. The function returns the list of items it pushed
 * for snapshot verification.
 */

import type { ReasonixItem } from "./reasonixAdapter";
import { useTestItemsStore } from "./testItemsStore";

const t = (offsetMs: number) => Date.now() - offsetMs;

export function buildTestDemoItems(): ReasonixItem[] {
  return [
    // 1. agent_status — connecting
    {
      kind: "agent_status",
      id: "as-connecting",
      backend: "claude",
      status: "connecting",
      agentName: "Claude Code",
      createdAt: t(120_000),
    },
    // 2. agent_status — session_active (the final state of the session)
    {
      kind: "agent_status",
      id: "as-active",
      backend: "claude",
      status: "session_active",
      agentName: "Claude Code",
      createdAt: t(110_000),
    },

    // 3. user bubble
    {
      kind: "user",
      id: "u1",
      text: "帮我给 src/components/Chat 写一组单元测试，覆盖 5 个新消息类型的渲染分支",
      agentId: "claude",
    },

    // 4. plan — inline todo list, mid-flight
    {
      kind: "plan",
      id: "plan-1",
      title: "测试套件计划",
      entries: [
        { id: "p1", content: "读 src/components/Chat 下的 5 个新文件", status: "completed" },
        { id: "p2", content: "为 MessageAgentStatus / Tips / Plan 写 vitest", status: "in_progress" },
        { id: "p3", content: "为 MessageSkillSuggest / CronTrigger 写 vitest", status: "pending" },
        { id: "p4", content: "跑 npm test 确认全绿", status: "pending" },
      ],
      agentId: "claude",
      createdAt: t(95_000),
    },

    // 5. tips — a JSON-shaped warning
    {
      kind: "tips",
      id: "tip-1",
      level: "warning",
      text: '{"event":"rate_limit","retry_after":12,"unit":"seconds"}',
      agentId: "claude",
      createdAt: t(90_000),
    },

    // 6. tips — structured error
    {
      kind: "tips",
      id: "tip-err",
      level: "error",
      text: "raw error text",
      code: "INVALID_KEY",
      structuredError: {
        message: "Provider key invalid or revoked",
        code: "INVALID_KEY",
        ownership: "user_llm_provider",
        retryable: false,
        resolution: "check_provider_credentials",
        detail: "401 Unauthorized from api.anthropic.com",
      },
      agentId: "claude",
      createdAt: t(88_000),
    },

    // 7. assistant with thinking
    {
      kind: "assistant",
      id: "a1",
      text: "我看了一下这 5 个新文件，MessageAgentStatus 的状态机最复杂。开始写测试。",
      streaming: false,
      reasoning:
        "用户让我给 5 个新组件写测试。先看每个组件导入了什么、render 出口是什么。MessageAgentStatus 有 5 种状态，MessageTips 有 4 种 level + JSON auto-highlight，MessagePlan 有折叠逻辑，MessageSkillSuggest 有 onAccept / onDismiss，MessageCronTrigger 有 onNavigate。",
      agentId: "claude",
    },

    // 8. tool call — Edit with diff
    {
      kind: "tool",
      id: "t-edit",
      name: "Edit",
      args: {
        file_path: "src/test/MessageAgentStatus.test.tsx",
        old_string: "it('renders', () => null)",
        new_string: "it('renders 5 status badges', () => null)",
      },
      status: "completed",
      result: "ok",
      diff: [
        { type: "remove", text: "it('renders', () => null)" },
        { type: "add", text: "it('renders 5 status badges', () => null)" },
      ],
      kind2: "edit",
      agentId: "claude",
    },

    // 9. tool call — Bash (completed)
    {
      kind: "tool",
      id: "t-bash",
      name: "Bash",
      args: { command: "npx vitest run src/test/MessageAgentStatus.test.tsx 2>&1 | tail -20" },
      status: "completed",
      result: "✓ 5 tests passed",
      kind2: "execute",
      agentId: "claude",
    },

    // 10. tool call — permission pending
    {
      kind: "permission",
      id: "perm-bash",
      toolName: "Bash",
      args: { command: "rm -rf node_modules/.cache && npm install" },
      reason: "需要清缓存并重装依赖",
      status: "pending",
      agentId: "claude",
    },

    // 11. tool_group — multiple tools in a row
    {
      kind: "tool_group",
      id: "g1",
      agentId: "claude",
      tools: [
        {
          kind: "tool",
          id: "g1-0",
          name: "Read",
          args: { file_path: "src/components/Chat/MessagePlan.tsx" },
          status: "completed",
          result: "export function MessagePlan...",
          kind2: "read",
          agentId: "claude",
        },
        {
          kind: "tool",
          id: "g1-1",
          name: "Write",
          args: {
            file_path: "src/test/MessagePlan.test.tsx",
            content: "import { render, screen } from '@testing-library/react';\n...",
          },
          status: "completed",
          result: "wrote 80 lines",
          diff: [
            { type: "add", text: "import { render, screen } from '@testing-library/react';" },
            { type: "add", text: "import { MessagePlan } from '@/components/Chat/MessagePlan';" },
            { type: "add", text: "describe('MessagePlan', () => {" },
          ],
          kind2: "write",
          agentId: "claude",
        },
      ],
    },

    // 12. skill_suggest — a Skill recommendation
    {
      kind: "skill_suggest",
      id: "ss-1",
      name: "code-review",
      description: "审查本次变更的代码，识别潜在的边界 case 与 race condition",
      content: "你是一个严格的代码审查员。请审查上面的 diff 并指出：\n1. 边界 case 遗漏\n2. 异步竞态\n3. 错误处理缺失\n4. 性能问题",
      agentId: "claude",
      createdAt: t(40_000),
    },

    // 13. cron_trigger — a scheduled task fired
    {
      kind: "cron_trigger",
      id: "ct-1",
      cronJobId: "morning-digest",
      cronJobName: "morning-digest",
      triggeredAt: t(30_000),
      agentId: "claude",
    },

    // 14. final assistant message
    {
      kind: "assistant",
      id: "a-final",
      text: "全部 5 个组件的 vitest 已写好并通过，npm test 现在 297/297 绿。",
      streaming: false,
      reasoning: "已经把 5 个组件的测试都跑过了，全部通过。",
      agentId: "claude",
    },

    // 15. summary — artifact tally
    {
      kind: "summary",
      id: "sum-1",
      tally: {
        added: 3,
        modified: 2,
        deleted: 0,
        commands: 6,
        filesTouched: ["src/test/MessageAgentStatus.test.tsx", "src/test/MessageTips.test.tsx", "src/test/MessagePlan.test.tsx"],
      },
      agentId: "claude",
    },
  ];
}

export function seedTestDemo(): ReasonixItem[] {
  const items = buildTestDemoItems();
  useTestItemsStore.getState().setInjectedItems(items);
  // dev log so the integration test can verify the call landed
  if (typeof window !== "undefined") {
    // eslint-disable-next-line no-console
    console.log("[seedTestDemo] injected", items.length, "items");
  }
  return items;
}

export function clearTestDemo(): void {
  useTestItemsStore.getState().clearInjectedItems();
}

// Expose on window for dev tools / Playwright. The functions are
// idempotent — calling `seedTestDemo` twice yields the same state.
if (typeof window !== "undefined") {
  (window as any).__seedTestDemo = seedTestDemo;
  (window as any).__clearTestDemo = clearTestDemo;
  (window as any).__buildTestDemoItems = buildTestDemoItems;
  (window as any).__testItemsStore = useTestItemsStore;
}
