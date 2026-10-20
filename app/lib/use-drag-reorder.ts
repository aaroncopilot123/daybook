"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { flushSync } from "react-dom";

// Pixels the pointer moves before a press on a grip becomes a drag.
const THRESHOLD = 4;
const MAX_SCROLL_SPEED = 12;
const SETTLE_MS = 150;

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// The nearest scrolling ancestor, such as a dialog; null for the page.
function scrollParent(element: HTMLElement) {
  for (let node = element.parentElement; node && node !== document.body; node = node.parentElement)
    if (/auto|scroll/.test(getComputedStyle(node).overflowY)) return node;
  return null;
}

const slide = (element: Element, delta: number) =>
  element.animate([{ transform: `translateY(${delta}px)` }, { transform: "none" }], {
    duration: SETTLE_MS,
    easing: "cubic-bezier(0.4, 0, 0.2, 1)",
  });

// Runs `change`, which must render synchronously, and slides the list's items from where they
// were to where they land.
export function animateReorder(list: Element | null | undefined, change: () => void) {
  const items = list ? [...list.children] : [];
  const tops = new Map(items.map((item) => [item, item.getBoundingClientRect().top]));
  change();
  if (reducedMotion()) return;
  for (const [item, top] of tops) {
    const delta = top - item.getBoundingClientRect().top;
    if (delta) slide(item, delta);
  }
}

// Runs `change`, which must render synchronously, and slides every sortable row in `group`
// from where it was to where it lands, even when React remounts it in another list.
export function animateAcross(group: Element, change: () => void) {
  const rows = () => [...group.querySelectorAll<HTMLElement>("[data-sort-id]")];
  const tops = new Map(rows().map((row) => [row.dataset.sortId, row.getBoundingClientRect().top]));
  change();
  if (reducedMotion()) return;
  for (const row of rows()) {
    const top = tops.get(row.dataset.sortId);
    const delta = top === undefined ? 0 : top - row.getBoundingClientRect().top;
    if (delta) slide(row, delta);
  }
}

type Zone = {
  element: HTMLElement;
  key: string;
  // Its sortable list, if it shows one: an empty or collapsed zone may not.
  list: HTMLElement | null;
  accepts: boolean;
  top: number;
  bottom: number;
};

const rowsOf = (list: HTMLElement | null) =>
  list
    ? [...list.children].filter((child): child is HTMLElement => child instanceof HTMLLIElement)
    : [];

