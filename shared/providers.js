import {
  normalizeAzure,
  normalizeAws,
  normalizeComponent,
  normalizeInstatus,
} from "./cloud-feeds.js";

export const providers = [
  {
    id: "npm",
    name: "npm",
    product: "JavaScript packages, publishing & audit",
    category: "Package registries",
    url: "https://status.npmjs.org",
    mark: "npm",
    color: "#cb3837",
    industries: ["Developer tools", "Enterprise software", "E-commerce"],
  },
  {
    id: "pypi",
    name: "PyPI & Python",
    product: "Package index & Python infrastructure",
    category: "Package registries",
    url: "https://status.python.org",
    mark: "Py",
    color: "#3776ab",
    industries: ["Developer tools", "AI products", "Research"],
  },
  {
    id: "docker",
    name: "Docker",
    product: "Container registry, builds & developer services",
    category: "Package registries",
    url: "https://www.dockerstatus.com",
    mark: "D",
    color: "#2496ed",
    industries: ["Developer tools", "Enterprise software", "AI products"],
  },
  {
    id: "rubygems",
    name: "RubyGems",
    product: "Ruby packages & dependency API",
    category: "Package registries",
    url: "https://status.rubygems.org",
    mark: "◆",
    color: "#cc342d",
    industries: ["Developer tools", "E-commerce"],
  },
  {
    id: "circleci",
    name: "CircleCI",
    product: "CI pipelines, runners & build jobs",
    category: "Developer tools",
    url: "https://status.circleci.com",
    mark: "CI",
    color: "#343434",
    industries: ["Developer tools", "Enterprise software"],
  },
  {
    id: "postman",
    name: "Postman",
    product: "API testing, monitors & collaboration",
    category: "Developer tools",
    url: "https://status.postman.com",
    mark: "P",
    color: "#ff6c37",
    industries: ["Developer tools", "Enterprise software"],
  },
  {
    id: "sentry",
    name: "Sentry",
    product: "Error ingestion, alerts & observability",
    category: "Developer tools",
    url: "https://status.sentry.io",
    mark: "S",
    color: "#7553a5",
    industries: ["Developer tools", "Enterprise software", "E-commerce"],
  },
  {
    id: "snyk",
    name: "Snyk",
    product: "Code, dependency & container security",
    category: "Security platforms",
    url: "https://status.snyk.io",
    mark: "S",
    color: "#6a4dd3",
    industries: [
      "Developer tools",
      "Enterprise software",
      "Financial services",
    ],
  },
  {
    id: "hackerone",
    name: "HackerOne",
    product: "Bug bounty platform, API & integrations",
    category: "Security platforms",
    url: "https://www.hackeronestatus.com",
    mark: "h1",
    color: "#494649",
    industries: [
      "Developer tools",
      "Enterprise software",
      "Financial services",
    ],
  },
  {
    id: "openai",
    name: "OpenAI",
    product: "ChatGPT, API & Codex",
    category: "AI & machine learning",
    url: "https://status.openai.com",
    mark: "◎",
    color: "#222c29",
    industries: ["AI products", "Developer tools", "Customer support"],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    product: "Claude & Claude API",
    category: "AI & machine learning",
    url: "https://status.claude.com",
    mark: "✳",
    color: "#c77e61",
    industries: ["AI products", "Developer tools", "Research"],
  },
  {
    id: "cloudflare",
    name: "Cloudflare",
    product: "Global network & security",
    category: "Cloud & infrastructure",
    url: "https://www.cloudflarestatus.com",
    mark: "cloud",
    color: "#ed8b28",
    industries: ["E-commerce", "Financial services", "Media & streaming"],
  },
  {
    id: "aws",
    name: "Amazon Web Services",
    product: "Compute, storage & cloud services",
    category: "Cloud & infrastructure",
    url: "https://health.aws.amazon.com/health/status",
    format: "aws",
    endpoint: "https://health.aws.amazon.com/public/currentevents",
    mark: "aws",
    color: "#b5863d",
    industries: [
      "AI products",
      "E-commerce",
      "Financial services",
      "Enterprise software",
      "Media & streaming",
    ],
  },
  {
    id: "googlecloud",
    name: "Google Cloud",
    product: "Cloud infrastructure & Vertex AI",
    category: "Cloud & infrastructure",
    url: "https://status.cloud.google.com",
    format: "google",
    endpoint: "https://status.cloud.google.com/incidents.json",
    mark: "G",
    color: "#4285f4",
    industries: [
      "AI products",
      "E-commerce",
      "Financial services",
      "Research",
      "Enterprise software",
    ],
  },
  {
    id: "azure",
    name: "Microsoft Azure",
    product: "Cloud infrastructure & AI services",
    category: "Cloud & infrastructure",
    url: "https://azure.status.microsoft",
    format: "azure-rss",
    endpoint: "https://azure.status.microsoft/en-us/status/feed/",
    mark: "A",
    color: "#277bc1",
    industries: [
      "AI products",
      "Financial services",
      "Enterprise software",
      "Research",
    ],
  },
  {
    id: "github",
    name: "GitHub",
    product: "Code, Actions & Copilot",
    category: "Developer tools",
    url: "https://www.githubstatus.com",
    mark: "github",
    color: "#24292f",
    industries: ["Developer tools", "AI products", "Enterprise software"],
  },
  {
    id: "vercel",
    name: "Vercel",
    product: "Deployments & edge network",
    category: "Cloud & infrastructure",
    url: "https://www.vercel-status.com",
    mark: "▲",
    color: "#18191a",
    industries: ["E-commerce", "Developer tools", "Media & streaming"],
  },
  {
    id: "supabase",
    name: "Supabase",
    product: "Database, Auth & Storage",
    category: "Developer tools",
    url: "https://status.supabase.com",
    mark: "ϟ",
    color: "#36a576",
    industries: ["Developer tools", "AI products", "Enterprise software"],
  },
  {
    id: "digitalocean",
    name: "DigitalOcean",
    product: "Compute & managed databases",
    category: "Cloud & infrastructure",
    url: "https://status.digitalocean.com",
    mark: "◕",
    color: "#087df4",
    industries: ["Developer tools", "E-commerce", "Enterprise software"],
  },
  {
    id: "render",
    name: "Render",
    product: "Cloud hosting & services",
    category: "Cloud & infrastructure",
    url: "https://status.render.com",
    mark: "R",
    color: "#655bd4",
    industries: ["Developer tools", "AI products"],
  },
  {
    id: "netlify",
    name: "Netlify",
    product: "Web deployments & CDN",
    category: "Cloud & infrastructure",
    url: "https://www.netlifystatus.com",
    mark: "⌘",
    color: "#0d989b",
    industries: ["E-commerce", "Developer tools", "Media & streaming"],
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    product: "Models, datasets & inference",
    category: "AI & machine learning",
    url: "https://status.huggingface.co",
    format: "betterstack",
    endpoint: "https://status.huggingface.co/index.json",
    mark: "◉",
    color: "#dba328",
    industries: ["AI products", "Research", "Developer tools"],
  },
  {
    id: "replicate",
    name: "Replicate",
    product: "AI model inference",
    category: "AI & machine learning",
    url: "https://www.cloudflarestatus.com/services?search=replicate",
    endpoint: "https://www.cloudflarestatus.com/api/v2/summary.json",
    format: "component",
    componentId: "fvgfcmy66tdr",
    mark: "R",
    color: "#45494e",
    industries: ["AI products", "Media & streaming"],
  },
  {
    id: "discord",
    name: "Discord",
    product: "Messaging & voice",
    category: "Communication",
    url: "https://discordstatus.com",
    mark: "discord",
    color: "#5865f2",
    industries: ["Gaming", "Customer support", "Enterprise software"],
  },
  {
    id: "zoom",
    name: "Zoom",
    product: "Meetings & communication",
    category: "Communication",
    url: "https://status.zoom.us",
    mark: "video",
    color: "#2780ef",
    industries: ["Enterprise software", "Research", "Customer support"],
  },
  {
    id: "twilio",
    name: "Twilio",
    product: "Messaging, voice & identity",
    category: "Communication",
    url: "https://status.twilio.com",
    mark: "⠿",
    color: "#ed455a",
    industries: ["Customer support", "Financial services", "E-commerce"],
  },
  {
    id: "atlassian",
    name: "Atlassian",
    product: "Jira & team collaboration",
    category: "Developer tools",
    url: "https://jira-software.status.atlassian.com",
    mark: "A",
    color: "#2268d2",
    industries: ["Developer tools", "Enterprise software"],
  },
  {
    id: "notion",
    name: "Notion",
    product: "Workspace & collaboration",
    category: "Productivity",
    url: "https://www.notion-status.com",
    mark: "N",
    color: "#272a2c",
    industries: ["Enterprise software", "Research"],
  },
  {
    id: "railway",
    name: "Railway",
    product: "Deployments, builds & edge network",
    category: "Cloud & infrastructure",
    // Instatus, not Statuspage: status.railway.com serves the reader a page and
    // answers /api/v2/summary.json with that same HTML, so the machine-readable
    // document is the Instatus host's own. `url` stays the page a reader should
    // open; `endpoint` is what Pulse reads.
    url: "https://status.railway.com",
    endpoint: "https://railway.instatus.com/v2/components.json",
    format: "instatus",
    mark: "R",
    color: "#0b0d0e",
    industries: ["Developer tools", "Enterprise software", "AI products"],
  },
  {
    id: "godaddy",
    name: "GoDaddy",
    product: "Domains, DNS & managed hosting",
    category: "Domains & hosting",
    url: "https://status.godaddy.com",
    mark: "G",
    color: "#1bdbdb",
    industries: ["E-commerce", "Enterprise software", "Developer tools"],
  },
  {
    id: "hostinger",
    name: "Hostinger",
    product: "Shared hosting, VPS & domains",
    category: "Domains & hosting",
    url: "https://statuspage.hostinger.com",
    mark: "H",
    color: "#673de6",
    industries: ["E-commerce", "Developer tools"],
  },
  {
    id: "groq",
    name: "Groq",
    product: "LPU inference API & console",
    category: "AI & machine learning",
    url: "https://groqstatus.com",
    // No brand mark in the icon set, so the tile draws the text instead -- the
    // same fallback npm, PyPI and CircleCI already use.
    mark: "Gq",
    color: "#f55036",
    industries: ["AI products", "Developer tools", "Research"],
  },
  {
    id: "nvidia",
    name: "NVIDIA NGC",
    product: "NIM microservices, model catalog & GPU cloud",
    category: "AI & machine learning",
    // build.nvidia.com and the NIM endpoints run on NGC, and NGC is the surface
    // NVIDIA publishes a status page for.
    url: "https://status.ngc.nvidia.com",
    mark: "N",
    color: "#76b900",
    industries: ["AI products", "Research", "Developer tools"],
  },
  {
    id: "googleaistudio",
    name: "Google AI Studio",
    product: "Gemini API, AI Studio & Vertex AI",
    category: "AI & machine learning",
    // Google publishes one incident feed for the whole of Google Cloud, and the
    // Gemini API is a product inside it. Reading the feed unfiltered would make
    // this row repeat every Compute Engine and BigQuery incident, so it is
    // narrowed to the products this row is actually about. `products` is matched
    // case-insensitively against each incident's affected_products titles.
    url: "https://status.cloud.google.com/products",
    endpoint: "https://status.cloud.google.com/incidents.json",
    format: "google",
    products: ["Gemini", "AI Studio", "Vertex AI", "Generative Language"],
    mark: "AI",
    color: "#8e75b2",
    industries: ["AI products", "Research", "Developer tools"],
  },
];
export const categories = [...new Set(providers.map((p) => p.category))];
export const statusLabels = {
  operational: "Operational",
  degraded: "Degraded",
  outage: "Major outage",
  maintenance: "Maintenance",
  unknown: "Status unavailable",
};
export function normalizeSummary(
  provider,
  data,
  now = new Date().toISOString(),
) {
  const valid = ["none", "minor", "major", "critical", "maintenance"];
  if (!data || !valid.includes(data.status?.indicator))
    throw new Error("Unrecognized provider response");
  const states = {
    none: "operational",
    minor: "degraded",
    major: "outage",
    critical: "outage",
    maintenance: "maintenance",
  };
  const rawComponents = Array.isArray(data.components) ? data.components : [];
  const groups = new Map(
    rawComponents.filter((c) => c.group).map((c) => [c.id, c.name]),
  );
  const components = rawComponents
    .filter((c) => !c.group)
    .map((c) => ({
      id: c.id,
      name: groups.has(c.group_id)
        ? `${groups.get(c.group_id)} / ${c.name}`
        : c.name,
      status: c.status,
    }));
  const incidents = (Array.isArray(data.incidents) ? data.incidents : [])
    .filter((i) => !["resolved", "postmortem"].includes(i.status))
    .map((i) => ({
      id: i.id,
      name: i.name,
      status: i.status,
      impact: i.impact,
      startedAt: i.started_at || i.created_at,
      updatedAt: i.updated_at,
      body: i.incident_updates?.[0]?.body || "",
      url: provider.url,
      components: (i.components || []).map((c) => c.name),
      updates: (i.incident_updates || []).slice(0, 12).map((u) => ({
        body: u.body || "",
        status: u.status,
        at: u.display_at || u.created_at,
      })),
    }));
  return {
    ...provider,
    status: states[data.status.indicator],
    description: data.status.description,
    checkedAt: now,
    sourceUpdatedAt: data.page?.updated_at || null,
    components,
    incidents,
  };
}
export function unknownProvider(provider) {
  return {
    ...provider,
    status: "unknown",
    description:
      provider.format === "source-only"
        ? "Official source linked. Automated ingestion is not configured for this provider. Open the official dashboard to verify its current status."
        : "Official feed could not be verified. Check the source directly.",
    checkedAt: null,
    components: [],
    incidents: [],
  };
}
export function feedUrl(provider) {
  return provider.endpoint || `${provider.url}/api/v2/summary.json`;
}
export function normalizeFeed(provider, data, now = new Date().toISOString()) {
  if (provider.format === "azure-rss")
    return normalizeAzure(provider, data, now);
  if (typeof data === "string") data = JSON.parse(data.replace(/^\uFEFF/, ""));
  if (provider.format === "aws") return normalizeAws(provider, data, now);
  if (provider.format === "component")
    return normalizeComponent(provider, data, now, normalizeSummary);
  if (provider.format === "instatus")
    return normalizeInstatus(provider, data, now, normalizeSummary);
  if (provider.format === "betterstack")
    return normalizeBetterStack(provider, data, now);
  if (provider.format !== "google")
    return normalizeSummary(provider, data, now);
  if (
    !Array.isArray(data) ||
    data.some((i) => !i.id || !i.begin || !Array.isArray(i.updates))
  )
    throw new Error("Unrecognized Google Cloud incident response");
  // Google publishes one feed for the whole of Google Cloud, so a provider that
  // is a product inside it says which products it is. Without the filter every
  // such row would repeat every Compute Engine and BigQuery incident as its
  // own, which is the "inferred outage" this product exists not to do.
  // Substring, case-insensitive, because Google renames products in place --
  // "Vertex AI" has also shipped as "Vertex AI Online Prediction".
  const named = (incident) =>
    !provider.products ||
    (incident.affected_products || []).some((product) =>
      provider.products.some((wanted) =>
        (product.current_title || product.title || "")
          .toLowerCase()
          .includes(wanted.toLowerCase()),
      ),
    );
  const scoped = data.filter(named);
  const active = scoped.filter(
    (i) => !i.end && i.most_recent_update?.status !== "AVAILABLE",
  );
  const incidents = active.map((i) => ({
    id: i.id,
    name: i.external_desc || i.name || "Google Cloud incident",
    status: "active",
    impact: i.severity === "high" ? "major" : "minor",
    startedAt: i.begin,
    updatedAt: i.modified || i.begin,
    body: i.most_recent_update?.text || i.updates[0]?.text || "",
    url: provider.url,
    components: (i.affected_products || []).map((p) => p.title || p.id),
    updates: i.updates.slice(0, 12).map((u) => ({
      body: u.text || "",
      status: u.status,
      at: u.when || u.created,
    })),
  }));
  return {
    ...provider,
    status: active.some(
      (i) => i.most_recent_update?.status === "SERVICE_OUTAGE",
    )
      ? "outage"
      : active.length
        ? "degraded"
        : "operational",
    description: active.length
      ? `Active incidents reported in Google Cloud’s public incident feed${provider.products ? ` for ${provider.products[0]} and related products` : ""}.`
      : `No ongoing incidents in Google Cloud’s public incident feed${provider.products ? ` for ${provider.products[0]} and related products` : ""}. This does not include account-specific health events.`,
    checkedAt: now,
    sourceUpdatedAt:
      scoped
        .map((i) => i.modified)
        .filter(Boolean)
        .sort()
        .at(-1) || null,
    components: [],
    incidents,
  };
}

