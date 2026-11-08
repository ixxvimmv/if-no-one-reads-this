// Vercel serverless function:
//   /p/<slug>   -> tiny HTML page with this post's own Open Graph tags, then sends people to /#/post/<slug>
//   /og/<slug>  -> this post's cover image as a real image file (covers are stored as data URLs)
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const strip = (h) => String(h || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

async function loadContent() {
  const owner = process.env.VERCEL_GIT_REPO_OWNER;
  const repo = process.env.VERCEL_GIT_REPO_SLUG;
  const branch = process.env.VERCEL_GIT_COMMIT_REF || "main";
  if (!owner || !repo) throw new Error("Not deployed from a Git repo");
  const r = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/content.json?t=${Date.now()}`);
  if (!r.ok) throw new Error("content.json not found");
  return r.json();
}

module.exports = async (req, res) => {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const base = `https://${host}`;
  const slug = String((req.query && req.query.slug) || "").replace(/[^a-zA-Z0-9\-_]/g, "");
  try {
    const data = await loadContent();
    const post = (data.posts || []).find((p) => p.slug === slug && p.status === "published" && Date.parse(p.publishDate) <= Date.now());
    if (!post) { res.statusCode = 302; res.setHeader("Location", `${base}/`); return res.end(); }

    const m = /^data:(image\/[a-z+.-]+);base64,(.+)$/i.exec(post.coverImage || "");
    if (req.query && req.query.img) {
      if (m) {
        res.setHeader("Content-Type", m[1]);
        res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
        return res.status(200).send(Buffer.from(m[2], "base64"));
      }
      const fallback = (data.settings && data.settings.socialImageUrl) || (/^https:/i.test(post.coverImage || "") ? post.coverImage : "");
      res.statusCode = 302; res.setHeader("Location", fallback || `${base}/`); return res.end();
    }

    const settings = data.settings || {};
    let image = "";
    if (m) image = `${base}/og/${encodeURIComponent(post.slug)}`;
    else if (/^https:/i.test(post.coverImage || "")) image = post.coverImage;
    else if (/^https:/i.test(settings.socialImageUrl || "")) image = settings.socialImageUrl;

    const title = `${post.seoTitle || post.title} — If No One Reads This`;
    const desc = post.metaDescription || post.excerpt || strip(post.content).slice(0, 200);
    const target = `${base}/#/post/${post.slug}`;
    const self = `${base}/p/${post.slug}`;
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="If No One Reads This">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(self)}">
${image ? `<meta property="og:image" content="${esc(image)}">` : ""}
<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
${image ? `<meta name="twitter:image" content="${esc(image)}">` : ""}
<link rel="canonical" href="${esc(self)}">
<meta http-equiv="refresh" content="0; url=${esc(target)}">
</head><body><p><a href="${esc(target)}">Continue to “${esc(post.title)}”</a></p>
<script>location.replace(${JSON.stringify(target)});</script></body></html>`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=3600");
    res.status(200).send(html);
  } catch (e) {
    res.statusCode = 302; res.setHeader("Location", `${base}/#/post/${slug}`); res.end();
  }
};
