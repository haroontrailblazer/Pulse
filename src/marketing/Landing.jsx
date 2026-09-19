import React, { useLayoutEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Download,
  Globe2,
  Star,
  Bell,
  Network,
  X,
  Sun,
  Moon,
  Plus,
  ExternalLink,
  PackageSearch,
  Copy,
  Layers3,
  Clock3,
  Terminal,
  ShieldCheck,
  RefreshCw,
  Eye,
  Settings,
} from "../icons";
import PulseMark from "../PulseMark";
import brandIcons from "../brand-icons.json";
import { downloads, releaseVersion } from "../../shared/downloads";
import releaseAssets from "../../shared/release-assets.json";
import { gsap, hoverMotionEnabled, motionEnabled } from "../motion";

const tour = [
  {
    id: "incidents",
    name: "Read the latest update",
    icon: Bell,
    title: "Less tab hopping. More clarity.",
    body: "Read the latest published incident updates in one inbox. Filter to your watchlist and open the official source for the full story.",
    points: [
      "Unread updates and clear timestamps",
      "Original provider reports, a click away",
    ],
    file: "incidents",
  },
  {
    id: "overview",
    name: "Check your stack",
    icon: Star,
    title: "Your dependencies. Front and center.",
    body: "Keep the tools you rely on in a personal watchlist. See which services need attention before you start digging through logs.",
    points: [
      "One view across your development workflow",
      "Saved on your device. No account needed.",
    ],
    file: "overview",
  },
  {
    id: "map",
    name: "See the bigger picture",
    icon: Globe2,
    title: "An outage has context. See it.",
    body: "Explore regional signals on the map. Tap a location to see affected services, official updates, and what to check next.",
    points: [
      "Outages, degradation, and maintenance",
      "Regional details when a source provides them",
    ],
    file: "map-light",
  },
  {
    id: "insights",
    name: "Understand the impact",
    icon: Network,
    title: "Connect the issue to your work.",
    body: "Understand how an affected platform could touch your workflow, from package installs to authentication or AI features.",
    points: [
      "Plain-English explanations and next checks",
      "Possible exposure, never invented outages",
    ],
    file: "insights",
  },
];
// The moment each tool earns its place, written as the reader's day rather than
// as a feature list. Everything claimed here is something the app does today;
// the honesty note in "How it works" still governs what Pulse will assert.
const developerMoments = [
  {
    icon: PackageSearch,
    when: "A deploy just failed.",
    title: "Find out whether it’s you.",
    body: "Search every tracked service by name, product or category — press / and start typing. Narrow to what’s disrupted, or to just what you watch, and read the provider’s own component detail.",
  },
  {
    icon: Bell,
    when: "You were in a meeting for an hour.",
    title: "Catch up in one pass.",
    body: "The inbox keeps unread markers, groups updates under Today and Yesterday, and switches between every service and only your watchlist. Read one and it stops asking.",
  },
  {
    icon: Copy,
    when: "Your team is asking what’s going on.",
    title: "Paste an answer, not a guess.",
    body: "Dependency insights gives you what’s happening in the provider’s own words, what you might notice, and what to check next. One button copies the lot as text.",
  },
  {
    icon: Layers3,
    when: "The provider says “operational.”",
    title: "Check the part you depend on.",
    body: "Every component every provider reports, flattened into one searchable list that opens on just the ones that aren’t operational. An overall green can hide a lot.",
  },
  {
    icon: Clock3,
    when: "Before or after your 14:05 deploy?",
    title: "See the sequence, not the snapshot.",
    body: "A running log of what actually moved while the monitor was open: status flips, component changes, new incidents, and feeds going quiet.",
  },
  {
    icon: Terminal,
    when: "You’d rather not take our word for it.",
    title: "Go to the source yourself.",
    body: "Feed health shows how long each provider took to answer, and the exact error when one didn’t. Copy the curl for any feed, open the raw response, or take the whole reading set as JSON.",
  },
  {
    icon: ShieldCheck,
    when: "A release is blocked on one version.",
    title: "Settle it without leaving.",
    body: "Look up published advisories for one exact package version from npm, PyPI or RubyGems. Decode a token on your own device to see why it’s returning 401. Hash a file and compare the checksum you were handed.",
  },
  {
    icon: Globe2,
    when: "Europe is complaining. The US isn’t.",
    title: "See whether a region is in it.",
    body: "Signals land on named infrastructure hubs, with reports that name no region gathered under Worldwide. Open a hub for the providers involved and what to check next.",
  },
];
// The widget art below is drawn from the widget's own vocabulary: these four
// state words, this colour set, and worst-first order.
const widgetStates = {
  outage: ["Major issue", "#FF8989"],
  degraded: ["Degraded", "#EBC06C"],
  operational: ["Operational", "#93D3AD"],
  unavailable: ["Unavailable", "#A3A3A3"],
};
const widgetRows = [
  ["aws", "Amazon Web Services", "08:12", "outage"],
  ["npm", "npm", "08:12", "degraded"],
  ["openai", "OpenAI", "07:41", "unavailable"],
  ["github", "GitHub", "08:12", "operational"],
  ["vercel", "Vercel", "08:11", "operational"],
];
// Both widgets always render the whole watchlist, so the icon panel is derived
// from the same rows rather than listed separately -- they cannot disagree.
// A healthy mark keeps its own brand colour, except a nearly black one, which
// the widget redraws nearly white so it stays visible on the dark card.
const brandMarkColours = {
  aws: "#b5863d",
  npm: "#cb3837",
  github: "#e9e9e7",
  vercel: "#e9e9e7",
  openai: "#e9e9e7",
};
const widgetIcons = widgetRows.map(([id, , , state]) => [
  id,
  state === "operational" ? brandMarkColours[id] : widgetStates[state][1],
]);
// The download size the row shows comes from the same manifest the installers
// are published against, so this figure cannot drift from the shipped APK.
const apkMegabytes = (
  (releaseAssets.assets.find((asset) => asset.name.endsWith("-Android.apk"))
    ?.bytes || 0) /
  (1024 * 1024)
).toFixed(1);
// The three states a reader actually passes through, worded exactly as
// shared/updates.js words them.
const updateSteps = [
  [`Update to ${releaseVersion}`, `${apkMegabytes} MB`, null],
  [`Downloading ${releaseVersion}`, "42%", 42],
  [`Install ${releaseVersion}`, "Downloaded and verified", null],
];
const companies = [
  ["openai", "OpenAI"],
  ["anthropic", "Anthropic"],
  ["cloudflare", "Cloudflare"],
  ["github", "GitHub"],
  ["npm", "npm"],
  ["pypi", "PyPI"],
  ["vercel", "Vercel"],
];
function Brand() {
  return (
    <a className="m-brand" href="/" aria-label="Pulse home">
      <span>
        <PulseMark size={25} />
      </span>
      pulse<span className="m-period">.</span>
    </a>
  );
}
function PlatformArt({ type }) {
  if (type === "android")
    return (
      <div className="platform-art android-art">
        <img
          src="/marketing/android-mascot.png"
          alt=""
          loading="lazy"
          width="1024"
          height="1024"
        />
      </div>
    );
  if (type === "windows")
    return (
      <div className="platform-art windows-art" aria-hidden="true">
        <div className="windows-tiles">
          <i />
          <i />
          <i />
          <i />
        </div>
        <span className="platform-shadow" />
      </div>
    );
  return (
    <div className="platform-art web-art" aria-hidden="true">
      <div className="glass-browser">
        <div>
          <i />
          <i />
          <i />
          <span>pulse / your stack</span>
        </div>
        <Globe2 size={86} weight="duotone" />
        <span className="browser-signal">
          <i />
          In view.
        </span>
      </div>
      <span className="platform-shadow" />
    </div>
  );
}
// The notification the installed apps actually post, word for word, on its own
// quiet channel. Decorative: the prose beside it carries the same facts.
function NoticeArt() {
  return (
    <div className="notice-art" aria-hidden="true">
      <div className="notice-card">
        <span className="notice-mark">
          <PulseMark size={15} />
        </span>
        <div>
          <b>Pulse {releaseVersion} is available</b>
          <p>Open Pulse to download the new version.</p>
        </div>
      </div>
      <span className="notice-meta">
        Pulse updates · silent · once per release
      </span>
    </div>
  );
}
// The same row the app draws below Dependency insights, in the three states a
// reader passes through. Labels, sub-lines and trailing glyphs all match.
function UpdateArt() {
  return (
    <div className="update-art" aria-hidden="true">
      {updateSteps.map(([label, detail, percent], i) => (
        <div key={label} className={`update-row${i === 1 ? " is-busy" : ""}`}>
          <Download size={17} />
          <span>
            {label}
            <small>{detail}</small>
            {percent !== null && (
              <i className="update-bar" style={{ "--at": `${percent}%` }} />
            )}
          </span>
          {i === 0 ? (
            <ArrowUpRight size={14} />
          ) : i === 2 ? (
            <ArrowRight size={14} />
          ) : null}
        </div>
      ))}
    </div>
  );
}
function WidgetMark({ id }) {
  return brandIcons[id] ? (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={brandIcons[id]} />
    </svg>
  ) : null;
}
// Both home-screen widgets, on the card colour and in the worst-first order the
// widget itself uses.
function WidgetArt() {
  return (
    <div className="widget-art" aria-hidden="true">
      <div className="widget-panel">
        <div className="widget-card">
          <span className="widget-eyebrow">
            <PulseMark size={11} /> PULSE / MY STACK
          </span>
          <b className="widget-headline">2 watched services reported issues</b>
          <span className="widget-sub">
            5 watched · 1 unavailable · tap to explore
          </span>
          <ul className="widget-rows">
            {widgetRows.map(([id, name, at, state]) => (
              <li key={id}>
                <WidgetMark id={id} />
                <span>
                  {name} <i>{at}</i>
                </span>
                <em style={{ color: widgetStates[state][1] }}>
                  {widgetStates[state][0]}
                </em>
              </li>
            ))}
          </ul>
          <div className="widget-foot">
            <span>Snapshot · 19 Sep 08:12</span>
            <RefreshCw size={12} />
          </div>
        </div>
        <span className="widget-name">Pulse · My stack</span>
      </div>
      <div className="widget-panel">
        <div className="widget-icons">
          <div>
            {widgetIcons.map(([id, colour]) => (
              <span key={id} style={{ color: colour }}>
                <WidgetMark id={id} />
              </span>
            ))}
          </div>
        </div>
        <span className="widget-name">Pulse · Service icons</span>
      </div>
    </div>
  );
}
function TiltCard({ children, className = "" }) {
  const ref = useRef();
  const move = (e) => {
    if (!hoverMotionEnabled()) return;
    const r = ref.current.getBoundingClientRect();
    gsap.to(ref.current, {
      "--rx": `${-(e.clientY - r.top - r.height / 2) / 90}deg`,
      "--ry": `${(e.clientX - r.left - r.width / 2) / 70}deg`,
      duration: 0.32,
      ease: "power2.out",
      overwrite: true,
    });
  };
  return (
    <article
      ref={ref}
      className={`platform-card ${className}`}
      onPointerMove={move}
      onPointerLeave={() => {
        gsap.to(ref.current, {
          "--rx": "0deg",
          "--ry": "0deg",
          duration: 0.5,
          ease: "power3.out",
          overwrite: true,
        });
      }}
    >
      {children}
    </article>
  );
}
export default function Landing() {
  const [selected, setSelected] = useState(0),
    [dark, setDark] = useState(false),
    [zoom, setZoom] = useState(null);
  const dialog = useRef();
  const root = useRef();
  const tourPanel = useRef();
  const screenshotFrame = useRef();
  const initialTheme = useRef(true);
  const active = tour[selected];
  const openImage = (src, alt) => {
    setZoom({ src, alt });
    dialog.current.showModal();
  };
  const closeImage = () => dialog.current.close();
  useLayoutEffect(() => {
    if (!motionEnabled()) return;
    const context = gsap.context(() => {
      gsap
        .timeline({ defaults: { ease: "power3.out" } })
        .from(".m-header", { autoAlpha: 0, y: -12, duration: 0.46 })
        .from(".m-hero > h1", { autoAlpha: 0, y: 24, duration: 0.58 }, "-=0.18")
        .from(
          ".hero-description",
          { autoAlpha: 0, y: 16, duration: 0.42 },
          "-=0.3",
        )
        .from(
          ".hero-actions, .hero-note",
          { autoAlpha: 0, y: 12, duration: 0.34, stagger: 0.07 },
          "-=0.2",
        )
        .from(
          ".hero-product",
          { autoAlpha: 0, y: 24, scale: 0.985, duration: 0.58 },
          "-=0.18",
        );

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            gsap.fromTo(
              entry.target,
              { autoAlpha: 0, y: 28 },
              {
                autoAlpha: 1,
                y: 0,
                duration: 0.55,
                ease: "power3.out",
                clearProps: "opacity,transform,visibility",
              },
            );
            observer.unobserve(entry.target);
          });
        },
        { threshold: 0.12 },
      );
      root.current
        ?.querySelectorAll("[data-reveal]")
        .forEach((section) => observer.observe(section));
      return () => observer.disconnect();
    }, root);
    return () => context.revert();
  }, []);
  useLayoutEffect(() => {
    if (!motionEnabled()) return;
    const context = gsap.context(() => {
      gsap.fromTo(
        tourPanel.current?.querySelectorAll(".tour-copy > *, .tour-screen"),
        { autoAlpha: 0, y: 14 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.38,
          stagger: 0.045,
          ease: "power3.out",
          clearProps: "opacity,transform,visibility",
        },
      );
    }, tourPanel);
    return () => context.revert();
  }, [selected]);
  useLayoutEffect(() => {
    if (initialTheme.current) {
      initialTheme.current = false;
      return;
    }
    if (!motionEnabled()) return;
    const image = screenshotFrame.current?.querySelector("img");
    if (!image) return;
    const context = gsap.context(() => {
      gsap.fromTo(
        image,
        { autoAlpha: 0, scale: 1.015 },
        {
          autoAlpha: 1,
          scale: 1,
          duration: 0.34,
          ease: "power2.out",
          clearProps: "opacity,transform,visibility",
        },
      );
    }, screenshotFrame);
    return () => context.revert();
  }, [dark]);
  useLayoutEffect(() => {
    if (!zoom || !motionEnabled()) return;
    const context = gsap.context(() => {
      gsap.fromTo(
        dialog.current,
        { autoAlpha: 0, y: 12, scale: 0.985 },
        { autoAlpha: 1, y: 0, scale: 1, duration: 0.28, ease: "power3.out" },
      );
    }, dialog);
    return () => context.revert();
  }, [zoom]);
  return (
    <div ref={root} className="marketing-page">
      <a className="m-skip" href="#main">
        Skip to content
      </a>
      <header className="m-header">
        <div className="m-container m-nav">
          <Brand />
          <nav aria-label="Site navigation">
            <a href="#tour">A look inside</a>
            <a href="#for-developers">For developers</a>
            <a href="#how-it-works">How it works</a>
            <a href="#download">Get Pulse</a>
          </nav>
          <a className="m-button m-button-small" href="/app">
            Open Pulse <ArrowUpRight size={15} />
          </a>
        </div>
      </header>
      <main id="main">
        <section className="m-hero m-container">
          <h1>
            Know what’s down.
            <br />
            <span>Get back to building.</span>
          </h1>
          <p className="hero-description">
            One clear view of the services your code depends on.
            <br className="desktop-break" /> Check outages, follow your stack,
            and know what to do next.
          </p>
          <div className="hero-actions">
            <a className="m-button" href="/app">
              Open Pulse in your browser <ArrowUpRight size={18} />
            </a>
            <a className="m-button m-button-outline" href="#tour">
              Take a look inside <ArrowRight size={17} />
            </a>
          </div>
          <p className="hero-note">
            Free to use. No account needed.{" "}
            <span>
              Also on{" "}
              <a href="#download">
                Windows and Android <ArrowDownMini />
              </a>
            </span>
          </p>
          <div className="hero-product">
            <div className="product-caption">
              <span>
                <i />
                YOUR INFRASTRUCTURE, IN VIEW
              </span>
              <div
                className="preview-theme"
                role="group"
                aria-label="Screenshot theme"
              >
                <button
                  aria-label="Light screenshot"
                  aria-pressed={!dark}
                  onClick={() => setDark(false)}
                >
                  <Sun size={15} />
                </button>
                <button
                  aria-label="Dark screenshot"
                  aria-pressed={dark}
                  onClick={() => setDark(true)}
                >
                  <Moon size={15} />
                </button>
              </div>
            </div>
            <div ref={screenshotFrame} className="browser-frame">
              <div className="browser-bar">
                <div className="browser-dots">
                  <i />
                  <i />
                  <i />
                </div>
                <span>
                  <PulseMark size={12} /> Pulse / Global map
                </span>
                <button
                  aria-label="Enlarge map screenshot"
                  onClick={() =>
                    openImage(
                      `/marketing/map-${dark ? "dark" : "light"}@2x.png`,
                      "Pulse global map screenshot",
                    )
                  }
                >
                  <ExternalLink size={14} />
                </button>
              </div>
              <button
                className="screenshot-button"
                aria-label="Explore this map screenshot"
                onClick={() =>
                  openImage(
                    `/marketing/map-${dark ? "dark" : "light"}@2x.png`,
                    "Pulse global map screenshot",
                  )
                }
              >
                <img
                  src={`/marketing/map-${dark ? "dark" : "light"}@2x.png`}
                  srcSet={`/marketing/map-${dark ? "dark" : "light"}.png 1440w, /marketing/map-${dark ? "dark" : "light"}@2x.png 2880w`}
                  sizes="(max-width: 760px) calc(100vw - 36px), (max-width: 1050px) calc(100vw - 48px), (max-width: 1296px) calc(100vw - 80px), 1216px"
                  alt={`The Pulse global map in ${dark ? "dark" : "light"} mode, with regional status markers and service filters`}
                  width="1440"
                  height="900"
                  fetchPriority="high"
                />
              </button>
            </div>
            <div className="screenshot-caption">
              <span>
                Real app. Real source reports. Screenshot shown for
                illustration.
              </span>
              <a href="/app">
                See what’s happening now <ArrowRight size={14} />
              </a>
            </div>
          </div>
        </section>
        <section
          data-reveal
          className="provider-strip m-container"
          aria-label="Supported providers"
        >
          <p>From your first API call to your next deploy.</p>
          <div>
            {companies.map(([id, name]) => (
              <span key={id}>
                {brandIcons[id] ? (
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d={brandIcons[id]} />
                  </svg>
                ) : null}
                <b>{name}</b>
              </span>
            ))}
          </div>
          <small>AI, cloud, code hosting, package registries, and more.</small>
        </section>
        <section data-reveal id="tour" className="m-tour m-section m-container">
          <div className="section-heading">
            <div>
              <p className="eyebrow">LESS NOISE. A CLEARER PICTURE.</p>
              <h2>
                The right context.
                <br />
                All in one place.
              </h2>
            </div>
            <p>
              A failed deploy shouldn’t send you through a dozen status pages.
              Start here. Find the signal. Follow the source.
            </p>
          </div>
          <div
            className="tour-tabs"
            role="tablist"
            aria-label="Explore Pulse features"
          >
            {tour.map((item, i) => (
              <button
                key={item.id}
                id={`tab-${item.id}`}
                role="tab"
                aria-selected={i === selected}
                aria-controls="tour-panel"
                tabIndex={i === selected ? 0 : -1}
                onClick={() => setSelected(i)}
                onKeyDown={(e) => {
                  let next;
                  if (e.key === "ArrowRight") next = (i + 1) % tour.length;
                  if (e.key === "ArrowLeft")
                    next = (i + tour.length - 1) % tour.length;
                  if (e.key === "Home") next = 0;
                  if (e.key === "End") next = tour.length - 1;
                  if (next !== undefined) {
                    e.preventDefault();
                    setSelected(next);
                    document.getElementById(`tab-${tour[next].id}`).focus();
                  }
                }}
              >
                <item.icon size={18} />
                {item.name}
              </button>
            ))}
          </div>
          <div
            ref={tourPanel}
            className="tour-panel"
            id="tour-panel"
            role="tabpanel"
            aria-labelledby={`tab-${active.id}`}
          >
            <div className="tour-copy">
              <span className="tour-number">0{selected + 1} / THE PRODUCT</span>
              <h3>{active.title}</h3>
              <p>{active.body}</p>
              <ul>
                {active.points.map((p) => (
                  <li key={p}>
                    <Check size={16} />
                    {p}
                  </li>
                ))}
              </ul>
              <a href="/app" className="text-link">
                Try it for yourself <ArrowUpRight size={17} />
              </a>
            </div>
            <button
              className="tour-screen"
              onClick={() =>
                openImage(
                  `/marketing/${active.file}@2x.png`,
                  `${active.name}: Pulse application screenshot`,
                )
              }
              aria-label={`Enlarge ${active.name} screenshot`}
            >
              <img
                src={`/marketing/${active.file}@2x.png`}
                srcSet={`/marketing/${active.file}.png 1440w, /marketing/${active.file}@2x.png 2880w`}
                sizes="(max-width: 760px) calc(100vw - 36px), (max-width: 1050px) 62vw, 800px"
                alt={`${active.name} in the actual Pulse application`}
                loading="lazy"
                width="1440"
                height="900"
              />
              <span>
                <ExternalLink size={14} /> Take a closer look
              </span>
            </button>
          </div>
        </section>
        <section
          data-reveal
          id="for-developers"
          className="m-section m-container moments-section"
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">BUILT FOR THE BAD AFTERNOONS</p>
              <h2>
                You don’t need a dashboard.
                <br />
                You need the next move.
              </h2>
            </div>
            <p>
              Nobody opens a status page for fun. You open it because something
              just broke. Here is what Pulse does at the moment you actually
              reach for it.
            </p>
          </div>
          <div className="moments-grid">
            {developerMoments.map(({ icon: Icon, when, title, body }) => (
              <article key={title}>
                <span className="moment-icon">
                  <Icon size={19} />
                </span>
                <p className="moment-when">{when}</p>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
          <p className="moments-foot">
            Every one of these works the same on the website, the Windows app
            and the Android app.{" "}
            <a href="/app">
              Open the dashboard <ArrowUpRight size={12} />
            </a>
          </p>
        </section>
        <section data-reveal id="how-it-works" className="how-section">
          <div className="m-container m-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">SIMPLE BY DESIGN</p>
                <h2>
                  From “something’s off”
                  <br />
                  to “here’s the update.”
                </h2>
              </div>
              <p>
                Pulse brings official reports together. You stay in control of
                what you follow.
              </p>
            </div>
            <div className="steps">
              {[
                [
                  "01",
                  Star,
                  "Pick your essentials.",
                  "Add the services you use to your watchlist. Your choices stay on this device.",
                ],
                [
                  "02",
                  Globe2,
                  "See what’s happening.",
                  "Check current provider reports, regional signals, and the latest incident updates.",
                ],
                [
                  "03",
                  Bell,
                  "Keep your stack close.",
                  "Enable watchlist alerts in the installed apps, or add the Android home-screen widget.",
                ],
              ].map(([n, Icon, title, text]) => (
                <article key={n}>
                  <div className="step-top">
                    <span>{n}</span>
                    <Icon size={23} />
                  </div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </article>
              ))}
            </div>
            <div className="honesty-note">
              <div className="source-icon">
                <Check size={19} />
              </div>
              <p>
                <strong>Clear about what we know.</strong> Status comes from
                provider reports. Missing or outdated feeds stay visible as
                unavailable. Map locations need regional evidence. Pulse helps
                you investigate; it doesn’t guess.
              </p>
            </div>
          </div>
        </section>
        <section data-reveal id="installed" className="installed-section">
          <div className="m-container m-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">WHAT INSTALLING ACTUALLY BUYS YOU</p>
                <h2>
                  Close the window.
                  <br />
                  Pulse keeps watching.
                </h2>
              </div>
              <p>
                The browser gives you the whole dashboard. The installed apps
                add the things a tab cannot do — including keeping themselves up
                to date.
              </p>
            </div>
            <div className="showcase">
              <div className="showcase-copy">
                <div className="showcase-label">
                  <span>01 / IT KEEPS ITSELF CURRENT</span>
                  <b>Windows &amp; Android</b>
                </div>
                <h3>You will never quietly be running last month’s build.</h3>
                <p>
                  Once a day, some time after 08:00 on your own clock, Pulse
                  asks whether anything newer has shipped. If it has, you get
                  one quiet notification — once per release, not once per
                  morning — and a row under Dependency insights that reads{" "}
                  <b>Update to {releaseVersion}</b>.
                </p>
                <p>
                  Tap it and Pulse fetches the build itself: no browser, no
                  download manager, no save dialog. It refuses to go any further
                  unless the byte count <em>and</em> the SHA-256 both match what
                  the release published. Then Android hands the verified file to
                  the system installer, and Windows restarts into the new
                  version.
                </p>
                <ul>
                  <li>
                    <Check size={15} />
                    One notification per release, on its own silent channel
                  </li>
                  <li>
                    <Check size={15} />
                    Verified against the published checksum before anything
                    installs
                  </li>
                  <li>
                    <Check size={15} />
                    Live percentage while it downloads, inside the app
                  </li>
                </ul>
                <p className="showcase-limit">
                  <strong>Straight about it:</strong> this is a daily check, not
                  a push — a device asleep at 08:00 checks when it wakes, and
                  nothing downloads until you tap. The website carries no notice
                  at all, because a browser tab is already current.
                </p>
              </div>
              <div className="showcase-art">
                <NoticeArt />
                <UpdateArt />
                <small>
                  The notification and the row, in the words the apps use.
                  Download size shown for the Android build.
                </small>
              </div>
            </div>
            <div className="showcase showcase-flip">
              <div className="showcase-copy">
                <div className="showcase-label">
                  <span>02 / ON YOUR HOME SCREEN</span>
                  <b>Android</b>
                </div>
                <h3>The answer, without unlocking into an app.</h3>
                <p>
                  Two widgets ship with the Android app. <b>Pulse · My stack</b>{" "}
                  lists every service you watch, worst first, each with its own
                  last-check time and one plain word for its state.{" "}
                  <b>Pulse · Service icons</b> is just your marks in their own
                  brand colours — amber on a reported degradation, red during an
                  outage.
                </p>
                <p>
                  Both resize, both keep refreshing after you close Pulse, and a
                  tap on either opens your watchlist. Add one from inside Pulse,
                  or long-press your home screen and pick Widgets.
                </p>
                <ul>
                  <li>
                    <Check size={15} />
                    Worst-first ordering, so the problem is the top row
                  </li>
                  <li>
                    <Check size={15} />
                    Refreshes on its own with the app closed
                  </li>
                  <li>
                    <Check size={15} />
                    Service icons floats on your wallpaper, or sits on a card
                  </li>
                </ul>
                <p className="showcase-limit">
                  <strong>Straight about it:</strong> Android only — there is no
                  iOS, lock-screen or Windows widget. It polls rather than
                  pushes, roughly every fifteen minutes, and Android may stretch
                  that while the phone is idle. Build your watchlist in Pulse
                  first, and a reading older than thirty minutes is shown as
                  Unavailable rather than passed off as current.
                </p>
              </div>
              <div className="showcase-art">
                <WidgetArt />
                <small>
                  Both widgets, in their own colours and order. Services shown
                  for illustration.
                </small>
              </div>
            </div>
            <div className="installed-extras">
              {[
                [
                  Bell,
                  "Alerts once the window is closed",
                  "Windows keeps monitoring from the tray and Android schedules its own checks. You hear about a watched service when it starts reporting, never twice for the same news. Android goes one further and replaces that notice with a back-to-normal one once the feed is clear again.",
                ],
                [
                  Eye,
                  "A tray icon that stays out of the way",
                  "Closing the Pulse window on Windows does not stop it watching. Open Pulse, jump straight to your watchlist, or quit properly — from the tray.",
                ],
                [
                  Settings,
                  "Your watchlist, on your device",
                  "No account, no sign-in, nothing to sync. Your list lives on the device that made it, which also means you set it up once per device.",
                ],
              ].map(([Icon, title, text]) => (
                <article key={title}>
                  <span>
                    <Icon size={18} />
                  </span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
        <section
          data-reveal
          id="download"
          className="m-section m-container download-section"
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">YOUR STACK, WHEREVER YOU ARE</p>
              <h2>
                Open a tab.
                <br />
                Or take Pulse with you.
              </h2>
            </div>
            <p>
              Start in your browser. Install Pulse when you want watchlist
              alerts after the window closes.
            </p>
          </div>
          <div className="platform-grid">
            <TiltCard className="web-platform">
              <div className="platform-label">
                <span>01 / THE QUICKEST WAY IN</span>
                <b>Start here</b>
              </div>
              <PlatformArt type="web" />
              <h3>Pulse for web</h3>
              <p>
                Your full dashboard, one click away. No install, no sign-up, no
                setup.
              </p>
              <ul>
                <li>
                  <Check size={15} />
                  Live source reports and interactive map
                </li>
                <li>
                  <Check size={15} />
                  Your watchlist, saved in this browser
                </li>
                <li>
                  <Check size={15} />
                  Always the current version. Nothing to update.
                </li>
              </ul>
              <a className="m-button" href="/app">
                Open Pulse <ArrowUpRight size={17} />
              </a>
              <small>Works on desktop and mobile browsers</small>
            </TiltCard>
            <TiltCard>
              <div className="platform-label">
                <span>02 / AT YOUR DESK</span>
                <span>v{releaseVersion}</span>
              </div>
              <PlatformArt type="windows" />
              <h3>Pulse for Windows</h3>
              <p>
                Keep an eye on your stack while you work. Close the window; stay
                in the loop.
              </p>
              <ul>
                <li>
                  <Check size={15} />
                  Watchlist alerts and system tray
                </li>
                <li>
                  <Check size={15} />
                  Portable app. No installer wizard.
                </li>
                <li>
                  <Check size={15} />
                  Spots new versions and installs them on a tap
                </li>
              </ul>
              <a className="m-button m-button-outline" href={downloads.windows}>
                Download for Windows <Download size={17} />
              </a>
              <small>Windows 10+ · 64-bit · Portable EXE</small>
            </TiltCard>
            <TiltCard>
              <div className="platform-label">
                <span>03 / AWAY FROM YOUR DESK</span>
                <span>v{releaseVersion}</span>
              </div>
              <PlatformArt type="android" />
              <h3>Pulse for Android</h3>
              <p>
                Your services at a glance, from your phone or right on your home
                screen.
              </p>
              <ul>
                <li>
                  <Check size={15} />
                  Watchlist alerts in the background
                </li>
                <li>
                  <Check size={15} />
                  Two resizable home-screen widgets
                </li>
                <li>
                  <Check size={15} />
                  Spots new versions and installs them on a tap
                </li>
              </ul>
              <a className="m-button m-button-outline" href={downloads.android}>
                Download Android APK <Download size={17} />
              </a>
              <small>Android 7.0+ · Direct APK download</small>
            </TiltCard>
          </div>
          <p className="download-note">
            Early-access builds: Windows is unsigned; Android uses a development
            signature.{" "}
            <a href={downloads.checksums}>
              Verify downloads <ArrowUpRight size={12} />
            </a>
          </p>
        </section>
        <section data-reveal className="faq-section m-container m-section">
          <div>
            <p className="eyebrow">A FEW USEFUL DETAILS</p>
            <h2>
              Good questions.
              <br />
              Straight answers.
            </h2>
            <p>Built to make checking your dependencies a little easier.</p>
          </div>
          <div className="faq-list">
            {[
              [
                "Is Pulse free?",
                "Yes. The dashboard, watchlist, incident inbox, map, and insights are free to use. There’s no account to create.",
              ],
              [
                "Where does the status information come from?",
                "From the providers’ own public status feeds. Pulse includes links and timestamps so you can read the original reports. All 28 tracked services are read from an automated feed. When a feed cannot be read, Pulse shows that service as unavailable and links you to the official page rather than guessing.",
              ],
              [
                "How often does it update?",
                "The dashboard checks about every 30 seconds while visible and pauses when hidden. The installed Windows app checks your watched services about every 30 seconds while it monitors from the tray. Android schedules background checks about every 15 minutes, subject to the phone’s battery and network rules. Provider publication and device scheduling can delay alerts.",
              ],
              [
                "Can I get alerts when the app is closed?",
                "Enable background monitoring in Settings in the installed Windows or Android app. Windows keeps running in the system tray. Android uses scheduled background work. Allow notifications on your device; force-stopping an app or device restrictions can prevent delivery. The browser version does not send background push alerts.",
              ],
              [
                "How do I install the Android app and widget?",
                "Download the APK on your Android phone, open it, and allow installation from that source if Android asks. Open Pulse and add the services you depend on — the widgets read that watchlist, so they need it first. Then add a widget from inside Pulse, in the alerts panel, or long-press your home screen, choose Widgets, and pick Pulse · My stack or Pulse · Service icons. Both can be resized once placed.",
              ],
              [
                "Will Pulse tell me when there is a new version?",
                "The installed Windows and Android apps will. Once a day, after 08:00 local time, they check the published release manifest and — if something newer exists — post one quiet notification and show an update row in the app. Tapping it downloads the build inside Pulse and checks its size and SHA-256 against the release before anything is installed; Android then opens the system installer and Windows restarts into the new version. Nothing downloads on a schedule, and the browser version needs no notice because it always loads the current build.",
              ],
              [
                "Do my watchlist and preferences sync across devices?",
                "They are stored locally on each device or browser. Cross-device sync is not available yet. You can use the same services on each platform by adding them to each watchlist.",
              ],
            ].map(([q, a]) => (
              <details key={q}>
                <summary>
                  {q}
                  <Plus size={18} />
                </summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>
        <section data-reveal className="final-cta m-container">
          <div className="cta-mark">
            <PulseMark size={43} />
          </div>
          <p className="eyebrow">A LITTLE PEACE OF MIND.</p>
          <h2>
            Less guessing.
            <br />
            More building.
          </h2>
          <p>Your infrastructure, in view. Start with your next click.</p>
          <a className="m-button" href="/app">
            Open Pulse <ArrowUpRight size={18} />
          </a>
          <a className="cta-download" href="#download">
            Or get it for Windows & Android
          </a>
        </section>
      </main>
      <footer className="m-footer m-container">
        <div>
          <Brand />
          <p>Internet health, in view.</p>
        </div>
        <nav aria-label="Footer navigation">
          <a href="/app">
            Open dashboard <ArrowUpRight size={13} />
          </a>
          <a href="#download">Downloads</a>
          <a
            href="https://github.com/haroontrailblazer/Pulse"
            target="_blank"
            rel="noreferrer"
          >
            GitHub <ArrowUpRight size={13} />
          </a>
        </nav>
        <small>Built for people who build.</small>
      </footer>
      <dialog
        className="screenshot-dialog"
        aria-label="Pulse product screenshot"
        ref={dialog}
        onCancel={(event) => {
          event.preventDefault();
          closeImage();
        }}
        onClick={(e) => {
          if (e.target === dialog.current) closeImage();
        }}
      >
        <div>
          <span>
            Inside Pulse <small>Illustrative app screenshot</small>
          </span>
          <button aria-label="Close screenshot" onClick={closeImage}>
            <X size={22} />
          </button>
        </div>
        {zoom && <img src={zoom.src} alt={zoom.alt} />}
      </dialog>
    </div>
  );
}
function ArrowDownMini() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path d="M8 3v10m-4-4 4 4 4-4" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