export function normalizeBetterStack(provider, data, now) {
  const states = {
    operational: "operational",
    degraded: "degraded",
    downtime: "outage",
    unavailable: "outage",
    maintenance: "maintenance",
  };
  const attributes = data?.data?.attributes;
  if (!states[attributes?.aggregate_state] || !Array.isArray(data.included))
    throw new Error("Unrecognized Better Stack response");
  const resources = data.included.filter(
    (x) => x.type === "status_page_resource",
  );
  const components = resources.map((x) => ({
    id: x.id,
    name: x.attributes.public_name,
    status:
      {
        operational: "operational",
        degraded: "degraded_performance",
        downtime: "major_outage",
        unavailable: "major_outage",
        maintenance: "under_maintenance",
      }[x.attributes.status] || "unknown",
  }));
  const incidents = data.included
    .filter(
      (x) =>
        x.type === "status_report" &&
        x.attributes.aggregate_state !== "resolved" &&
        new Date(x.attributes.starts_at).getTime() <= new Date(now).getTime(),
    )
    .map((x) => {
      const a = x.attributes;
      const ids = x.relationships?.status_updates?.data?.map((u) => u.id) || [];
      const updates = data.included
        .filter((u) => u.type === "status_update" && ids.includes(u.id))
        .map((u) => ({
          body: u.attributes.message || u.attributes.body || "",
          status: u.attributes.status,
          at: u.attributes.published_at || u.attributes.created_at,
        }))
        .sort((a, b) => new Date(b.at) - new Date(a.at));
      return {
        id: x.id,
        name: a.title,
        status: a.aggregate_state,
        impact: a.report_type === "maintenance" ? "maintenance" : "minor",
        startedAt: a.starts_at,
        updatedAt: updates[0]?.at || a.starts_at,
        body: updates[0]?.body || "",
        url: provider.url,
        components: (a.affected_resources || [])
          .map(
            (r) =>
              components.find((c) => c.id === String(r.status_page_resource_id))
                ?.name,
          )
          .filter(Boolean),
        updates,
      };
    });
  return {
    ...provider,
    status: states[attributes.aggregate_state],
    description: `Provider reports ${attributes.aggregate_state}.`,
    checkedAt: now,
    sourceUpdatedAt: attributes.updated_at || null,
    components,
    incidents,
  };
}
