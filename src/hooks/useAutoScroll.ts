/**
 * useAutoScroll — AionUi `useAutoScroll` port.
 *
 * Originally from
 *   packages/desktop/src/renderer/pages/conversation/Messages/useAutoScroll.ts
 *
 * Strategy:
 *   - Track whether the user has intentionally scrolled away from the bottom.
 *   - Observe content/scroller size changes and keep the list pinned to the
 *     bottom only while auto-follow mode is active.
 *   - Use DOM-native `scrollIntoView` for explicit message jumps (used by
 *     `ChatMessageJumpEvent` and the target-message highlight).
 *
 * The IntentLoom port keeps the AionUi tuning numbers
 * (`AT_BOTTOM_THRESHOLD_PX = 100`, `FOLLOW_BOTTOM_THRESHOLD_PX = 4`,
 * `PROGRAMMATIC_SCROLL_GUARD_MS = 150`) verbatim — they were tuned against
 * real user behavior in AionUi and there's no reason to reinvent them.
 *
 * The only IntentLoom-specific changes are:
 *   - The `messages` element type is `ReasonixItem[]` (instead of
 *     AionUi's `TMessage[]`) so the caller can pass its existing store
 *     output directly.
 *   - The "new message follows" effect only auto-pins to bottom when the
 *     last item is a user message (position "right"), matching the
 *     existing `ReasonixTranscript` user/assistant split. Assistant and
 *     tool items deliberately do NOT trigger an auto-jump, because they
 *     stream in over multiple chunks and the user wants to read the
 *     growing content from where they left off, not get yanked to the
 *     bottom on every delta.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReasonixItem } from "@/lib/reasonixAdapter";

const PROGRAMMATIC_SCROLL_GUARD_MS = 150;
const AT_BOTTOM_THRESHOLD_PX = 100;
const FOLLOW_BOTTOM_THRESHOLD_PX = 4;

interface UseAutoScrollOptions {
  messages: ReasonixItem[];
  itemCount: number;
}

interface ScrollElementIntoViewOptions {
  behavior?: ScrollBehavior;
  block?: ScrollLogicalPosition;
}

export interface UseAutoScrollReturn {
  handleScrollerRef: (ref: HTMLDivElement | null) => void;
  handleContentRef: (ref: HTMLDivElement | null) => void;
  handleScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  handleWheel: (e: React.WheelEvent<HTMLDivElement>) => void;
  handlePointerDown: () => void;
  showScrollButton: boolean;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
  scrollElementIntoView: (element: HTMLElement | null, options?: ScrollElementIntoViewOptions) => void;
  hideScrollButton: () => void;
}

const getBottomGap = (element: HTMLElement): number =>
  element.scrollHeight - element.clientHeight - element.scrollTop;

/** Map a `ReasonixItem` to the AionUi `position` we use for the
 *  auto-follow decision. User bubbles are "right", everything else
 *  (assistant, tool, tool_group, plan, ...) is "left"/"center". */
function positionOf(item: ReasonixItem | undefined): "left" | "right" | "center" {
  if (!item) return "left";
  if (item.kind === "user") return "right";
  if (item.kind === "summary" || item.kind === "phase" || item.kind === "notice") return "center";
  return "left";
}

