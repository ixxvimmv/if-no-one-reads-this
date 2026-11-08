#!/usr/bin/env node
/*
  Builds everything that has to exist as a real file on a static host, from content.json:

    1. Images     data:image/... covers and the About photo are written out as compressed
                  files in images/ and content.json is rewritten to point at them
                  (this keeps content.json small, so every visitor downloads far less).
    2. Posts      posts/<slug>/index.html — one real, crawlable page per published writing,
                  with its own <title>, description and link-preview (Open Graph) tags.
    3. Archive    posts/index.html — a plain list of every published writing.
    4. Feed       feed.xml (RSS 2.0)
    5. Sitemap    sitemap.xml

  Run locally:  npm install && npm run build
  In CI it runs automatically when content.json changes (.github/workflows/build.yml).
  It is idempotent: running it twice produces no further changes.
*/
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const sharp = require("sharp");

const ROOT = path.join(__dirname, "..");
const SITE_NAME = "If No One Reads This";
const DEFAULT_BASE = "https://ixxvimmv.github.io/if-no-one-reads-this";
const DEFAULT_DESC = "A personal writing sanctuary of essays, letters, journal entries, poems, and stories.";
// Dates on the static pages are printed in the author's time zone so they don't shift by a day.
const TIMEZONE = "Asia/Taipei";

function siteBase() {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, "");
  const repo = process.env.GITHUB_REPOSITORY; // "owner/repo"
  if (repo) {
    const [owner, name] = repo.split("/");
    return name.toLowerCase() === `${owner.toLowerCase()}.github.io`
      ? `https://${owner}.github.io`
      : `https://${owner}.github.io/${name}`;
  }
  return DEFAULT_BASE;
}
const BASE = siteBase();

/* ---------- small helpers ---------- */
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const decodeEntities = (s) => s.replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const strip = (h) => decodeEntities(String(h || "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
const readingTime = (html) => { const t = strip(html); return Math.max(1, Math.round((t ? t.split(/\s+/).length : 0) / 200)); };
const fmtDate = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: TIMEZONE });
const isColorDark = (hex) => {
  const c = String(hex || "").replace("#", "");
  if (c.length !== 6) return false;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16));
  if ([r, g, b].some(isNaN)) return false;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.55;
};
const absUrl = (p) => (/^https?:\/\//i.test(p) ? p : `${BASE}/${String(p).replace(/^\/+/, "")}`);
const write = (rel, text) => {
  const file = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file) && fs.readFileSync(file, "utf8") === text) return false;
  fs.writeFileSync(file, text);
  return true;
};

/* ---------- 1. images ---------- */
const RASTER = /^data:image\/(png|jpe?g|webp|gif|avif);base64,(.+)$/i;

async function extractImage(dataUrl, dir, name, maxWidth, quality) {
  const m = RASTER.exec(dataUrl || "");
  if (!m) return null;
  const buf = Buffer.from(m[2], "base64");
  const hash = crypto.createHash("sha1").update(buf).digest("hex").slice(0, 8);
  const rel = `images/${dir}/${name}-${hash}.jpg`; // hash in the name = new file whenever the picture changes
  const out = path.join(ROOT, rel);
  if (!fs.existsSync(out)) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await sharp(buf).rotate().resize({ width: maxWidth, withoutEnlargement: true })
      .flatten({ background: "#ffffff" }).jpeg({ quality, mozjpeg: true }).toFile(out);
  }
  return rel;
}

async function processImages(data) {
  let changed = 0;
  for (const p of data.posts || []) {
    const rel = await extractImage(p.coverImage, "covers", p.slug || p.id, 1600, 78);
    if (rel) { p.coverImage = rel; changed++; }
  }
  const s = data.settings || {};
  const about = await extractImage(s.aboutPhoto, "about", "about", 800, 82);
  if (about) { s.aboutPhoto = about; changed++; }

  // remove generated images nothing points to any more
  const used = new Set();
  for (const p of data.posts || []) if (p.coverImage) used.add(p.coverImage);
  if (s.aboutPhoto) used.add(s.aboutPhoto);
  for (const dir of ["covers", "about"]) {
    const abs = path.join(ROOT, "images", dir);
    if (!fs.existsSync(abs)) continue;
    for (const f of fs.readdirSync(abs)) if (!used.has(`images/${dir}/${f}`)) fs.unlinkSync(path.join(abs, f));
  }
  return changed;
}

