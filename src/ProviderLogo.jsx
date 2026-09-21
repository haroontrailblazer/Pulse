import React from "react";
import { Cloud, GitFork, Video, MessageCircle } from "./icons";
import brandIcons from "./brand-icons.json";
import { genericMarkPath, readableMark } from "../shared/brand.js";
export default function ProviderLogo({ provider }) {
  const icons = {
    cloud: Cloud,
    github: GitFork,
    video: Video,
    discord: MessageCircle,
  };
  const Icon = icons[provider.mark];
  // A provider with no artwork in the icon set draws the shared neutral mark
  // rather than its `mark` text. The Android widgets have no text to fall back
  // to -- they draw a vector -- so keeping the web on letters would have shown
  // the same service as two different things on two surfaces.
  const path = brandIcons[provider.id] ?? (Icon ? null : genericMarkPath);
  return (
    <span
      className={`provider-logo logo-${provider.id}`}
      // Two values, one per tile, and the stylesheet picks. Each is the brand's
      // own colour where that already clears 3:1 and the least adjustment that
      // does where it does not -- computed, because forty-six of the
      // seventy-seven need one and a hand-written list of that size is an audit
      // nobody repeats.
      style={{
        "--mark-light": readableMark(provider.color, "light"),
        "--mark-dark": readableMark(provider.color, "dark"),
      }}
    >
      {path ? (
        <svg
          viewBox="0 0 24 24"
          width="22"
          height="22"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d={path} />
        </svg>
      ) : (
        <Icon size={24} strokeWidth={provider.id === "cloudflare" ? 2.8 : 2} />
      )}
    </span>
  );
}
