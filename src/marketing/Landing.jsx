import React, { useRef, useState } from "react";
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
} from "../icons";
import PulseMark from "../PulseMark";
import brandIcons from "../brand-icons.json";
import { downloads } from "../../shared/downloads";

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
function TiltCard({ children, className = "" }) {
  const ref = useRef();
  const move = (e) => {
    if (
      !matchMedia("(hover: hover) and (prefers-reduced-motion: no-preference)")
        .matches
    )
      return;
    const r = ref.current.getBoundingClientRect();
    ref.current.style.setProperty(
      "--rx",
      `${-(e.clientY - r.top - r.height / 2) / 90}deg`,
    );
    ref.current.style.setProperty(
      "--ry",
      `${(e.clientX - r.left - r.width / 2) / 70}deg`,
    );
  };
  return (
    <article
      ref={ref}
      className={`platform-card ${className}`}
      onPointerMove={move}
      onPointerLeave={() => {
        ref.current.style.setProperty("--rx", "0deg");
        ref.current.style.setProperty("--ry", "0deg");
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
  const active = tour[selected];
  const openImage = (src, alt) => {
    setZoom({ src, alt });
    dialog.current.showModal();
  };
  const closeImage = () => dialog.current.close();
  return (
    <div className="marketing-page">
      <a className="m-skip" href="#main">
        Skip to content
      </a>
      <header className="m-header">
        <div className="m-container m-nav">
          <Brand />
          <nav aria-label="Site navigation">
            <a href="#tour">A look inside</a>
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
            <div className="browser-frame">
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
        <section id="tour" className="m-tour m-section m-container">
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
        <section id="how-it-works" className="how-section">
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
        <section
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
              </ul>
              <a className="m-button" href="/app">
                Open Pulse <ArrowUpRight size={17} />
              </a>
              <small>Works on desktop and mobile browsers</small>
            </TiltCard>
            <TiltCard>
              <div className="platform-label">
                <span>02 / AT YOUR DESK</span>
                <span>v1.0.1</span>
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
              </ul>
              <a className="m-button m-button-outline" href={downloads.windows}>
                Download for Windows <Download size={17} />
              </a>
              <small>Windows 10+ · 64-bit · Portable EXE</small>
            </TiltCard>
            <TiltCard>
              <div className="platform-label">
                <span>03 / AWAY FROM YOUR DESK</span>
                <span>v1.0.1</span>
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
                  <Check size={15} />A home-screen widget for your stack
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
        <section className="faq-section m-container m-section">
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
                "From the providers’ own public status feeds. Pulse includes links and timestamps so you can read the original reports. Not every provider offers an automated feed; those entries link to the official status page.",
              ],
              [
                "How often does it update?",
                "The dashboard checks about every two minutes while visible and pauses when hidden. Installed Windows monitoring checks watched services about every five minutes. Android schedules background checks about every 15 minutes, subject to the phone’s battery and network rules. Provider publication and device scheduling can delay alerts.",
              ],
              [
                "Can I get alerts when the app is closed?",
                "Enable background monitoring in Settings in the installed Windows or Android app. Windows keeps running in the system tray. Android uses scheduled background work. Allow notifications on your device; force-stopping an app or device restrictions can prevent delivery. The browser version does not send background push alerts.",
              ],
              [
                "How do I install the Android app and widget?",
                "Download the APK on your Android phone, open it, and allow installation from that source if Android asks. After installing Pulse, set up your watchlist. Long-press your home screen, choose Widgets, and add Pulse.",
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
        <section className="final-cta m-container">
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