export function useAutoScroll({ messages, itemCount }: UseAutoScrollOptions): UseAutoScrollReturn {
  const [scrollerEl, setScrollerEl] = useState<HTMLDivElement | null>(null);
  const [contentEl, setContentEl] = useState<HTMLDivElement | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const userScrolledRef = useRef(false);
  const lastScrollTopRef = useRef(0);
  const previousListLengthRef = useRef(messages.length);
  const lastProgrammaticScrollTimeRef = useRef(0);
  const initialScrollDoneRef = useRef(false);
  const pendingAutoFollowFrameRef = useRef<number | null>(null);
  const userInputActiveRef = useRef(false);

  const markProgrammaticScroll = useCallback(() => {
    lastProgrammaticScrollTimeRef.current = Date.now();
  }, []);

  const updateBottomState = useCallback((element: HTMLDivElement) => {
    const bottomGap = getBottomGap(element);
    const withinButtonThreshold = bottomGap <= AT_BOTTOM_THRESHOLD_PX;
    const pinnedToBottom = bottomGap <= FOLLOW_BOTTOM_THRESHOLD_PX;
    setShowScrollButton(!withinButtonThreshold);

    if (pinnedToBottom) {
      userScrolledRef.current = false;
      userInputActiveRef.current = false;
      lastProgrammaticScrollTimeRef.current = Date.now() - (PROGRAMMATIC_SCROLL_GUARD_MS - 50);
    }

    return pinnedToBottom;
  }, []);

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      if (itemCount <= 0 || !scrollerEl) return;

      markProgrammaticScroll();
      scrollerEl.scrollTo({
        top: scrollerEl.scrollHeight - scrollerEl.clientHeight,
        behavior,
      });
      userScrolledRef.current = false;
      setShowScrollButton(false);
    },
    [itemCount, markProgrammaticScroll, scrollerEl]
  );

  const scheduleAutoFollow = useCallback(() => {
    if (!scrollerEl || userScrolledRef.current) return;

    if (pendingAutoFollowFrameRef.current !== null) {
      cancelAnimationFrame(pendingAutoFollowFrameRef.current);
    }

    pendingAutoFollowFrameRef.current = requestAnimationFrame(() => {
      pendingAutoFollowFrameRef.current = null;
      if (!scrollerEl || userScrolledRef.current) return;

      const gap = getBottomGap(scrollerEl);
      if (gap > 2) {
        scrollToBottom("auto");
      }
    });
  }, [scrollerEl, scrollToBottom]);

  const handleScrollerRef = useCallback((ref: HTMLDivElement | null) => {
    setScrollerEl(ref);
  }, []);

  const handleContentRef = useCallback((ref: HTMLDivElement | null) => {
    setContentEl(ref);
  }, []);

  const scrollElementIntoView = useCallback(
    (element: HTMLElement | null, options?: ScrollElementIntoViewOptions) => {
      if (!element) return;

      userScrolledRef.current = false;
      setShowScrollButton(false);
      markProgrammaticScroll();
      element.scrollIntoView({
        behavior: options?.behavior ?? "smooth",
        block: options?.block ?? "start",
        inline: "nearest",
      });
    },
    [markProgrammaticScroll]
  );

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const target = e.currentTarget;
      const currentScrollTop = target.scrollTop;
      const timeSinceGuard = Date.now() - lastProgrammaticScrollTimeRef.current;
      const delta = currentScrollTop - lastScrollTopRef.current;
      const bottomGap = getBottomGap(target);
      const pinnedToBottom = bottomGap <= FOLLOW_BOTTOM_THRESHOLD_PX;

      if (
        !pinnedToBottom &&
        Math.abs(delta) > 2 &&
        (userInputActiveRef.current || timeSinceGuard >= PROGRAMMATIC_SCROLL_GUARD_MS)
      ) {
        userScrolledRef.current = true;
      }

      if (pinnedToBottom) {
        userInputActiveRef.current = false;
      } else if (Math.abs(delta) > 2) {
        userInputActiveRef.current = false;
      }

      lastScrollTopRef.current = currentScrollTop;
      updateBottomState(target);
    },
    [updateBottomState]
  );

  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (Math.abs(e.deltaY) > 0 || Math.abs(e.deltaX) > 0) {
      userInputActiveRef.current = true;
    }
  }, []);

  const handlePointerDown = useCallback(() => {
    userInputActiveRef.current = true;
  }, []);

  useEffect(() => {
    if (!scrollerEl || !contentEl) return;

    const observer = new ResizeObserver(() => {
      scheduleAutoFollow();
      updateBottomState(scrollerEl);
    });

    observer.observe(scrollerEl);
    observer.observe(contentEl);

    return () => observer.disconnect();
  }, [contentEl, scheduleAutoFollow, scrollerEl, updateBottomState]);

  useEffect(() => {
    if (!scrollerEl || initialScrollDoneRef.current || itemCount === 0) return;

    initialScrollDoneRef.current = true;
    requestAnimationFrame(() => {
      scrollToBottom("auto");
      lastScrollTopRef.current = scrollerEl.scrollTop;
    });
  }, [itemCount, scrollerEl, scrollToBottom]);

  useEffect(() => {
    const currentListLength = messages.length;
    const previousLength = previousListLengthRef.current;
    const isNewMessage = currentListLength > previousLength;
    previousListLengthRef.current = currentListLength;

    if (!isNewMessage) return;

    const lastMessage = messages[messages.length - 1];
    if (positionOf(lastMessage) !== "right") return;

    userScrolledRef.current = false;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollToBottom("auto");
      });
    });
  }, [messages, scrollToBottom]);

  useEffect(() => {
    return () => {
      if (pendingAutoFollowFrameRef.current !== null) {
        cancelAnimationFrame(pendingAutoFollowFrameRef.current);
      }
    };
  }, []);

  const hideScrollButton = useCallback(() => {
    userScrolledRef.current = false;
    setShowScrollButton(false);
  }, []);

  return {
    handleScrollerRef,
    handleContentRef,
    handleScroll,
    handleWheel,
    handlePointerDown,
    showScrollButton,
    scrollToBottom,
    scrollElementIntoView,
    hideScrollButton,
  };
}