/* ---------- 2. post pages ---------- */
const FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%238B6F47'/%3E%3Ctext x='16' y='22' font-family='Georgia,serif' font-size='15' font-weight='600' fill='white' text-anchor='middle'%3EIN%3C/text%3E%3C/svg%3E";
const FONTS = "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400;1,9..144,500&family=Lora:ital,wght@0,400;0,500;0,600;1,400&family=Inter:wght@400;500;600&display=swap";
const MOON = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
const SUN = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';

// Same theme rules as the main site (saved choice, else the visitor's system setting).
const THEME_INIT = `<script>(function(){try{var s=localStorage.getItem('inrt-theme');var d=window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.setAttribute('data-theme',s||(d?'dark':'light'));}catch(e){}})();</script>`;
// Theme toggle, mobile menu, and the same dark-mode fix-up for editor-baked dark text colours.
const PAGE_SCRIPT = `<script>
(function(){
  var root=document.documentElement, MOON='${MOON}', SUN='${SUN}';
  var icon=document.getElementById('theme-icon'), btn=document.getElementById('theme-toggle');
  function fix(){
    var dark=root.getAttribute('data-theme')==='dark';
    document.querySelectorAll('.article-body [style*="color"], .post-footer [style*="color"]').forEach(function(el){
      if(!el.style.color) return;
      if(el.dataset.origColor===undefined) el.dataset.origColor=el.style.color;
      var m=el.dataset.origColor.match(/\\d+(\\.\\d+)?/g), isDark=false;
      if(m&&m.length>=3){isDark=(0.299*m[0]+0.587*m[1]+0.114*m[2])/255<0.45;}
      el.style.color=(dark&&isDark)?'var(--text)':el.dataset.origColor;
    });
  }
  function paint(){ icon.innerHTML = root.getAttribute('data-theme')==='dark' ? SUN : MOON; }
  btn.addEventListener('click',function(){
    var next=root.getAttribute('data-theme')==='dark'?'light':'dark';
    root.setAttribute('data-theme',next);
    try{localStorage.setItem('inrt-theme',next);}catch(e){}
    paint(); fix();
  });
  var mt=document.getElementById('menu-toggle'), nl=document.getElementById('nav-links');
  mt.addEventListener('click',function(){var o=nl.classList.toggle('open');mt.setAttribute('aria-expanded',o?'true':'false');});
  paint(); fix();
})();
</script>`;

function header(root) {
  return `<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
  <nav class="nav" aria-label="Primary">
    <a href="${root}#/" class="brand">${SITE_NAME}<span class="dot">.</span></a>
    <ul class="nav-links" id="nav-links">
      <li><a href="${root}#/">Home</a></li>
      <li><a href="${root}#/writings">All Writings</a></li>
      <li><a href="${root}#/categories">Categories</a></li>
      <li><a href="${root}#/about">About</a></li>
      <li><a href="${root}#/contact">Contact</a></li>
    </ul>
    <div class="nav-actions">
      <button class="icon-btn" id="theme-toggle" aria-label="Toggle dark mode">
        <svg id="theme-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${MOON}</svg>
      </button>
      <button class="icon-btn nav-toggle" id="menu-toggle" aria-label="Open menu" aria-expanded="false">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      </button>
    </div>
  </nav>
</header>`;
}

function footer(root) {
  return `<footer class="site-footer">
  <div class="wrap">
    <div class="footer-grid">
      <div>
        <div class="footer-brand">${SITE_NAME}</div>
        <p class="footer-tag">A place to keep the unfinished thoughts — essays, letters, and small stories, written slowly.</p>
      </div>
      <div class="footer-links">
        <div>
          <h5>Explore</h5>
          <ul>
            <li><a href="${root}posts/">All writings</a></li>
            <li><a href="${root}#/categories">Categories</a></li>
            <li><a href="${root}#/about">About</a></li>
            <li><a href="${root}#/contact">Contact</a></li>
            <li><a href="${root}feed.xml">RSS feed</a></li>
          </ul>
        </div>
      </div>
    </div>
    <div class="footer-bottom">
      <span>© ${new Date().getUTCFullYear()} ${SITE_NAME}. Written and built by hand.</span>
    </div>
  </div>
</footer>`;
}

function pageShell({ title, description, canonical, root, ogType, image, extraHead, body }) {
  return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(image)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(image)}">${extraHead || ""}
