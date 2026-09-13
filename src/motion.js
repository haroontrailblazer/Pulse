import { gsap } from "gsap";

export { gsap };

export function motionEnabled() {
  return (
    typeof window !== "undefined" &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function hoverMotionEnabled() {
  return (
    motionEnabled() &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches
  );
}
