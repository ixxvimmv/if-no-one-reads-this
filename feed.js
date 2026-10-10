// Vercel serverless function: serves /feed.xml (RSS 2.0) from content.json in your GitHub repo.
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const strip = (h) => String(h || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

module.exports = async (req, res) => {
  try {
    const owner = process.env.VERCEL_GIT_REPO_OWNER;
    const repo = process.env.VERCEL_GIT_REPO_SLUG;
    const branch = process.env.VERCEL_GIT_COMMIT_REF || "main";
    if (!owner || !repo) throw new Error("Not deployed from a Git repo");
    const r = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/content.json?t=${Date.now()}`);
    if (!r.ok) throw new Error("content.json not found");
    const data = await r.json();
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const base = `https://${host}`;
    const now = Date.now();
    const posts = (data.posts || [])
      .filter((p) => p.status === "published" && Date.parse(p.publishDate) <= now)
      .sort((a, b) => Date.parse(b.publishDate) - Date.parse(a.publishDate))
      .slice(0, 30);
    const items = posts.map((p) => `
    <item>
      <title>${esc(p.title)}</title>
      <link>${base}/#/post/${esc(p.slug)}</link>
      <guid isPermaLink="false">${esc(p.id)}</guid>
      <pubDate>${new Date(p.publishDate).toUTCString()}</pubDate>
      <description>${esc(p.excerpt || strip(p.content).slice(0, 280))}</description>
    </item>`).join("");
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>If No One Reads This</title>
  <link>${base}/</link>
  <description>A personal writing sanctuary of essays, letters, journal entries, poems, and stories.</description>
  <language>en</language>${items}
</channel></rss>`;
    res.setHeader("Content-Type", "application/rss+xml; charset=utf-8");
    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=3600");
    res.status(200).send(xml);
  } catch (e) {
    res.status(500).send("Feed unavailable: " + e.message);
  }
};