${THEME_INIT}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${FONTS}" rel="stylesheet">
<link rel="stylesheet" href="${root}styles.css">
<link rel="alternate" type="application/rss+xml" title="${SITE_NAME}" href="${root}feed.xml">
<link rel="icon" type="image/svg+xml" href="${FAVICON}">
</head>
<body>
${header(root)}
<main id="main" tabindex="-1">
${body}
</main>
${footer(root)}
${PAGE_SCRIPT}
</body>
</html>
`;
}

function postPage(post, ctx) {
  const root = "../../";
  const { catBySlug, tagBySlug, ordered, defaultImage } = ctx;
  const c = catBySlug[post.category] || { name: "Uncategorized" };
  const i = ordered.findIndex((p) => p.slug === post.slug);
  const prev = ordered[i + 1], next = ordered[i - 1];
  const title = `${post.seoTitle || post.title} — ${SITE_NAME}`;
  const description = post.metaDescription || post.excerpt || strip(post.content).slice(0, 160);
  const url = `${BASE}/posts/${post.slug}/`;
  const cover = post.coverImage && !post.coverImage.startsWith("data:") ? post.coverImage : "";
  const image = cover ? absUrl(cover) : defaultImage;
  const coverSrc = cover ? (/^https?:/i.test(cover) ? cover : root + cover) : "";
  const updated = post.updatedAt && new Date(post.updatedAt) - new Date(post.publishDate) > 864e5;
  const tags = (post.tags || []).map((t) => (tagBySlug[t] || { name: t }).name);
  const ld = {
    "@context": "https://schema.org", "@type": "BlogPosting",
    headline: post.title, description, image: [image], url, mainEntityOfPage: url, inLanguage: "en",
    datePublished: post.publishDate, dateModified: post.updatedAt || post.publishDate,
    articleSection: c.name, keywords: tags.join(", "),
    publisher: { "@type": "Organization", name: SITE_NAME },
  };
  const extraHead = `
<meta property="article:published_time" content="${esc(post.publishDate)}">
<meta property="article:modified_time" content="${esc(post.updatedAt || post.publishDate)}">
<meta property="article:section" content="${esc(c.name)}">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>`;

  const body = `<article>
  <div class="post-hero${post.cardColor && isColorDark(post.cardColor) ? " hero-on-dark" : ""}"${post.cardColor ? ` style="background:${esc(post.cardColor)};"` : ""}>
    <div class="wrap">
      <p class="eyebrow">${esc(c.name)}</p>
      <div class="post-meta-row">
        <span>${esc(fmtDate(post.publishDate))}</span><span class="sep">·</span><span>${readingTime(post.content)} min read</span>${updated ? `<span class="sep">·</span><span class="updated-note">Updated ${esc(fmtDate(post.updatedAt))}</span>` : ""}
      </div>
      <h1>${esc(post.title)}</h1>
      ${post.subtitle ? `<p class="subtitle">${esc(post.subtitle)}</p>` : ""}
      ${tags.length ? `<div class="post-tags">${(post.tags || []).map((t, k) => `<a class="tag-pill" href="${root}#/writings?tag=${encodeURIComponent(t)}">${esc(tags[k])}</a>`).join("")}</div>` : ""}
    </div>
    ${coverSrc ? `<div class="wrap"><div class="post-cover" role="img" aria-label="${esc(post.coverAlt || post.title)}" style="background-image:url('${esc(coverSrc)}');background-size:cover;background-position:center;"></div></div>` : ""}
  </div>
  <div class="post-layout">
    <div class="ribbon-col" aria-hidden="true"></div>
    <div>
      <div class="article-body" id="article-body" style="font-size:${esc(post.fontSize || 19)}px;">${post.content || ""}</div>
      ${post.footer ? `<div class="post-footer">${post.footer}</div>` : ""}
      <div class="post-nav">
        ${prev ? `<a href="${root}posts/${prev.slug}/"><div class="dir">← Previous</div><div>${esc(prev.title)}</div></a>` : "<div></div>"}
        ${next ? `<a href="${root}posts/${next.slug}/" class="next"><div class="dir">Next →</div><div>${esc(next.title)}</div></a>` : "<div></div>"}
      </div>
      <p style="font-family:var(--sans);font-size:14px;"><a href="${root}posts/">← All writings</a></p>
    </div>
  </div>
</article>`;
  return pageShell({ title, description, canonical: url, root, ogType: "article", image, extraHead, body });
}

function archivePage(ctx) {
  const root = "../";
  const { catBySlug, ordered, defaultImage } = ctx;
  const items = ordered.map((p) => `
      <li class="archive-item" style="padding:22px 0;border-bottom:1px solid var(--line);">
        <div style="font-family:var(--sans);font-size:13px;color:var(--text-muted);">${esc(fmtDate(p.publishDate))} · ${esc((catBySlug[p.category] || { name: "Uncategorized" }).name)}</div>
        <h2 style="font-size:24px;margin:6px 0 8px;"><a href="${p.slug}/" style="text-decoration:none;">${esc(p.title)}</a></h2>
        <p style="margin:0;color:var(--text-muted);">${esc(p.excerpt || strip(p.content).slice(0, 200))}</p>
      </li>`).join("");
  const body = `<section class="section">
  <div class="wrap">
    <p class="eyebrow">Archive</p>
    <h1 style="margin-bottom:14px;">All writings</h1>
    <p class="lede" style="margin-bottom:30px;">${ordered.length} pieces, newest first. For categories, tags and search, <a href="${root}#/writings">open the full site</a>.</p>
    <ul style="max-width:68ch;">${items}
    </ul>
  </div>
