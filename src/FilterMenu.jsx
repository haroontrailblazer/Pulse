import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
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
//
// The list is a portal, positioned against the trigger and clamped to the
// viewport. Anchoring it inside the wrapper made it the card's problem: the
// service directory's panel is `overflow: hidden`, so the list was cut off at
// the card's edge, and a list wider than the space to one side simply left the
// screen. A menu that cannot be read is worse than the picker it replaced.
export default function FilterMenu({
  value,
  options,
  onChange,
  icon,
  label,
  // The side to try first. Either can be overruled by the measurement: the
  // list goes where it fits, not where it was asked to go.
  placement = "below",
  align = "end",
  className = "",
  activeWhen,
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const listRef = useRef();
  const buttonRef = useRef();
  const focused = useRef(false);
  const place = useCallback(() => {
    const trigger = buttonRef.current;
    const list = listRef.current;
    if (!trigger || !list) return;
    const t = trigger.getBoundingClientRect();
    const width = list.offsetWidth;
    const height = list.offsetHeight;
    const edge = 8;
    const gap = 8;
    const below = window.innerHeight - t.bottom - gap;
    const above = t.top - gap;
    const useAbove =
      placement === "above" ? above >= height || above >= below : below < height && above > below;
    const top = useAbove ? t.top - gap - height : t.bottom + gap;
    const left = align === "start" ? t.left : t.right - width;
    const fit = (v, size, limit) => Math.max(edge, Math.min(v, limit - size - edge));
    setPos({
      top: fit(top, height, window.innerHeight),
      left: fit(left, width, window.innerWidth),
    });
  }, [placement, align]);
  // Before paint, so the list is never seen at the wrong place first.
  useLayoutEffect(() => {
    if (open) place();
    else {
      setPos(null);
      focused.current = false;
    }
  }, [open, place, value]);
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e) => {
      // The list is no longer a descendant of the wrapper, so both have to be
      // asked — otherwise a tap on an option dismisses the menu before the
      // option's own click can run.
      if (
        !buttonRef.current?.parentElement?.contains(e.target) &&
        !listRef.current?.contains(e.target)
      )
        setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    // A portal does not travel with the page, so it is re-placed against its
    // trigger rather than left behind.
    const follow = () => place();
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", follow, true);
    window.addEventListener("resize", follow);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", follow, true);
      window.removeEventListener("resize", follow);
    };
  }, [open, place]);
  // Once it has been placed, not before: until then it is hidden while it is
  // measured, and nothing hidden can take focus. Once per opening — a scroll
  // re-places the list and must not drag focus back with it.
  useLayoutEffect(() => {
    if (!open || !pos || focused.current) return;
    focused.current = true;
    const node = listRef.current;
    (node?.querySelector('[aria-selected="true"]') ??
      node?.firstElementChild)?.focus();
  }, [open, pos]);
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
    <div className={`filter-menu ${className} ${active ? "is-active" : ""}`}>
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
      {open &&
        createPortal(
          <div
            className="filter-menu-list"
            role="listbox"
            aria-label={label}
            ref={listRef}
            onKeyDown={move}
            style={
              pos
                ? { top: pos.top, left: pos.left }
                : // Measured, not yet placed: laid out at full size but not
                  // shown, so nothing flashes in the corner.
                  { top: 0, left: 0, visibility: "hidden" }
            }
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
          </div>,
          document.body,
        )}
    </div>
  );
}
