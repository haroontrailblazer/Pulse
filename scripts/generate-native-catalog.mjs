import { providers, feedUrl } from "../shared/providers.js";
import { mkdirSync, writeFileSync } from "node:fs";
mkdirSync("android/app/src/main/assets", { recursive: true });
writeFileSync(
  "android/app/src/main/assets/pulse-catalog.json",
  JSON.stringify(
    providers.map((p) => ({
      id: p.id,
      name: p.name,
      url: feedUrl(p),
      format: p.format || "statuspage",
      ...(p.componentId ? { componentId: p.componentId } : {}),
    })),
  ),
);
