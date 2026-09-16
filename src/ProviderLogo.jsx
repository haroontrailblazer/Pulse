import React from "react";
import { Cloud, GitFork, Video, MessageCircle } from "./icons";
import brandIcons from "./brand-icons.json";
export default function ProviderLogo({ provider }) {
  const icons = {
    cloud: Cloud,
    github: GitFork,
    video: Video,
    discord: MessageCircle,
  };
  const Icon = icons[provider.mark];
  return (
    <span
      className={`provider-logo logo-${provider.id}`}
      style={{ color: provider.color }}
    >
      {brandIcons[provider.id] ? (
        <svg
          viewBox="0 0 24 24"
          width="22"
          height="22"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d={brandIcons[provider.id]} />
        </svg>
      ) : Icon ? (
        <Icon size={24} strokeWidth={provider.id === "cloudflare" ? 2.8 : 2} />
      ) : (
        provider.mark
      )}
    </span>
  );
}
