import React, { useEffect, useRef, useState } from "react";
import { Check } from "./icons";

// A native <select> hands a phone its full-screen OS picker, which takes over
// the screen for a handful of options and looks nothing like the rest of the
// app. This is the same control drawn in the product's own vocabulary: one
// anchored list, identical on the site, in the APK and in the EXE.
//
// Replacing a native control usually costs its behaviour, so this keeps it: a
// listbox role with aria-selected options, focus moved into the list and
// returned to the trigger on close, arrow/Home/End movement, Escape and an
// outside click to dismiss, and a full-height row per option. Focus only
// returns to the trigger on a keyboard activation — doing it after a tap is
// what draws a focus ring on a control nobody had focused.
export default function FilterMenu({
  value,
  options,
  onChange,
  icon,
  label,
  // "below" hangs the list under the trigger, "above" stands it on top, for a
  // trigger that sits near the foot of its container.
  placement = "below",
  align = "start",
  className = "",
  activeWhen,
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef();
  const listRef = useRef();
  const buttonRef = useRef();
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const node = listRef.current;
    (node?.querySelector('[aria-selected="true"]') ??
      node?.firstElementChild)?.focus();
  }, [open]);
  const move = (e) => {
    const items = [...(listRef.current?.children ?? [])];
    const at = items.indexOf(document.activeElement);
    if (at < 0) return;
    const to =
      e.key === "ArrowDown"
        ? (at + 1) % items.length
        : e.key === "ArrowUp"
          ? (at - 1 + items.length) % items.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? items.length - 1
              : -1;
    if (to < 0) return;
    e.preventDefault();
    items[to].focus();
  };
  const active = activeWhen ? activeWhen(value) : value !== options[0];
  return (
    <div
      className={`filter-menu ${className} ${active ? "is-active" : ""}`}
      ref={wrapRef}
    >
      <button
        ref={buttonRef}
        type="button"
        className="filter-menu-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}. ${value} selected`}
        title={value}
        onClick={() => setOpen((v) => !v)}
      >
        {icon}
      </button>
      {open && (
        <div
          className={`filter-menu-list is-${placement} is-${align}`}
          role="listbox"
          aria-label={label}
          ref={listRef}
          onKeyDown={move}
        >
          {options.map((name) => (
            <button
              key={name}
              type="button"
              role="option"
              aria-selected={value === name}
              onClick={(e) => {
                onChange(name);
                setOpen(false);
                if (!e.detail) buttonRef.current?.focus();
              }}
            >
              <span>{name}</span>
              {value === name && <Check size={16} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
