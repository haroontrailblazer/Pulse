import { geoNaturalEarth1, geoGraticule10, geoPath } from "d3-geo";
import { feature, mesh, merge } from "topojson-client";
import { readFileSync, writeFileSync } from "node:fs";
import { hubs } from "../shared/atlas.js";
const world = JSON.parse(
  readFileSync("node_modules/world-atlas/countries-110m.json", "utf8"),
);
const land = {
  type: "FeatureCollection",
  features: feature(world, world.objects.countries).features.filter(
    (f) => f.id !== "010",
  ),
};
const projection = geoNaturalEarth1().fitExtent(
  [
    [32, 34],
    [838, 370],
  ],
  land,
);
// Projected straight from shared/atlas.js rather than from a second list kept
// in this file. The old array had to stay index-aligned with `hubs` by hand,
// and getting that wrong moved every pin after the mistake without failing
// anything -- the map just quietly drew Frankfurt in Mumbai's place.
const coords = hubs.map((hub) => {
  if (!Array.isArray(hub.lonlat) || hub.lonlat.length !== 2)
    throw new Error(`Hub "${hub.name}" has no lonlat to project`);
  return hub.lonlat;
});
const path = geoPath(projection).digits(1);
writeFileSync(
  "src/map-data.json",
  JSON.stringify({
    outline: path(
      merge(
        world,
        world.objects.countries.geometries.filter((g) => g.id !== "010"),
      ),
    ),
    borders: path(mesh(world, world.objects.countries, (a, b) => a !== b)),
    graticule: path(geoGraticule10()),
    points: coords.map(projection),
  }),
);
console.log(
  "Precomputed land, country boundaries, graticule, and hub coordinates.",
);
