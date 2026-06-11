/**
 * testItemsStore — dev/test injection point for `state.items`.
 *
 * Originally there was no way to populate the reasonix transcript
 * without a real CLI streaming chunks. The seedDemoConversation
 * helper created an entry in the conversation store but the
 * reasonix controller never read those messages, so the
 * "查看示例对话" button effectively did nothing visible. This
 * store fixes that by giving the test layer (and the demo
 * button) a way to push synthetic items directly into
 * `state.items`.
 *
 * The controller in `reasonixAdapter.ts` reads
 * `injectedItems` and prepends it to the items it builds from
 * the conversation store. A `clearInjectedItems` helper is
 * also exposed so tests can reset between runs.
 *
 * The store is intentionally tiny — it's not a general-purpose
 * event bus. Tests call it through `window.__testItems`
 * (wired up in `reasonixAdapter.ts`).
 */

import { create } from "zustand";
import type { ReasonixItem } from "./reasonixAdapter";

interface TestItemsState {
  injectedItems: ReasonixItem[];
  setInjectedItems: (items: ReasonixItem[]) => void;
  clearInjectedItems: () => void;
  appendInjectedItems: (items: ReasonixItem[]) => void;
}

export const useTestItemsStore = create<TestItemsState>((set) => ({
  injectedItems: [],
  setInjectedItems: (items) => set({ injectedItems: items }),
  appendInjectedItems: (items) =>
    set((state) => ({ injectedItems: [...state.injectedItems, ...items] })),
  clearInjectedItems: () => set({ injectedItems: [] }),
}));
