// SalesPadi brand assets (logo B4, "Coin P"): SVG sources plus an HTML page per PNG size.
// Run `node design/brand/build.js`, then `node design/brand/render.js` to export PNGs, the favicon and the zip.
const fs = require("node:fs");
const path = require("node:path");

const out = path.join(__dirname, "files");
fs.mkdirSync(out, { recursive: true });

const C = {
  green: "#0b8a4f",
  greenLight: "#14a05e",
  gold: "#f5b83d",
  ink: "#0f1724",
  mint: "#4fd394",
  night: "#0a0d12",
};

// The mark, drawn in a 64×64 box: a speech bubble whose tail is the stem of a P, with a gold coin in the hole.
const P = "M13.5 24A20 20 0 0 1 53.5 24A20 20 0 0 1 33.5 44H25.5V47.5Q25.5 52 21.6 54.6L13.5 60Z";
const mark = (fg, hole) =>
  `<path fill="${fg}" d="${P}"/><circle cx="33.5" cy="24" r="8.2" fill="${hole}"/><circle cx="33.5" cy="24" r="5.4" fill="${C.gold}"/>`;
const gradient = `<defs><linearGradient id="sp" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.greenLight}"/><stop offset="1" stop-color="${C.green}"/></linearGradient></defs>`;

/** App icon. `rounded` gives the soft-corner tile; otherwise a full square (what Meta and app stores want). */
const icon = (rounded) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${gradient}
  <rect width="64" height="64" ${rounded ? 'rx="15"' : ""} fill="url(#sp)"/>${mark("#ffffff", C.green)}</svg>`;

/** Mark on its own (no tile), cropped to the mark. Holes are cut out so it works on any background. */
const bareMark = (fg) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="12 3 43 58">
  <defs><mask id="m"><rect x="0" y="0" width="64" height="64" fill="#fff"/><circle cx="33.5" cy="24" r="8.2" fill="#000"/></mask></defs>
  <path fill="${fg}" d="${P}" mask="url(#m)"/><circle cx="33.5" cy="24" r="5.4" fill="${C.gold}"/></svg>`;

/** Icon + name. The text uses the Geist font; the PNG exports are the safe choice where Geist isn't installed. */
const lockup = (dark) => {
  const text = dark ? "#e7ebf0" : C.ink;
  const accent = dark ? C.mint : C.green;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 330 80">
  <style>text{font-family:Geist,"Geist Sans",Inter,system-ui,sans-serif}</style>${gradient}
  <g transform="translate(8 8)"><rect width="64" height="64" rx="15" fill="url(#sp)"/>${mark("#ffffff", C.green)}</g>
  <text x="88" y="55" font-size="42" font-weight="700" letter-spacing="-1.2"><tspan fill="${text}">sales</tspan><tspan fill="${accent}">padi</tspan></text></svg>`;
};

const svgs = {
  "salespadi-icon.svg": icon(true),
  "salespadi-icon-square.svg": icon(false),
  "salespadi-mark-green.svg": bareMark(C.green),
  "salespadi-mark-white.svg": bareMark("#ffffff"),
  "salespadi-logo-for-light-backgrounds.svg": lockup(false),
  "salespadi-logo-for-dark-backgrounds.svg": lockup(true),
};
for (const [name, svg] of Object.entries(svgs)) fs.writeFileSync(path.join(out, name), svg);

// What to export as PNG: [file, source svg, width, height, page background (null = transparent)]
const pngs = [
  ["salespadi-app-icon-1024-square.png", "salespadi-icon-square.svg", 1024, 1024, null],
  ["salespadi-icon-512.png", "salespadi-icon.svg", 512, 512, null],
  ["salespadi-icon-192.png", "salespadi-icon.svg", 192, 192, null],
  ["salespadi-apple-touch-icon-180.png", "salespadi-icon-square.svg", 180, 180, null],
  ["salespadi-mark-green-512.png", "salespadi-mark-green.svg", 380, 512, null],
  ["salespadi-mark-white-512.png", "salespadi-mark-white.svg", 380, 512, null],
  ["salespadi-logo-light-1320.png", "salespadi-logo-for-light-backgrounds.svg", 1320, 320, "#ffffff"],
  ["salespadi-logo-dark-1320.png", "salespadi-logo-for-dark-backgrounds.svg", 1320, 320, C.night],
  ["salespadi-logo-transparent-1320.png", "salespadi-logo-for-light-backgrounds.svg", 1320, 320, null],
  ["favicon-48.png", "salespadi-icon.svg", 48, 48, null],
  ["favicon-32.png", "salespadi-icon.svg", 32, 32, null],
  ["favicon-16.png", "salespadi-icon.svg", 16, 16, null],
];
fs.writeFileSync(path.join(__dirname, "pngs.json"), JSON.stringify(pngs, null, 1));
console.log(`wrote ${Object.keys(svgs).length} SVGs; ${pngs.length} PNGs to render`);
module.exports = { C, P };
