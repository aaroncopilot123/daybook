"use client";

import { useEffect, useId, useState, type Ref } from "react";
import { Search, X } from "lucide-react";
import styles from "./task-search.module.css";

export function TaskSearch({
  ref,
  value,
  onChange,
  scope,
  resultCount,
}: {
  ref?: Ref<HTMLInputElement>;
  value: string;
  onChange: (value: string) => void;
  // The view being searched, e.g. "Today".
  scope: string;
  // Null when not searching.
  resultCount: number | null;
}) {
  const id = useId();
  const [announcement, setAnnouncement] = useState("");
  // Announce the result count once it settles, not on every keystroke.
  useEffect(() => {
    const timer = window.setTimeout(
      () =>
        setAnnouncement(
          resultCount === null
            ? ""
            : resultCount === 0
              ? "No matching tasks"
              : `${resultCount} ${resultCount === 1 ? "result" : "results"} in ${scope}`,
        ),
      500,
    );
    return () => window.clearTimeout(timer);
  }, [resultCount, scope]);

  return (
    <div
      role="search"
      className={`${styles["task-search"]} ${value.trim() ? styles.active : ""}`}
    >
      <label htmlFor={id} className="sr-only">
        Search tasks in {scope}
      </label>
      <Search size={16} className={styles["search-icon"]} aria-hidden="true" />
      <input
        ref={ref}
        id={id}
        className={styles["search-input"]}
        type="search"
        placeholder={`Search ${scope}`}
        value={value}
        maxLength={100}
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        aria-keyshortcuts="/"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          const input = event.currentTarget;
          if (event.key === "Escape") {
            // First Escape clears, the next one leaves the field.
            event.preventDefault();
            if (input.value) onChange("");
            else input.blur();
          } else if (event.key === "Enter") {
            event.preventDefault();
            // Dismiss the on-screen keyboard; results are already live.
            if (window.matchMedia("(pointer: coarse)").matches) input.blur();
          }
        }}
      />
      <span className={styles["search-end"]}>
        {value ? (
          <button
            type="button"
            className={`icon-button ${styles["search-clear"]}`}
            aria-label="Clear search"
            onClick={(event) => {
              onChange("");
              event.currentTarget.closest("[role=search]")?.querySelector("input")?.focus();
            }}
          >
            <X size={16} />
          </button>
        ) : (
          <kbd aria-hidden="true">/</kbd>
        )}
      </span>
      <span className="sr-only" role="status">
        {announcement}
      </span>
    </div>
  );
}
