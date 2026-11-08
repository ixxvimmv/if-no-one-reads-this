// Generates feed.xml (RSS 2.0) from content.json so the feed works on GitHub Pages,
// which has no server. Run locally:  node scripts/build-feed.js
// In CI it runs automatically whenever content.json changes (.github/workflows/feed.yml).
//
// Base URL: SITE_URL env var if set, else https://<owner>.github.io/<repo> from GITHUB_REPOSITORY,
// else the default below.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const DEFAULT_BASE = "https://ixxvimmv.github.io/if-no-one-reads-this";
const repoEnv = process.env.GITHUB_REPOSITORY; // "owner/repo"
const base = (
  process.env.SITE_URL ||
  (repoEnv ? `https://${repoEnv.split("/")[0]}.github.io/${repoEnv.split("/")[1]}` : DEFAULT_BASE)
).replace(/\/+$/, "");

const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const strip = (h) => String(h || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

const data = JSON.parse(fs.readFileSync(path.join(root, "content.json"), "utf8"));
const now = Date.now();
const posts = (data.posts || [])
  .filter((p) => p.status === "published" && Date.parse(p.publishDate) <= now)
  .sort((a, b) => Date.parse(b.publishDate) - Date.parse(a.publishDate))
  .slice(0, 30);

const items = posts
  .map(
    (p) => `
    <item>
      <title>${esc(p.title)}</title>
      <link>${base}/#/post/${esc(p.slug)}</link>
      <guid isPermaLink="false">${esc(p.id)}</guid>
      <pubDate>${new Date(p.publishDate).toUTCString()}</pubDate>
      <description>${esc(p.excerpt || strip(p.content).slice(0, 280))}</description>
    </item>`
  )
  .join("");

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>If No One Reads This</title>
  <link>${base}/</link>
  <description>A personal writing sanctuary of essays, letters, journal entries, poems, and stories.</description>
  <language>en</language>${items}
</channel></rss>
`;

fs.writeFileSync(path.join(root, "feed.xml"), xml);
console.log(`feed.xml written: ${posts.length} posts, base ${base}`);
