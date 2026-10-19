"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import styles from "./dialog.module.css";

const modalSessions = new Map<HTMLDialogElement, HTMLElement | null>();
let previousBodyOverflow = "";

function openModal(dialog: HTMLDialogElement) {
  let trigger = document.activeElement as HTMLElement | null;
  // A dialog launched from a closing drawer should return to the drawer's opener.
  while (trigger) {
    const owner = trigger.closest("dialog");
    if (!owner || owner.dataset.state !== "closing" || !modalSessions.has(owner)) break;
    trigger = modalSessions.get(owner) ?? null;
  }
  if (!modalSessions.size) previousBodyOverflow = document.body.style.overflow;
  modalSessions.set(dialog, trigger);
  dialog.showModal();
  dialog.querySelector<HTMLElement>("[data-initial-focus], [autofocus]")?.focus();
  document.body.style.overflow = "hidden";
}

function closeModal(dialog: HTMLDialogElement) {
  if (!modalSessions.has(dialog)) return;
  const trigger = modalSessions.get(dialog);
  dialog.close();
  modalSessions.delete(dialog);
  if (!modalSessions.size) document.body.style.overflow = previousBodyOverflow;
  if (!document.querySelector("dialog[open]")) {
    const canRestore = trigger?.isConnected && trigger.getClientRects().length > 0 &&
      !trigger.closest("[inert], dialog:not([open])");
    const target = canRestore ? trigger : document.querySelector<HTMLElement>("main[tabindex]");
    target?.focus({ preventScroll: true });
  }
}

export function Dialog({
  title,
  children,
  onClose,
  className = "",
  variant,
  open = true,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
  variant?: "navigation";
  open?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const animated = variant === "navigation";
  useEffect(() => {
    const dialog = ref.current;
    const viewport = window.visualViewport;
    const resize = () => {
      dialog?.style.setProperty(
        "--visible-height",
        `${viewport?.height ?? window.innerHeight}px`,
      );
      dialog?.style.setProperty(
        "--keyboard-inset",
        `${Math.max(0, window.innerHeight - (viewport?.height ?? window.innerHeight) - (viewport?.offsetTop ?? 0))}px`,
      );
    };
    resize();
    viewport?.addEventListener("resize", resize);
    viewport?.addEventListener("scroll", resize);
    return () => {
      viewport?.removeEventListener("resize", resize);
      viewport?.removeEventListener("scroll", resize);
      if (dialog) closeModal(dialog);
    };
  }, []);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (open) {
      if (!dialog.open) {
        dialog.dataset.state = "closed";
        openModal(dialog);
        if (animated && !motion.matches) {
          // Establish the off-screen start before transitioning the new top layer.
          void window.getComputedStyle(dialog).transform;
          void window.getComputedStyle(dialog, "::backdrop").opacity;
        }
      }
      dialog.dataset.state = "open";
      return;
    }
    if (!dialog.open) return;
    if (!animated || motion.matches) {
      dialog.dataset.state = "closed";
      closeModal(dialog);
      return;
    }

    dialog.dataset.state = "closing";
    let cancelled = false;
    const finish = () => {
      if (cancelled) return;
      cancelled = true;
      dialog.dataset.state = "closed";
      closeModal(dialog);
    };
    const transitionEnd = (event: TransitionEvent) => {
      if (event.target === dialog && event.propertyName === "transform" && !event.pseudoElement) finish();
    };
    const motionChange = () => { if (motion.matches) finish(); };
    dialog.addEventListener("transitionend", transitionEnd);
    motion.addEventListener("change", motionChange);
    // Also finish if the transition is interrupted by a viewport or style change.
    const timeout = window.setTimeout(finish, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      dialog.removeEventListener("transitionend", transitionEnd);
      motion.removeEventListener("change", motionChange);
    };
  }, [open, animated]);
  return (
    <dialog
      ref={ref}
      className={`${styles["app-dialog"]} ${animated ? styles["navigation-dialog"] : ""} ${className}`}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        const popup = event.currentTarget.querySelector<HTMLElement>("[popover]:popover-open");
        if (popup) {
          popup.hidePopover();
          return;
        }
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const bounds = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          )
            onClose();
        }
      }}
    >
      <div className={styles["dialog-heading"]}>
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
