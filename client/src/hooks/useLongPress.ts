/**
 * useLongPress.ts — fire a callback when an element is pressed & held.
 *
 * Used for the hidden Super-Admin trigger: long-press the title to reveal the
 * key prompt. Works for mouse and touch via Pointer Events. Returns props to
 * spread onto the target element.
 */

import { useRef } from "react";

export function useLongPress(onLongPress: () => void, ms = 600) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const start = () => {
    clear();
    timer.current = setTimeout(onLongPress, ms);
  };
  const clear = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  return {
    onPointerDown: start,
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
  };
}
