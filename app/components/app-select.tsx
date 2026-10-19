"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import styles from "./app-select.module.css";

type SelectOption = { value: string; label: string; className?: string };

export function AppSelect({ label, value, options, onChange, icon, className = "", inheritColor = false }: {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  icon: ReactNode;
  className?: string;
  // Let the trigger take its colour from className, e.g. a priority tone.
  inheritColor?: boolean;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const search = useRef({ text: "", time: 0 });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));

  function positionMenu() {
    const button = trigger.current;
    const popup = menu.current;
    if (!button || !popup?.matches(":popover-open")) return;
    const rect = button.getBoundingClientRect();
    const viewport = window.visualViewport;
    const top = viewport?.offsetTop ?? 0;
    const left = viewport?.offsetLeft ?? 0;
    const right = left + (viewport?.width ?? window.innerWidth);
    const bottom = top + (viewport?.height ?? window.innerHeight);
    const width = Math.min(Math.max(220, rect.width), right - left - 16);
    popup.style.width = `${width}px`;
    const below = Math.max(0, bottom - rect.bottom - 14);
    const above = Math.max(0, rect.top - top - 14);
    const preferredHeight = Math.min(280, popup.scrollHeight);
    const placeBelow = below >= preferredHeight || below >= above;
    const height = Math.min(280, placeBelow ? below : above);
    popup.style.maxHeight = `${height}px`;
    popup.style.left = `${Math.max(left + 8, Math.min(rect.left, right - width - 8))}px`;
    popup.style.top = `${placeBelow ? rect.bottom + 6 : rect.top - Math.min(height, popup.scrollHeight) - 6}px`;
  }

  useEffect(() => {
    const viewport = window.visualViewport;
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);
    viewport?.addEventListener("resize", positionMenu);
    viewport?.addEventListener("scroll", positionMenu);
    return () => {
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
      viewport?.removeEventListener("resize", positionMenu);
      viewport?.removeEventListener("scroll", positionMenu);
    };
  }, []);

  function highlight(index: number) {
    setActive(index);
    menu.current?.children[index]?.scrollIntoView({ block: "nearest" });
  }

  function show(index = selectedIndex) {
    if (!options.length) return;
    search.current = { text: "", time: 0 };
    menu.current?.showPopover();
    positionMenu();
    setOpen(true);
    highlight(index);
  }

  function close(restoreFocus = false) {
    menu.current?.hidePopover();
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  }

  function choose(index: number) {
    if (!options[index]) return;
    onChange(options[index].value);
    close(true);
  }

  function handleKey(event: KeyboardEvent<HTMLButtonElement>) {
    const isOpen = menu.current?.matches(":popover-open");
    if (event.key === "Escape" && isOpen) {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (event.key === "Tab") {
      close();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (isOpen) choose(active);
      else show();
      return;
    }
    const navigation = ["ArrowDown", "ArrowUp", "Home", "End"];
    if (navigation.includes(event.key)) {
      event.preventDefault();
      let index = isOpen ? active : selectedIndex;
      if (event.key === "Home") index = 0;
      else if (event.key === "End") index = options.length - 1;
      else if (isOpen) index = (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
      if (isOpen) highlight(index);
      else show(index);
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const now = Date.now();
      const text = (now - search.current.time < 700 ? search.current.text : "") + event.key.toLowerCase();
      const term = [...text].every((character) => character === text[0]) ? text[0] : text;
      const start = isOpen ? active : selectedIndex;
      const index = options.findIndex((_, offset) =>
        options[(start + offset + 1) % options.length].label.toLowerCase().startsWith(term),
      );
      if (index >= 0) {
        const match = (start + index + 1) % options.length;
        if (isOpen) highlight(match);
        else show(match);
      }
      search.current = { text, time: now };
    }
  }

  return (
    <div className={`${styles["app-select"]} ${inheritColor ? styles["inherit-color"] : ""} ${className}`}>
      <button
        ref={trigger}
        type="button"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        popoverTarget={id}
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        className={styles["select-trigger"]}
        disabled={!options.length}
        onKeyDown={handleKey}
        onClick={() => {
          if (!menu.current?.matches(":popover-open")) setActive(selectedIndex);
        }}
      >
        {icon}
        <span>{options[selectedIndex]?.label ?? label}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      <div
        ref={menu}
        id={id}
        role="listbox"
        aria-label={label}
        popover="auto"
        className={styles["select-popover"]}
        onToggle={(event) => {
          const expanded = event.newState === "open";
          setOpen(expanded);
          if (expanded) positionMenu();
        }}
      >
        {options.map((option, index) => (
          <div
            id={`${id}-${index}`}
            key={option.value}
            role="option"
            aria-selected={option.value === value}
            className={`${styles["select-option"]} ${active === index ? styles["is-active"] : ""} ${option.className ?? ""}`}
            onPointerMove={() => setActive(index)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose(index)}
          >
            <span>{option.label}</span>
            {option.value === value && <Check size={15} aria-hidden="true" />}
          </div>
        ))}
      </div>
    </div>
  );
}
