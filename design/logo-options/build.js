// Builds the SalesPadi logo options: one SVG per option (icon + wordmark) and a comparison sheet.
//   node design/logo-options/build.js   → writes the SVGs and sheet.html next to this file
const fs = require("node:fs");
const path = require("node:path");
const dir = __dirname;

const GREEN = "#0b8a4f";
const GREEN_LIGHT = "#14a05e";
const MINT = "#4fd394";
const AMBER = "#f5b83d";

/**
 * Each mark is drawn in a 64×64 box. `fg` is the mark colour, `bg` the colour of whatever sits behind it
 * (used for cut-outs like the smile), `accent` an optional second colour.
 */
const OPTIONS = [
  {
    id: "a-smiling-tag",
    name: "A · Smiling tag",
    idea: "A price tag that is also a chat bubble, with a smile. Selling + chatting + friendly padi.",
    word: (c) => `<tspan fill="${c.text}">Sales</tspan><tspan fill="${c.text}">Padi</tspan>`,
    weight: 650,
    mark: ({ fg, bg }) => `
      <path fill="${fg}" d="M23 9H47Q55 9 55 17V37Q55 45 47 45H31L20.5 54.5Q19.6 50 20.4 45H18Q10 45 10 37V22Z"/>
      <circle cx="19.5" cy="19.5" r="3.6" fill="${bg}"/>
      <path d="M26 29.5Q33 37 40 29.5" fill="none" stroke="${bg}" stroke-width="4" stroke-linecap="round"/>`,
  },
  {
    id: "b-chat-p",
    name: "B · Chat P",
    idea: "A letter P whose bowl is a speech bubble and whose stem is the bubble's tail. Simple, ownable monogram.",
    word: (c) => `<tspan fill="${c.text}">sales</tspan><tspan fill="${c.accentText}">padi</tspan>`,
    weight: 700,
    mark: ({ fg, bg }) => `
      <path fill="${fg}" d="M13.5 24A20 20 0 0 1 53.5 24A20 20 0 0 1 33.5 44H25.5V47.5Q25.5 52 21.6 54.6L13.5 60Z"/>
      <circle cx="33.5" cy="24" r="7.5" fill="${bg}"/>`,
  },
  {
    id: "c-two-padis",
    name: "C · Two padis",
    idea: "Two chat bubbles overlapping: the customer and their padi. Says 'conversation' at a glance.",
    word: (c) => `<tspan fill="${c.text}">Sales</tspan><tspan fill="${c.accentText}">Padi</tspan>`,
    weight: 650,
    mark: ({ fg, bg, accent }) => `
      <path fill="${accent}" d="M18 11H34Q42 11 42 19V30Q42 38 34 38H19L11 45.5L12.2 37.4Q8 35.7 8 30V21Q8 11 18 11Z"/>
      <path fill="${fg}" stroke="${bg}" stroke-width="3.5" stroke-linejoin="round"
        d="M30 22.5H46Q56 22.5 56 32.5V41Q56 46.7 51.8 48.4L53 56.5L45 49.5H30Q22 49.5 22 41.5V30.5Q22 22.5 30 22.5Z"/>
      <circle cx="31.5" cy="36" r="2.6" fill="${bg}"/><circle cx="39" cy="36" r="2.6" fill="${bg}"/><circle cx="46.5" cy="36" r="2.6" fill="${bg}"/>`,
  },
  {
    id: "d-chatty-bag",
    name: "D · Chatty bag",
    idea: "A smiling shopping bag with a speech-bubble tail. Shopping that talks back.",
    word: (c) => `<tspan fill="${c.text}" font-weight="500">Sales</tspan><tspan fill="${c.accentText}">Padi</tspan>`,
    weight: 750,
    mark: ({ fg, bg, accent }) => `
      <path d="M24 24V19.5A8 8 0 0 1 40 19.5V24" fill="none" stroke="${accent}" stroke-width="4.5" stroke-linecap="round"/>
      <path fill="${fg}" d="M14.5 23H49.5Q51.6 23 51.4 25.1L49 49Q48.5 54 43.5 54H27L16 60.5L18.7 53.6Q15.6 52.3 15.2 49L12.6 25.1Q12.4 23 14.5 23Z"/>
      <path d="M24.5 35Q32 43 39.5 35" fill="none" stroke="${bg}" stroke-width="4.2" stroke-linecap="round"/>`,
  },
];

const tile = (o, size, radius = 15) => {
  const id = `g-${o.id}-${size}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${GREEN_LIGHT}"/><stop offset="1" stop-color="${GREEN}"/></linearGradient></defs>
    <rect width="64" height="64" rx="${radius}" fill="url(#${id})"/>
    ${o.mark({ fg: "#ffffff", bg: GREEN, accent: o.id.startsWith("c") ? MINT : o.id.startsWith("d") ? AMBER : "#ffffff" })}
  </svg>`;
};