// Drag to reorder the items of a list. A grip calls `start` from its pointerdown; the item is
// its closest `[data-sort-id]` and the list that item's parent. While dragging, the list gets
// `data-sorting` and its items `--shift-y`; the dragged item gets `data-dragging` and
// `--drag-y`, and the list `data-settling` as the item glides into place. `onDrop` gets the
// list's sortable ids in their new order and must render synchronously with them.
//
// A list can also sit in a zone, `[data-sort-zone="key"]` (a section that holds a
// `[data-sort-list]`), inside a `[data-sort-group]`. Then the item can be dropped into any
// zone of the group, except one marked `data-sort-source-only`. Over another zone, the item's
// own list closes no gap; that zone gets `data-drop-target`, and the row the item would land
// before gets `data-drop-before` (or the zone `data-drop-end`), and the item takes the zone's
// `data-sort-label` as `data-drop-label`. `onDrop` then gets that zone's
// ids with the item in its new place, and the zone's key.
export function useDragReorder({ topInset }: { topInset?: () => number } = {}) {
  // The id being dragged, for styles outside the list.
  const [dragging, setDragging] = useState<string | null>(null);
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);

  function start(
    event: ReactPointerEvent<HTMLElement>,
    onDrop: (order: string[], zone: string | null) => void,
  ) {
    const item = event.currentTarget.closest<HTMLElement>("[data-sort-id]");
    const list = item?.parentElement;
    if (event.button !== 0 || !event.isPrimary || stop.current || !item || !list) return;
    // No text selection or focus change from the press.
    event.preventDefault();
    const grip = event.currentTarget;
    const pointerId = event.pointerId;
    grip.setPointerCapture(pointerId);
    const scroller = scrollParent(list);
    const scrollTop = () => (scroller ? scroller.scrollTop : window.scrollY);
    const ownZone = list.closest<HTMLElement>("[data-sort-zone]");
    const group = ownZone?.closest<HTMLElement>("[data-sort-group]") ?? null;
    const startY = event.clientY;
    const startScroll = scrollTop();
    let pointerY = startY;
    let state: "pressing" | "dragging" | "settling" = "pressing";
    let items: HTMLElement[] = [];
    let tops: number[] = [];
    let heights: number[] = [];
    let gap = 0;
    let from = 0;
    let to = 0;
    let frame = 0;
    let timer = 0;
    // With a group: its zones and bounds, the zone being hovered when it isn't the item's own,
    // that zone's rows with their middles, and where the item would land among them.
    let zones: Zone[] = [];
    let groupTop = 0;
    let groupBottom = 0;
    let target: Zone | null = null;
    let targetRows: HTMLElement[] = [];
    let middles: number[] = [];
    let index = -1;

    // In document coordinates, like `tops`, so scrolling doesn't move them. Days can load
    // mid-drag, so this runs again whenever the number of zones changes.
    const measureZones = () => {
      if (!group) return;
      const offset = scrollTop();
      zones = [...group.querySelectorAll<HTMLElement>("[data-sort-zone]")].map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          element,
          key: element.dataset.sortZone ?? "",
          list: element.querySelector<HTMLElement>("[data-sort-list]"),
          accepts: element === ownZone || !("sortSourceOnly" in element.dataset),
          top: rect.top + offset,
          bottom: rect.bottom + offset,
        };
      });
      const rect = group.getBoundingClientRect();
      groupTop = rect.top + offset;
      groupBottom = rect.bottom + offset;
      if (target) leaveTarget();
    };

    // The accepting zone nearest the dragged item's middle.
    const zoneAt = (center: number) => {
      let best: Zone | null = null;
      let distance = Infinity;
      for (const zone of zones) {
        if (!zone.accepts) continue;
        const away = center < zone.top ? zone.top - center : center > zone.bottom ? center - zone.bottom : 0;
        // Ties go to the item's own zone.
        if (away < distance || (away === distance && zone.element === ownZone)) {
          best = zone;
          distance = away;
        }
      }
      return best;
    };

    const clearMarks = () => {
      if (!target) return;
      delete target.element.dataset.dropTarget;
      delete target.element.dataset.dropEnd;
      targetRows.forEach((row) => delete row.dataset.dropBefore);
    };
    const leaveTarget = () => {
      clearMarks();
      delete item.dataset.dropLabel;
      target = null;
      targetRows = [];
      index = -1;
    };

    const begin = () => {
      state = "dragging";
      list.querySelectorAll("details[open]").forEach((menu) => menu.removeAttribute("open"));
      // Collapses a dragged parent's subtasks, so measure after.
      item.dataset.dragging = "";
      list.dataset.sorting = "";
      items = rowsOf(list);
      from = to = items.indexOf(item);
      gap = parseFloat(getComputedStyle(list).rowGap) || 0;
      const offset = scrollTop();
      tops = items.map((child) => child.getBoundingClientRect().top + offset);
      heights = items.map((child) => child.getBoundingClientRect().height);
      measureZones();
      setDragging(item.dataset.sortId ?? null);
      frame = requestAnimationFrame(autoScroll);
    };

    // Opens a gap in the item's own list at `next`.
    const shiftTo = (next: number) => {
      if (next === to) return;
      to = next;
      const height = heights[from];
      items.forEach((other, i) => {
        const shift =
          from < to && i > from && i <= to
            ? -(height + gap)
            : to < from && i >= to && i < from
              ? height + gap
              : 0;
        if (i !== from) other.style.setProperty("--shift-y", `${shift}px`);
      });
    };

    // Marks where the item would land in another zone.
    const aimAt = (zone: Zone, center: number) => {
      if (target !== zone) {
        leaveTarget();
        target = zone;
        targetRows = rowsOf(zone.list);
        const offset = scrollTop();
        middles = targetRows.map((row) => {
          const rect = row.getBoundingClientRect();
          return rect.top + offset + rect.height / 2;
        });
        zone.element.dataset.dropTarget = "";
        // The item can cover the zone's heading, so it carries the zone's name.
        if (zone.element.dataset.sortLabel) item.dataset.dropLabel = zone.element.dataset.sortLabel;
      }
      const next = middles.filter((middle) => middle < center).length;
      if (next === index) return;
      clearMarks();
      zone.element.dataset.dropTarget = "";
      index = next;
      if (index < targetRows.length) targetRows[index].dataset.dropBefore = "";
      else zone.element.dataset.dropEnd = "";
    };

    const update = () => {
      const height = heights[from];
      if (group && group.querySelectorAll("[data-sort-zone]").length !== zones.length) measureZones();
      // The item can reach half its height past either end of its list, or of the group.
      const top = Math.min(
        Math.max(
          tops[from] + pointerY - startY + scrollTop() - startScroll,
          (group ? groupTop : tops[0]) - height / 2,
        ),
        (group ? groupBottom : tops.at(-1)! + heights.at(-1)!) - height / 2,
      );
      item.style.setProperty("--drag-y", `${top - tops[from]}px`);
      const center = top + height / 2;
      const zone = group ? zoneAt(center) : null;
      if (zone && zone.element !== ownZone) {
        // Leaving its own list closes the gap there.
        shiftTo(from);
        aimAt(zone, center);
        return;
      }
      if (target) leaveTarget();
      shiftTo(items.filter((_, i) => i !== from && tops[i] + heights[i] / 2 < center).length);
    };

    // Scrolls while the pointer is near the top or bottom edge, faster the closer it gets.
    const autoScroll = () => {
      if (state !== "dragging") return;
      const viewport = window.visualViewport;
      const bounds = scroller?.getBoundingClientRect();
      const top = bounds ? bounds.top : (topInset?.() ?? 0);
      const bottom = bounds
        ? bounds.bottom
        : viewport
          ? viewport.offsetTop + viewport.height
          : window.innerHeight;
      const edge = scroller ? 48 : 64;
      const speed =
        pointerY < top + edge
          ? -Math.min(1, (top + edge - pointerY) / edge)
          : pointerY > bottom - edge
            ? Math.min(1, (pointerY - bottom + edge) / edge)
            : 0;
      if (speed) {
        (scroller ?? window).scrollBy(0, speed * MAX_SCROLL_SPEED);
        update();
      }
      frame = requestAnimationFrame(autoScroll);
    };

    const clear = () => {
      leaveTarget();
      delete item.dataset.dragging;
      delete list.dataset.sorting;
      delete list.dataset.settling;
      for (const other of items) {
        other.style.removeProperty("--shift-y");
        other.style.removeProperty("--drag-y");
      }
    };

    const finish = (drop: boolean) => {
      detach();
      const ids = items.map((child) => child.dataset.sortId);
      ids.splice(to, 0, ...ids.splice(from, 1));
      // Render the new order before the transforms go, so nothing jumps.
      flushSync(() => {
        if (drop) onDrop(ids.filter((id) => id !== undefined), ownZone?.dataset.sortZone ?? null);
        setDragging(null);
      });
      clear();
    };

    // Drops the item into another zone. It's rendered there at once, and every row slides
    // from where it was on screen to where it landed.
    const dropAcross = (zone: Zone) => {
      state = "settling";
      cancelAnimationFrame(frame);
      detach();
      const ids = targetRows.map((row) => row.dataset.sortId);
      ids.splice(index, 0, item.dataset.sortId);
      animateAcross(group!, () => {
        flushSync(() => {
          onDrop(ids.filter((id) => id !== undefined), zone.key);
          setDragging(null);
        });
        clear();
      });
    };

    // Glides the item into its new slot, or everything back where it started.
    const settle = (drop: boolean) => {
      state = "settling";
      cancelAnimationFrame(frame);
      leaveTarget();
      let offset = 0;
      items.forEach((other, i) => {
        if (drop && from < to && i > from && i <= to) offset += heights[i] + gap;
        if (drop && to < from && i >= to && i < from) offset -= heights[i] + gap;
        if (!drop) other.style.setProperty("--shift-y", "0px");
      });
      if (reducedMotion()) return finish(drop);
      list.dataset.settling = "";
      item.style.setProperty("--drag-y", `${offset}px`);
      const done = (event?: TransitionEvent) => {
        if (event && (event.target !== item || event.propertyName !== "transform")) return;
        item.removeEventListener("transitionend", done);
        window.clearTimeout(timer);
        finish(drop);
      };
      item.addEventListener("transitionend", done);
      // Also finish when there's nothing left to move.
      timer = window.setTimeout(done, SETTLE_MS + 50);
    };

    const cancel = () => {
      if (state === "dragging") settle(false);
      else if (state === "pressing") detach();
    };
    const move = (event: PointerEvent) => {
      if (event.pointerId !== pointerId || state === "settling") return;
      pointerY = event.clientY;
      if (state === "pressing") {
        if (Math.abs(pointerY - startY) < THRESHOLD) return;
        begin();
      }
      update();
    };
    const up = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      if (state === "dragging" && target) dropAcross(target);
      else if (state === "dragging") settle(to !== from);
      else if (state === "pressing") detach();
    };
    const pointerCancel = (event: PointerEvent) => {
      if (event.pointerId === pointerId) cancel();
    };
    // Escape cancels only the drag, never a dialog around the list.
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || state !== "dragging") return;
      event.preventDefault();
      event.stopPropagation();
      cancel();
    };
    const scroll = () => {
      if (state === "dragging") update();
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") cancel();
    };
    const detach = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", pointerCancel);
      window.removeEventListener("keydown", keydown, true);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", visibility);
      grip.removeEventListener("lostpointercapture", cancel);
      stop.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", pointerCancel);
    window.addEventListener("keydown", keydown, true);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", visibility);
    grip.addEventListener("lostpointercapture", cancel);
    // On unmount, drop everything without committing.
    stop.current = () => {
      detach();
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      clear();
    };
  }

  return { dragging, start };
}
