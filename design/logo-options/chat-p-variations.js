// Variations on logo option B (the "Chat P"), rendered as a comparison sheet.
//   node design/logo-options/chat-p-variations.js   → writes chat-p-*.svg and chat-p-sheet.html
const fs = require("node:fs");
const path = require("node:path");
const dir = __dirname;

const GREEN = "#0b8a4f";
const GREEN_LIGHT = "#14a05e";
const MINT = "#4fd394";
const GOLD = "#f5b83d";

// The original Chat P silhouette: a round bubble with its tail forming the P's stem.
const P_ROUND = "M13.5 24A20 20 0 0 1 53.5 24A20 20 0 0 1 33.5 44H25.5V47.5Q25.5 52 21.6 54.6L13.5 60Z";

const VARIANTS = [
  {
    id: "b0-original",
    name: "B · Original",
    idea: "For comparison: round bubble, round hole.",
    mark: ({ fg, bg }) => `<path fill="${fg}" d="${P_ROUND}"/><circle cx="33.5" cy="24" r="7.5" fill="${bg}"/>`,
  },
  {
    id: "b1-bubble-in-bubble",
    name: "B1 · Bubble in a bubble",
    idea: "The hole is itself a tiny chat bubble, echoing the outer one. A detail people notice and remember.",
    mark: ({ fg, bg }) => `<path fill="${fg}" d="${P_ROUND}"/>
      <circle cx="34" cy="23.5" r="7.6" fill="${bg}"/><path fill="${bg}" d="M27.2 26.4L24.6 33L31.6 29.8Z"/>`,
  },
  {
    id: "b2-smiling-p",
    name: "B2 · Smiling P",
    idea: "The hole becomes a smile: a P that's happy to help. Friendlier, closer to the word 'padi'.",
    mark: ({ fg, bg }) => `<path fill="${fg}" d="${P_ROUND}"/>
      <circle cx="27.5" cy="19.5" r="2.9" fill="${bg}"/><circle cx="39.5" cy="19.5" r="2.9" fill="${bg}"/>
      <path d="M26.5 27Q33.5 33.5 40.5 27" fill="none" stroke="${bg}" stroke-width="4" stroke-linecap="round"/>`,
  },
  {
    id: "b3-typing-p",
    name: "B3 · Typing P",
    idea: "Three 'typing' dots instead of a hole: the padi is always replying.",
    mark: ({ fg, bg }) => `<path fill="${fg}" d="${P_ROUND}"/>
      <circle cx="24.5" cy="24" r="3.1" fill="${bg}"/><circle cx="33.5" cy="24" r="3.1" fill="${bg}"/><circle cx="42.5" cy="24" r="3.1" fill="${bg}"/>`,
  },
  {
    id: "b4-coin-p",
    name: "B4 · Coin P",
    idea: "A gold coin sits in the hole: conversations that turn into sales. Adds a second brand colour.",
    mark: ({ fg, bg }) => `<path fill="${fg}" d="${P_ROUND}"/><circle cx="33.5" cy="24" r="8.2" fill="${bg}"/><circle cx="33.5" cy="24" r="5.4" fill="${GOLD}"/>`,
  },
  {
    id: "b5-monoline-p",
    name: "B5 · Line P",
    idea: "Drawn as one rounded line with a flick for the tail. Lighter and more modern; less like a sticker.",
    mark: ({ fg }) => `<path d="M15.5 56Q21 52.5 21 46V24A13.5 13.5 0 1 1 34.5 37.5H28.5" fill="none" stroke="${fg}" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round"/>`,
  },
  {
    id: "b6-square-bubble-p",
    name: "B6 · Square bubble P",
    idea: "A rounded-square bubble instead of a circle. Chunkier and more 'app-like', and less like other round chat logos.",
    mark: ({ fg, bg }) => `<path fill="${fg}" d="M27.5 5H40.5Q54 5 54 18.5V29.5Q54 43 40.5 43H26V47.6Q26 52 22.2 54.4L13 60V18.5Q13 5 27.5 5Z"/>
      <rect x="27" y="17" width="13" height="13" rx="4.5" fill="${bg}"/>`,
  },
];

