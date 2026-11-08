# If No One Reads This

A small, quiet personal writing site — essays, letters, journal entries, poems and stories — hand-built with plain HTML, CSS and JavaScript. No framework, no database.

**Live site:** https://ixxvimmv.github.io/if-no-one-reads-this/

## What it does

- Reader-focused home page, writings list with search, categories and tags
- Light and dark mode, reading-progress ribbon, responsive on phones, tablets and desktops
- A private admin dashboard (`admin.html`) for writing, editing, scheduling and organizing posts
- A real, crawlable page for every writing at `posts/<slug>/`, each with its own title, description and link preview
- RSS feed (`feed.xml`) and `sitemap.xml`

## How it fits together

| File | Role |
| --- | --- |
| `index.html`, `styles.css`, `data.js` | The public site (a single page that switches views with `#/…` routes) |
| `admin.html` | The writing dashboard; saves in your browser and syncs to GitHub |
| `content.json` | All published writing, categories, tags and settings |
| `scripts/build-site.js` | Generates `posts/`, `images/`, `feed.xml` and `sitemap.xml` from `content.json` |
| `.github/workflows/build.yml` | Runs that script automatically whenever `content.json` changes |
| `api/`, `vercel.json` | Optional Vercel functions, not used on GitHub Pages |

## Publishing a writing

1. Write it in the admin dashboard and set its status to **Published**.
2. The dashboard pushes `content.json` to this repo (it needs a GitHub token saved in Settings, only in your browser).
3. GitHub Actions rebuilds the static pages. A new writing's own page and share link appear about a minute later.

Only **published** writing is ever sent to this public repo. Drafts and archived posts stay in the browser where you wrote them.

## Working on it locally

```
npm install
npm run build          # regenerate posts/, images/, feed.xml, sitemap.xml
python3 -m http.server # then open http://localhost:8000
```

Before the first deploy, set `SITE_URL` (or edit `DEFAULT_BASE` in `scripts/build-site.js`) if the site moves to a different address.

## Contact form

By default the form opens the visitor's email app with their message filled in. To receive messages directly instead, create a free form at [Formspree](https://formspree.io) and paste its URL into `CONTACT_FORM_ENDPOINT` near the top of the script in `index.html`.

## About

Written and built by hand — a quiet space where words are given room to breathe, whether they're read by many or simply written because they needed to exist.
