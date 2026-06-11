/**
 * useCompositionInput — AionUi `useCompositionInput` port.
 *
 * Tracks the IME (input method editor) composition state of a
 * `<textarea>` so the composer can tell the difference between
 * a real Enter keypress (send the message) and an Enter that
 * the IME is using to commit a candidate (pinyin, kana, etc.).
 *
 * Background: every Chinese / Japanese / Korean IME on every
 * major OS uses Enter to "commit" the candidate currently
 * composed in the IME window. If the composer treats Enter as
 * "send the message", the user types "你好" (pinyin "nihao"),
 * presses Enter to confirm, and the textarea instead sends
 * "nihao" — the literal pinyin — to the model. AionUi solves
 * this by listening to `compositionstart` / `compositionend`
 * events and a "isComposing" flag on the synthetic event, then
 * gating the Enter handler on the flag.
 *
 * The hook returns:
 *   - `isComposing` — `true` while the IME is in composition
 *     mode (i.e. between `compositionstart` and `compositionend`).
 *   - `onCompositionStart` / `onCompositionEnd` — the matching
 *     React event handlers. Spread them on the textarea.
 *   - `guardKeyDown` — a small wrapper that callers compose
 *     around their existing `onKeyDown` to no-op Enter (and
 *     Shift+Enter is left to the caller to handle) while
 *     `isComposing` is `true`. The wrapper also reads the
 *     native `KeyboardEvent.isComposing` as a second source of
 *     truth, because some IMEs (older Safari, Linux IBus) skip
 *     the composition events when the user commits with a
 *     keyboard shortcut.
 *
 * AionUi reference: packages/desktop/src/renderer/hooks/
 *   useCompositionInput.ts (this file is a clean-room rewrite
 *   that keeps the same observable behaviour: the upstream
 *   implementation also tracks a "next-is-composition-start"
 *   hint from `keydown` event 229 to defend against IMEs that
 *   fire compositionstart on the same key tick as the
 *   `keydown` handler).
 */
import { useCallback, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type CompositionEventHandler } from "react";

export interface CompositionInput {
  /** True while the IME is composing (between compositionstart
   *  and compositionend). */
  isComposing: boolean;
  /** Spread on the `<textarea>` / `<input>`. */
  onCompositionStart: CompositionEventHandler<HTMLTextAreaElement | HTMLInputElement>;
  /** Spread on the `<textarea>` / `<input>`. */
  onCompositionEnd: CompositionEventHandler<HTMLTextAreaElement | HTMLInputElement>;
  /**
   * Wrap an existing `onKeyDown` so Enter is dropped while the
   * IME is composing. The wrapped handler is the caller's
   * original handler (which we still call for every non-Enter
   * key, and for Enter *after* the IME has finished
   * composing).
   */
  guardKeyDown: <E extends ReactKeyboardEvent<HTMLTextAreaElement | HTMLInputElement>>(
    original: (e: E) => void,
  ) => (e: E) => void;
}

/**
 * Build the IME-aware handlers. The `isComposing` state is
 * driven by the standard `compositionstart` / `compositionend`
 * events, with a 200ms safety latch (see below) so the
 * commit-Enter that some IMEs fire immediately after
 * `compositionend` is also caught.
 *
 * The safety latch is the small oddity: between
 * `compositionend` and the actual Enter that confirms the
 * candidate, some IMEs (notably macOS's native Pinyin in
 * certain states) fire Enter on the same tick. The DOM has
 * already cleared the `isComposing` flag, so the basic
 * `isComposing` check would let that Enter through and send
 * `nihao\n` to the model. We pin `isComposing` to `true` for
 * a 200 ms window after `compositionend` so the Enter that
 * follows inside that window is also dropped. 200 ms is
 * generous — a single human keypress is rarely under 50 ms
 * and never over 200 ms in practice — and short enough that
 * the user can press Enter to send the moment the candidate
 * is on screen.
 *
 * Returns the bound handlers; consumers spread the two
 * composition props and call `guardKeyDown` on their
 * onKeyDown. The hook is meant to be called once per
 * composer instance.
 */
export function useCompositionInput(): CompositionInput {
  const [isComposing, setIsComposing] = useState(false);
  // The latch timer is a ref so a re-render does not clear it.
  const latchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onCompositionStart: CompositionEventHandler<HTMLTextAreaElement | HTMLInputElement> = useCallback(() => {
    // Clear any pending safety latch from a previous (abandoned)
    // composition — the new composition fully owns the IME
    // state from here.
    if (latchTimerRef.current !== null) {
      clearTimeout(latchTimerRef.current);
      latchTimerRef.current = null;
    }
    setIsComposing(true);
  }, []);

  const onCompositionEnd: CompositionEventHandler<HTMLTextAreaElement | HTMLInputElement> = useCallback(() => {
    setIsComposing(false);
    // 200 ms safety latch — see the docstring above.
    if (latchTimerRef.current !== null) {
      clearTimeout(latchTimerRef.current);
    }
    latchTimerRef.current = setTimeout(() => {
      latchTimerRef.current = null;
    }, 200);
  }, []);

  const guardKeyDown = useCallback(
    <E extends ReactKeyboardEvent<HTMLTextAreaElement | HTMLInputElement>>(original: (e: E) => void) =>
      (e: E) => {
        // Drop Enter while:
        //  (a) isComposing is true (compositionstart..end window)
        //  (b) native event.isComposing is true (browser-side hint)
        //  (c) the safety latch from a recent compositionend is
        //      still armed
        const latched = latchTimerRef.current !== null;
        if (e.key === "Enter" && (isComposing || e.nativeEvent.isComposing || latched)) {
          e.preventDefault();
          return;
        }
        original(e);
      },
    [isComposing],
  );

  return { isComposing, onCompositionStart, onCompositionEnd, guardKeyDown };
}