</section>`;
  return pageShell({
    title: `All writings — ${SITE_NAME}`, description: DEFAULT_DESC, canonical: `${BASE}/posts/`,
    root, ogType: "website", image: defaultImage, body,
  });
}

/* ---------- 4/5. feed + sitemap ---------- */
function feedXml(ordered) {
  const items = ordered.slice(0, 30).map((p) => `
    <item>
      <title>${esc(p.title)}</title>
      <link>${BASE}/posts/${esc(p.slug)}/</link>
      <guid isPermaLink="false">${esc(p.id)}</guid>
      <pubDate>${new Date(p.publishDate).toUTCString()}</pubDate>
      <description>${esc(p.excerpt || strip(p.content).slice(0, 280))}</description>
    </item>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>${SITE_NAME}</title>
  <link>${BASE}/</link>
  <description>${DEFAULT_DESC}</description>
  <language>en</language>${items}
</channel></rss>
`;
}

function sitemapXml(ordered) {
  const day = (iso) => new Date(iso).toISOString().slice(0, 10);
  const latest = ordered.length ? day(ordered[0].updatedAt || ordered[0].publishDate) : null;
  const urls = [
    `  <url><loc>${BASE}/</loc>${latest ? `<lastmod>${latest}</lastmod>` : ""}</url>`,
    `  <url><loc>${BASE}/posts/</loc>${latest ? `<lastmod>${latest}</lastmod>` : ""}</url>`,
    ...ordered.map((p) => `  <url><loc>${BASE}/posts/${esc(p.slug)}/</loc><lastmod>${day(p.updatedAt || p.publishDate)}</lastmod></url>`),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`;
}

/* ---------- main ---------- */
(async function main() {
  const contentPath = path.join(ROOT, "content.json");
  const original = fs.readFileSync(contentPath, "utf8");
  const data = JSON.parse(original);

  const moved = await processImages(data);
  const serialized = JSON.stringify(data, null, 2);
  if (serialized !== original && serialized !== original.replace(/\n$/, "")) {
    fs.writeFileSync(contentPath, serialized);
    console.log(`content.json updated (${(original.length / 1024).toFixed(0)} KB -> ${(serialized.length / 1024).toFixed(0)} KB, ${moved} image(s) moved to files)`);
  }

  const now = Date.now();
  const ordered = (data.posts || [])
    .filter((p) => p.status === "published" && p.slug && Date.parse(p.publishDate) <= now)
    .sort((a, b) => Date.parse(b.publishDate) - Date.parse(a.publishDate));

  const settings = data.settings || {};
  const ctx = {
    ordered,
    catBySlug: Object.fromEntries((data.categories || []).map((c) => [c.slug, c])),
    tagBySlug: Object.fromEntries((data.tags || []).map((t) => [t.slug, t])),
    defaultImage: /^https:/i.test(settings.socialImageUrl || "") ? settings.socialImageUrl : `${BASE}/images/social-default.png`,
  };

  // posts/<slug>/index.html, and remove pages for posts that are no longer published
  const live = new Set(ordered.map((p) => p.slug));
  let wrote = 0;
  for (const p of ordered) if (write(`posts/${p.slug}/index.html`, postPage(p, ctx))) wrote++;
  const postsDir = path.join(ROOT, "posts");
  if (fs.existsSync(postsDir)) {
    for (const d of fs.readdirSync(postsDir, { withFileTypes: true })) {
      if (d.isDirectory() && !live.has(d.name)) fs.rmSync(path.join(postsDir, d.name), { recursive: true, force: true });
    }
  }
  if (write("posts/index.html", archivePage(ctx))) wrote++;
  if (write("feed.xml", feedXml(ordered))) wrote++;
  if (write("sitemap.xml", sitemapXml(ordered))) wrote++;
  console.log(`${ordered.length} published posts; ${wrote} generated file(s) changed; base ${BASE}`);
})().catch((e) => { console.error(e); process.exit(1); });
