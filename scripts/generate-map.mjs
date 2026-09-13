import { geoNaturalEarth1, geoGraticule10, geoPath } from "d3-geo";
import { feature, mesh, merge } from "topojson-client";
import { readFileSync, writeFileSync } from "node:fs";
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
const coords = [
  [-122.4, 37.8],
  [-77, 38],
  [-0.1, 51.5],
  [8.7, 50.1],
  [72.9, 19.1],
  [103.8, 1.4],
  [139.7, 35.7],
  [151.2, -33.9],
  [-46.6, -23.5],
];
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
