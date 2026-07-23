// Re-extract Mermaid SVGs and inline them into comparison.html, with
// styles preserved. Uses a depth-tracking approach to find the actual
// closing </div> of each .mermaid block (SVGs contain </div> inside
// <foreignObject>, which would break a non-greedy regex).
import { chromium } from "/home/dev/.local/share/mise/installs/node/22.14.0/lib/node_modules/playwright/index.mjs"
import { readFileSync, writeFileSync } from "fs"

const HTML_PATH = "docs/comparison.html"

const html = readFileSync(HTML_PATH, "utf8")

// Find each <div class="mermaid"> ... </div> block by tracking depth.
function findBlocks(h) {
  const out = []
  const re = /<div class="mermaid">/g
  let m
  while ((m = re.exec(h)) !== null) {
    const start = m.index
    // Walk forward, counting <div> opens and </div> closes
    let depth = 1
    let i = m.index + m[0].length
    const openRe = /<div(\s|>)/g
    const closeRe = /<\/div>/g
    while (depth > 0 && i < h.length) {
      openRe.lastIndex = i
      closeRe.lastIndex = i
      const openMatch = openRe.exec(h)
      const closeMatch = closeRe.exec(h)
      if (!closeMatch) break
      if (openMatch && openMatch.index < closeMatch.index) {
        depth++
        i = openMatch.index + openMatch[0].length
      } else {
        depth--
        i = closeMatch.index + closeMatch[0].length
        if (depth === 0) {
          out.push({ start, end: i, source: h.slice(start + m[0].length, closeMatch.index).trim() })
        }
      }
    }
  }
  return out
}

const blocks = findBlocks(html)
if (blocks.length !== 3) {
  console.error(`expected 3 mermaid blocks, found ${blocks.length}`)
  process.exit(1)
}
console.log(`found ${blocks.length} mermaid blocks`)

// Render each block in a browser and capture the SVG (with styles).
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] })
const ctx = await browser.newContext()
const page = await ctx.newPage()

await page.setContent(`<!doctype html><html><head>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js"></script>
</head><body>
${blocks.map((b, i) => `<div class="m" id="m${i}">\n${b.source}\n</div>`).join("\n")}
<script>
  (async () => {
    mermaid.initialize({ startOnLoad: false, theme: "default", securityLevel: "loose",
      flowchart: { useMaxWidth: true, htmlLabels: true },
      sequence: { useMaxWidth: true, showSequenceNumbers: true } });
    for (let i = 0; i < ${blocks.length}; i++) {
      const el = document.getElementById("m" + i);
      const { svg } = await mermaid.render("mermaid-svg-" + i, el.textContent);
      el.innerHTML = svg;
    }
    document.body.dataset.done = "1";
  })();
</script>
</body></html>`)

await page.waitForFunction(() => document.body.dataset.done === "1", { timeout: 20000 })

const svgs = await page.evaluate(() =>
  Array.from({ length: 3 }, (_, i) => {
    const el = document.getElementById("m" + i)
    const svg = el.querySelector("svg")
    if (!svg) return null
    const scoped = "m" + i
    const clone = svg.cloneNode(true)
    const oldId = clone.getAttribute("id")
    if (oldId) {
      clone.querySelectorAll("style").forEach((s) => {
        s.textContent = s.textContent.replaceAll("#" + oldId, "#" + scoped)
      })
    }
    clone.setAttribute("id", scoped)
    return clone.outerHTML
  })
)

await browser.close()

// Replace each <div class="mermaid">...</div> block (using its known
// start..end from the depth scan) with <div class="mermaid mermaid-inline">SVG</div>.
let result = ""
let cursor = 0
for (let i = 0; i < blocks.length; i++) {
  const b = blocks[i]
  result += html.slice(cursor, b.start)
  result += `<div class="mermaid mermaid-inline">${svgs[i]}</div>\n`
  cursor = b.end
}
result += html.slice(cursor)

// Strip the <script src="mermaid.min.js"> and the Mermaid init script
// since the SVGs are now inlined — we no longer need the runtime.
result = result.replace(/<script src="mermaid\.min\.js"><\/script>\s*/, "")
result = result.replace(/<!-- Mermaid diagrams are pre-rendered[\s\S]*?-->\s*/, "")

writeFileSync(HTML_PATH, result)
console.log(`inlined ${blocks.length} SVGs into ${HTML_PATH}`)
console.log(`script tags in result: ${(result.match(/<script/g) || []).length}`)