const bare = (o, size, dark) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">${o.mark({
    fg: dark ? GREEN_LIGHT : GREEN,
    bg: dark ? "#0a0d12" : "#ffffff",
    accent: o.id.startsWith("c") ? MINT : o.id.startsWith("d") ? AMBER : GREEN,
  })}</svg>`;

/** Icon tile + name, as one SVG (what goes in the app header, emails, invoices). */
const lockup = (o, dark) => {
  const c = dark
    ? { bg: "#0a0d12", text: "#e7ebf0", accentText: MINT }
    : { bg: "#ffffff", text: "#0f1724", accentText: GREEN };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="440" height="112" viewBox="0 0 440 112">
    <style>@font-face{font-family:Geist;src:url(geist.woff2)}text{font-family:Geist,Inter,system-ui,sans-serif}</style>
    <rect width="440" height="112" fill="${c.bg}"/>
    <g transform="translate(24 24)">${tile(o, 64).replace(/<svg[^>]*>|<\/svg>/g, "")}</g>
    <text x="106" y="70" font-size="40" font-weight="${o.weight}" letter-spacing="-1">${o.word(c)}</text>
  </svg>`;
};

for (const o of OPTIONS) {
  fs.writeFileSync(path.join(dir, `${o.id}-icon.svg`), tile(o, 512, 15));
  fs.writeFileSync(path.join(dir, `${o.id}-lockup-dark.svg`), lockup(o, true));
  fs.writeFileSync(path.join(dir, `${o.id}-lockup-light.svg`), lockup(o, false));
}

const card = (o) => `
  <section class="card">
    <header><h2>${o.name}</h2><p>${o.idea}</p></header>
    <div class="row">
      <div class="big">${tile(o, 132)}</div>
      <div class="phone">
        ${[o, null, null, null].map((x, i) => `<div class="app">${x ? tile(x, 52, 13) : `<span class="ph p${i}"></span>`}<span>${x ? "SalesPadi" : ["", "WhatsApp", "Paystack", "Photos"][i]}</span></div>`).join("")}
      </div>
      <div class="sizes">
        <div class="tab"><span class="fav">${tile(o, 16, 12)}</span>Inbox · SalesPadi</div>
        <div class="tab light"><span class="fav">${tile(o, 16, 12)}</span>Inbox · SalesPadi</div>
        <div class="bare">${bare(o, 44, true)}<span class="lt">${bare(o, 44, false)}</span></div>
      </div>
    </div>
    <div class="row lockups">
      <div class="lk dark">${lockup(o, true)}</div>
      <div class="lk">${lockup(o, false)}</div>
    </div>
  </section>`;

const html = `<!doctype html><html><head><meta charset="utf-8"><title>SalesPadi logo options</title>
<style>
  @font-face{font-family:Geist;src:url(geist.woff2)}
  body{margin:0;background:#0a0d12;color:#e7ebf0;font-family:Geist,Inter,system-ui,sans-serif;padding:28px}
  h1{font-size:26px;margin:0 0 4px;letter-spacing:-.5px} .sub{color:#a4aebc;margin:0 0 24px}
  .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}
  .card{background:#11161d;border:1px solid #222a35;border-radius:18px;padding:22px}
  .card h2{margin:0;font-size:19px} .card p{margin:6px 0 18px;color:#a4aebc;font-size:14px;line-height:1.45}
  .row{display:flex;gap:18px;align-items:center}
  .big svg{display:block;filter:drop-shadow(0 8px 18px rgba(0,0,0,.35))}
  .phone{display:grid;grid-template-columns:repeat(4,52px);gap:10px 12px;padding:14px;border-radius:16px;background:linear-gradient(140deg,#3b2a5c,#1b3d4f 60%,#18413a)}
  .app{display:flex;flex-direction:column;align-items:center;gap:5px;font-size:9.5px;color:#fff;white-space:nowrap}
  .ph{width:52px;height:52px;border-radius:13px;display:block} .p1{background:#25d366} .p2{background:#0ba4db} .p3{background:linear-gradient(135deg,#f9a03f,#e64980)}
  .sizes{display:flex;flex-direction:column;gap:8px;flex:1;min-width:0}
  .tab{display:flex;align-items:center;gap:7px;background:#232a35;border-radius:8px 8px 0 0;padding:7px 10px;font-size:12px;color:#d6dbe2;width:150px}
  .tab.light{background:#e8ebf0;color:#30384a} .fav{display:inline-flex}
  .bare{display:flex;gap:8px} .lt{background:#fff;border-radius:8px;display:inline-flex}
  .lockups{margin-top:16px} .lk{flex:1;min-width:0;border-radius:12px;overflow:hidden;border:1px solid #222a35;line-height:0}
  .lk svg{width:100%;height:auto}
</style></head><body>
<h1>SalesPadi logo options</h1>
<p class="sub">Each shown as the app icon, on a phone home screen, as a browser-tab icon at real size, as a plain mark, and with the name in dark and light.</p>
<div class="grid">${OPTIONS.map(card).join("")}</div>
</body></html>`;
fs.writeFileSync(path.join(dir, "sheet.html"), html);
console.log("wrote", OPTIONS.length, "options");
