// Exports the PNGs listed in pngs.json from the SVGs in files/, using the app's Geist font for the name.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const dir = path.join(__dirname, "files");
const font = fs.readFileSync(path.join(__dirname, "..", "logo-options", "geist.woff2")).toString("base64");
const pngs = JSON.parse(fs.readFileSync(path.join(__dirname, "pngs.json"), "utf8"));

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const [file, src, w, h, bg] of pngs) {
    const svg = fs.readFileSync(path.join(dir, src), "utf8").replace("<svg ", `<svg width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet" `);
    await page.setViewportSize({ width: w, height: h });
    await page.setContent(`<!doctype html><html><head><style>
      @font-face{font-family:Geist;src:url(data:font/woff2;base64,${font}) format("woff2")}
      html,body{margin:0;width:${w}px;height:${h}px;background:${bg ?? "transparent"};overflow:hidden}
      svg{display:block}</style></head><body>${svg}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(dir, file), omitBackground: bg === null });
  }
  await browser.close();
  console.log("rendered", pngs.length, "PNGs");
})();