const tile = (v, size, radius = 15) => {
  const id = `g-${v.id}-${size}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${GREEN_LIGHT}"/><stop offset="1" stop-color="${GREEN}"/></linearGradient></defs>
    <rect width="64" height="64" rx="${radius}" fill="url(#${id})"/>${v.mark({ fg: "#ffffff", bg: GREEN })}</svg>`;
};
const bare = (v, size, dark) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">${v.mark({ fg: dark ? GREEN_LIGHT : GREEN, bg: dark ? "#0a0d12" : "#ffffff" })}</svg>`;
const lockup = (v, dark) => {
  const c = dark ? { bg: "#0a0d12", text: "#e7ebf0", accent: MINT } : { bg: "#ffffff", text: "#0f1724", accent: GREEN };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="440" height="112" viewBox="0 0 440 112">
    <style>@font-face{font-family:Geist;src:url(geist.woff2)}text{font-family:Geist,Inter,system-ui,sans-serif}</style>
    <rect width="440" height="112" fill="${c.bg}"/>
    <g transform="translate(24 24)">${tile(v, 64).replace(/<svg[^>]*>|<\/svg>/g, "")}</g>
    <text x="106" y="70" font-size="40" font-weight="700" letter-spacing="-1"><tspan fill="${c.text}">sales</tspan><tspan fill="${c.accent}">padi</tspan></text></svg>`;
};

for (const v of VARIANTS) {
  if (v.id === "b0-original") continue;
  fs.writeFileSync(path.join(dir, `chat-p-${v.id}-icon.svg`), tile(v, 512));
  fs.writeFileSync(path.join(dir, `chat-p-${v.id}-lockup-dark.svg`), lockup(v, true));
  fs.writeFileSync(path.join(dir, `chat-p-${v.id}-lockup-light.svg`), lockup(v, false));
}

const card = (v) => `
  <section class="card${v.id === "b0-original" ? " ref" : ""}">
    <h2>${v.name}</h2><p>${v.idea}</p>
    <div class="row">
      <div class="big">${tile(v, 112)}</div>
      <div class="small">
        <div class="phone">${tile(v, 46, 13)}<span>SalesPadi</span></div>
        <div class="tabs"><div class="tab">${tile(v, 16, 12)}Inbox</div><div class="tab light">${tile(v, 16, 12)}Inbox</div></div>
        <div class="bare">${bare(v, 34, true)}<span class="lt">${bare(v, 34, false)}</span></div>
      </div>
    </div>
    <div class="lk">${lockup(v, true)}</div>
    <div class="lk light">${lockup(v, false)}</div>
  </section>`;

fs.writeFileSync(path.join(dir, "chat-p-sheet.html"), `<!doctype html><html><head><meta charset="utf-8"><title>Chat P variations</title>
<style>
  @font-face{font-family:Geist;src:url(geist.woff2)}
  body{margin:0;background:#0a0d12;color:#e7ebf0;font-family:Geist,Inter,system-ui,sans-serif;padding:28px}
  h1{font-size:26px;margin:0 0 4px;letter-spacing:-.5px} .sub{color:#a4aebc;margin:0 0 22px}
  .grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px}
  .card{background:#11161d;border:1px solid #222a35;border-radius:18px;padding:18px;display:flex;flex-direction:column;gap:12px}
  .card.ref{opacity:.75;border-style:dashed}
  .card h2{margin:0;font-size:17px} .card p{margin:0;color:#a4aebc;font-size:13px;line-height:1.45;min-height:56px}
  .row{display:flex;gap:14px;align-items:center}
  .big svg{display:block;filter:drop-shadow(0 8px 18px rgba(0,0,0,.35))}
  .small{display:flex;flex-direction:column;gap:8px}
  .phone{display:flex;flex-direction:column;align-items:center;gap:4px;font-size:9px;padding:8px 10px;border-radius:12px;background:linear-gradient(140deg,#3b2a5c,#1b3d4f 60%,#18413a);width:max-content}
  .tabs{display:flex;gap:4px} .tab{display:flex;align-items:center;gap:5px;background:#232a35;border-radius:6px 6px 0 0;padding:5px 7px;font-size:11px;color:#d6dbe2}
  .tab.light{background:#e8ebf0;color:#30384a}
  .bare{display:flex;gap:6px} .lt{background:#fff;border-radius:7px;display:inline-flex}
  .lk{border-radius:10px;overflow:hidden;border:1px solid #222a35;line-height:0} .lk svg{width:100%;height:auto}
</style></head><body>
<h1>Chat P variations</h1><p class="sub">Same idea, six directions. The first card is the original, for comparison.</p>
<div class="grid">${VARIANTS.map(card).join("")}</div></body></html>`);
console.log("wrote", VARIANTS.length - 1, "variations");
