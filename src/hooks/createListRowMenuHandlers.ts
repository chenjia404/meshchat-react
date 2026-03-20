import type {
  MouseEventHandler,
  PointerEventHandler
} from "react";

export function createListRowMenuHandlers(
  onOpen: (clientX: number, clientY: number) => void
): {
  onPointerDown: PointerEventHandler;
  onPointerUp: PointerEventHandler;
  onPointerCancel: PointerEventHandler;
  onPointerMove: PointerEventHandler;
  onContextMenu: MouseEventHandler;
} {
  let timer: number | null = null;
  let startX = 0;
  let startY = 0;
  const clear = () => {
    if (timer != null) {
      window.clearTimeout(timer);
      timer = null;
    }
  };
  return {
    onPointerDown: e => {
      if (e.pointerType === "mouse") return;
      startX = e.clientX;
      startY = e.clientY;
      clear();
      timer = window.setTimeout(() => {
        onOpen(e.clientX, e.clientY);
        clear();
      }, 520);
    },
    onPointerUp: () => clear(),
    onPointerCancel: () => clear(),
    onPointerMove: e => {
      if (timer == null) return;
      const dx = Math.abs(e.clientX - startX);
      const dy = Math.abs(e.clientY - startY);
      if (dx > 10 || dy > 10) clear();
    },
    onContextMenu: e => {
      e.preventDefault();
      e.stopPropagation();
      onOpen(e.clientX, e.clientY);
    }
  };
}
