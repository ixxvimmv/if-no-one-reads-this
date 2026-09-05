/* =====================================================================
   IF NO ONE READS THIS — DATA LAYER
   ---------------------------------------------------------------------
   This is a front-end-only "CMS". There is no server and no database —
   everything is persisted in the browser via localStorage. It exists to
   demonstrate a complete content-management workflow (auth, CRUD,
   drafts, scheduling, media, categories, tags) entirely on the client,
   which is the honest constraint of a static portfolio deliverable.

   To turn this into a real product, this file is the seam: swap the
   body of every CMS.* function for a fetch() call to a real API and
   nothing in index.html or admin.html needs to change.

   ---------------------------------------------------------------------
   CROSS-DEVICE SYNC (GitHub as a lightweight shared "database")
   ---------------------------------------------------------------------
   Because there's still no real backend here, cross-device sync works by
   reading/writing a JSON file in a GitHub repo — the same repo this site
   is deployed from is the natural choice. Fill in GITHUB_SYNC below with
   a PUBLIC repo (public is required: anonymous visitors' browsers read
   this file directly, with no login and no secret involved) and commit
   it, and every device that loads the site will pull the latest content
   from that file on load, regardless of what's cached locally.

   Publishing (writing back to GitHub) requires a Personal Access Token,
   which is NEVER put here in the source code — it's entered once into
   the admin dashboard's Settings page and stays only in that browser's
   localStorage. This file only ever performs anonymous, secret-free
   reads on the public site; only the admin-side push function uses the
   token, and it never ships to visitors.
===================================================================== */
const GITHUB_SYNC = {
  owner: "",   // e.g. "yourusername" — your GitHub username or org
  repo: "",    // e.g. "if-no-one-reads-this" — must be a PUBLIC repo
  branch: "main",
  path: "content.json",
};
(function (global) {
  const LS = {
    posts: "inrt_posts",
    categories: "inrt_categories",
    tags: "inrt_tags",
    media: "inrt_media",
    auth: "inrt_auth_password",
    authUser: "inrt_auth_username",
    seeded: "inrt_seeded_v1",
    views: "inrt_views_log",
    settings: "inrt_settings",
    githubSync: "inrt_github_sync",
  };
  const MAX_VIEW_LOG = 5000;
  const SESSION_KEY = "inrt_admin_session";

  /* ---------------------------- utils ---------------------------- */
  function uid(prefix) {
    return (prefix || "id") + "_" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
  }
  function slugify(str) {
    return String(str)
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_]+/g, "-")
      .replace(/^-+|-+$/g, "") || "untitled";
  }
  function uniqueSlug(base, existingSlugs) {
    let slug = slugify(base);
    let i = 2;
    while (existingSlugs.includes(slug)) {
      slug = slugify(base) + "-" + i++;
    }
    return slug;
  }
  function stripHtml(html) {
    const div = document.createElement("div");
    div.innerHTML = html || "";
    return (div.textContent || div.innerText || "").replace(/\s+/g, " ").trim();
  }
  function wordCount(html) {
    const text = stripHtml(html);
    return text ? text.split(/\s+/).filter(Boolean).length : 0;
  }
  function readingTime(html) {
    const words = wordCount(html);
    return Math.max(1, Math.round(words / 200));
  }
  function excerptFrom(html, len) {
    const text = stripHtml(html);
    len = len || 160;
    if (text.length <= len) return text;
    return text.slice(0, len).replace(/\s+\S*$/, "") + "…";
  }
  function nowIso() {
    return new Date().toISOString();
  }
  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.error("Storage read failed for", key, e);
      return fallback;
    }
  }
  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error("Storage write failed for", key, e);
      return false;
    }
  }

  /* ------------------------- seed content ------------------------- */
  const DEFAULT_CATEGORIES = [
    { slug: "letters", name: "Letters", description: "Words addressed to someone — sent or not.", color: "#8B6F47" },
    { slug: "reflections", name: "Personal Reflections", description: "Slow thinking about ordinary things.", color: "#5C6B5D" },
    { slug: "journal", name: "Journal Entries", description: "Unfiltered, dated, and a little unfinished.", color: "#6b7a8f" },
    { slug: "poems", name: "Poems", description: "Short, compressed, and meant to be reread.", color: "#8f5c6b" },
    { slug: "stories", name: "Stories", description: "Fiction, mostly, but never entirely made up.", color: "#7a5c8f" },
    { slug: "notes", name: "Thoughts & Notes", description: "Fragments too small to be essays.", color: "#8f7a5c" },
  ];

  const DEFAULT_TAGS = [
    "growing up","family","letters","friendship","distance","milestones","adulthood","home",
    "grief","memory","insomnia","night","journal","weather","quiet","love","poems","endings",
    "fiction","short story","eccentricity","chance","creativity","perfectionism","notes","attention",
  ].map((name) => ({ slug: slugify(name), name }));

  function seedPost(p) {
    return Object.assign(
      {
        id: uid("post"),
        subtitle: "",
        coverImage: "",
        footer: "",
        status: "published",
        featured: false,
        seoTitle: "",
        metaDescription: "",
        createdAt: p.date + "T09:00:00.000Z",
        updatedAt: p.date + "T09:00:00.000Z",
      },
      p,
      {
        publishDate: p.date + "T09:00:00.000Z",
      }
    );
  }

  const DEFAULT_POSTS = [
    seedPost({
      slug: "letter-to-my-younger-self",
      title: "A Letter I Never Sent to My Younger Self",
      subtitle: "Written the week I turned the same age my mother was when she had me.",
      category: "letters",
      tags: ["growing-up", "family", "letters"],
      date: "2026-06-02",
      featured: true,
      excerpt: "You are going to spend a decade being afraid of a life that turns out to be perfectly survivable. I wish I could tell you that sooner.",
      content:
        "<p>You won't believe this, but you're going to be fine. Not in the loud, certain way people say it to make you stop crying — fine in the quieter way, the way a room is fine after you've lived in it long enough to stop noticing the crack in the ceiling.</p><p>I know you think the version of yourself you're supposed to become is already decided, waiting somewhere up ahead like a train you have to catch. It isn't. You will miss trains. You will miss the one you thought was the only one. And somehow you'll still arrive somewhere worth arriving at, just later, and by a route nobody would have recommended.</p><p>You are so afraid of being ordinary that you can't yet see how much tenderness is hiding inside an ordinary life. The dishes in the sink. The friend who calls on a Tuesday for no reason. These will matter more than the things you're currently losing sleep over — I promise you this the way you can only promise something after you've already lived past it.</p><p>There is a particular kind of loneliness you're carrying right now that feels like evidence of something being wrong with you. It isn't. It's just what it feels like to be a person who notices too much and says too little. That noticing, eventually, becomes the thing people love you for. Be patient with it.</p><p>You will hurt people without meaning to, and you will be hurt in ways you didn't see coming. Neither will be the end of the story you think it is. Both will be folded, eventually, into a life that has room for all of it — the mistakes, the almosts, the ones that got away and the one who didn't.</p><p>I'm not writing to warn you. I'm writing because I finally understand what my mother must have felt at my age, holding a version of me that hadn't happened yet, and I wanted, just once, to hold you the same way — without trying to fix you, just glad you're going to make it.</p>",
    }),
    seedPost({
      slug: "letter-to-the-friend-who-moved-away",
      title: "For the Friend Who Moved Away",
      category: "letters",
      tags: ["friendship", "distance", "letters"],
      date: "2026-03-14",
      excerpt: "We said we'd talk every week. We don't. I've made my peace with what that means and what it doesn't.",
      content:
        "<p>I keep drafting messages to you that never leave the notes app. Not because I don't mean them, but because I've started to distrust the version of a friendship that only exists in scheduled phone calls and birthday texts. I want to tell you something true instead of something tidy.</p><p>The truth is I miss you in ways that don't fit into a message. I miss the specific quality of laughing with you in a kitchen that wasn't either of ours. Distance doesn't erase that knowing, but it does let it go quiet, and the quiet unsettles me more than I expected.</p><p>I used to think that if a friendship required effort, something was wrong with it. Now I think that's backwards. The ones worth keeping require effort precisely because they're worth keeping — the way you water something you actually want to survive the winter.</p><p>So this isn't an apology for the weeks we don't talk. It's just a letter to say: you are still in the room with me, even from here. When something good happens, you're still the second person I think to tell.</p>",
    }),
    seedPost({
      slug: "turning-thirty-in-a-rented-apartment",
      title: "On Turning Thirty in a Rented Apartment",
      subtitle: "A reflection on the life I thought I'd have by now, and the one I actually have.",
      category: "reflections",
      tags: ["milestones", "adulthood", "home"],
      date: "2026-05-20",
      featured: true,
      excerpt: "I always pictured thirty as a finished room. Instead it's a room I'm still furnishing, in a building I don't own, and I'm learning to be glad about that.",
      content:
        "<p>There was a version of thirty I planned for without ever quite deciding to. A house, probably. Some kind of internal quiet that would arrive once enough of the right boxes had been checked.</p><p>Instead I turned thirty in a rented apartment with a landlord who takes four days to answer texts, surrounded by furniture I bought secondhand and love more than I expected to. Nothing about my life looks like the diagram I drew at twenty-two.</p><p>What's changed isn't my circumstances so much as my relationship to the diagram. I've started to notice how much of it was borrowed — from my parents' timeline, from what my friends were posting. None of it was actually mine.</p><p>I don't think I'll stay here forever, and I don't think that's the point. A life can be entirely real and entirely good without matching the picture you drew of it years before you knew what you'd actually need.</p>",
    }),
    seedPost({
      slug: "grandmothers-hands",
      title: "What My Grandmother's Hands Taught Me",
      category: "reflections",
      tags: ["family", "grief", "memory"],
      date: "2026-01-11",
      excerpt: "She never once told me she loved me in those words. She didn't have to. Her hands said it in a language I'm still learning to translate.",
      content:
        "<p>My grandmother's hands were always doing something — shelling peas, kneading dough, smoothing the same square of fabric over and over as if convincing it to lie flat.</p><p>She wasn't a woman who said much. Affection, in her house, was expressed through food that appeared before you'd admitted you were hungry. I used to wish she would just say the words. It took me a long time to understand that she was saying them constantly, in a dialect I hadn't yet learned to hear.</p><p>After she died, I found a drawer full of mended things, all stitched with the same patient, invisible thread. She had been repairing our lives quietly for decades.</p><p>I still don't say the words as often as I probably should. But I've stopped apologizing for that. Some love just isn't spoken. Some of it is stitched.</p>",
    }),
    seedPost({
      slug: "347am-still-awake",
      title: "3:47 AM, Still Awake",
      subtitle: "Journal — June",
      category: "journal",
      tags: ["insomnia", "night", "journal"],
      date: "2026-06-18",
      excerpt: "The apartment makes different sounds at this hour, like it's finally comfortable enough to be honest.",
      content:
        "<p>Can't sleep. Again. I've stopped fighting it around the third hour and started treating these nights as their own strange, private country.</p><p>The fridge hums louder at this hour, or maybe I just have nothing else competing for my attention. There's a specific kind of clarity that only shows up uninvited, past three in the morning.</p><p>I used to resent these nights. Now I mostly just take notes, the way you'd keep a field journal on a creature you don't fully understand but have stopped trying to get rid of.</p>",
    }),
    seedPost({
      slug: "morning-after-the-storm",
      title: "The Morning After the Storm",
      subtitle: "Journal — early June",
      category: "journal",
      tags: ["weather", "journal", "quiet"],
      date: "2026-06-05",
      excerpt: "Everything outside looks rearranged, like the night moved the furniture without asking.",
      content:
        "<p>Woke up to a strange, scrubbed quiet — the kind that only exists after a storm has finished arguing with itself.</p><p>I made coffee and stood at the window longer than the coffee justified, watching a neighbor sweep water off her porch with the calm of someone who has done this every summer for thirty years.</p><p>By nine the sun was out like nothing had happened. I'm trying to be more like the puddles today — reflecting what's here without holding on to what already passed.</p>",
    }),
    seedPost({
      slug: "small-weather",
      title: "Small Weather",
      category: "poems",
      tags: ["love", "weather", "poems"],
      date: "2026-04-09",
      featured: true,
      excerpt: "You are not a season. You are the five minutes before rain, when the whole sky changes its mind.",
      content:
        "<p>You are not a season,<br>you are the five minutes before rain,<br>the pressure drop before anyone<br>has said a single thing out loud.</p><p>I have learned to read you<br>the way farmers read a darkening field —<br>not with fear,<br>with attention.</p><p>Some days you are only<br>a change in the light,<br>and I love you like that too:<br>quietly, without an umbrella.</p><p>Not a season.<br>Not even a storm.<br>Just small weather,<br>moving through a life<br>that has learned, finally,<br>to leave the windows open.</p>",
    }),
    seedPost({
      slug: "instructions-for-leaving-a-room",
      title: "Instructions for Leaving a Room",
      category: "poems",
      tags: ["endings", "poems", "grief"],
      date: "2026-02-27",
      excerpt: "Turn off the light last, not first. Let your eyes adjust to what the dark actually looks like.",
      content:
        "<p>Turn off the light last, not first.<br>Let your eyes adjust<br>to what the dark actually looks like.</p><p>Do not look back from the doorway<br>expecting the room to look sorry.<br>Rooms don't apologize.</p><p>Close the door slowly.<br>Fast doors sound like anger.<br>Slow ones sound like something<br>that was, for a while,<br>actually loved.</p>",
    }),
    seedPost({
      slug: "woman-who-collected-doorbells",
      title: "The Woman Who Collected Doorbells",
      subtitle: "A short story.",
      category: "stories",
      tags: ["fiction", "short-story", "eccentricity"],
      date: "2026-05-02",
      featured: true,
      excerpt: "Mrs. Okafor had forty-one doorbells mounted on a board in her hallway, and every one of them still worked.",
      content:
        "<p>Mrs. Okafor had forty-one doorbells mounted on a board in her hallway, arranged not by size or color but by some private logic only she understood.</p><p>She'd started the collection the year her husband died, taking the bell from their own front door because she couldn't stand hearing it ring for anyone who wasn't him.</p><p>She told me once that she wasn't collecting doorbells at all. She was collecting the exact moment before someone opens a door not knowing who's on the other side.</p><p>She died two winters later. I bought the cracked plastic one. Sometimes, out of habit, I still press it on my way inside.</p>",
    }),
    seedPost({
      slug: "two-trains-one-platform",
      title: "Two Trains, One Platform",
      subtitle: "A short story.",
      category: "stories",
      tags: ["fiction", "chance", "short-story"],
      date: "2026-03-30",
      excerpt: "He'd taken the same platform for six years and never once considered that the wrong train might be the right decision.",
      content:
        "<p>The 6:42 and the 6:44 left from the same platform, three minutes and one entire life apart, and Dele had taken the 6:42 for six years without once glancing at the departure board.</p><p>On the day his phone died, he boarded what he assumed was the 6:42 and only realized, somewhere past the second stop, that the announcements were wrong.</p><p>He got off at a station he'd passed a thousand times without ever exiting, and found a small bakery near the entrance.</p><p>Nobody writes songs about the three minutes between two commuter trains. But Dele would tell you his whole life quietly rearranged itself in exactly that gap.</p>",
    }),
    seedPost({
      slug: "usefulness-of-unfinished-things",
      title: "On the Usefulness of Unfinished Things",
      category: "notes",
      tags: ["creativity", "perfectionism", "notes"],
      date: "2026-06-25",
      excerpt: "A half-finished painting still teaches you something a completed one can't: what you were thinking before you knew the ending.",
      content:
        "<p>I have a drawer of unfinished things — a half-knitted scarf, three chapters of a novel that stalled at the same sentence for two years.</p><p>For a long time I treated this drawer as evidence against me. Lately I've started to think of it differently: as a record of thinking in progress.</p><p>A finished piece hides its own uncertainty. An unfinished one is more honest. It shows you the fork in the road.</p>",
    }),
    seedPost({
      slug: "a-note-on-silence",
      title: "A Note on Silence",
      category: "notes",
      tags: ["quiet", "attention", "notes"],
      date: "2026-01-30",
      excerpt: "Not every silence is empty. Some of them are just full of things that don't need saying.",
      content:
        "<p>We talk about silence like it's a lack — dead air, an awkward pause. I've started to notice how much of that is inherited discomfort rather than actual truth.</p><p>The best conversations I've had recently include long stretches where nobody says anything. That kind of silence isn't empty. It's just full of something that doesn't need a voice.</p><p>Some of the best things I've ever shared with another person happened without either of us saying a word.</p>",
    }),
  ];

  /* --------------------------- seeding --------------------------- */
  function seedIfNeeded() {
    if (readJSON(LS.seeded, false)) return;
    writeJSON(LS.categories, DEFAULT_CATEGORIES);
    writeJSON(LS.tags, DEFAULT_TAGS);
    writeJSON(LS.posts, DEFAULT_POSTS);
    writeJSON(LS.media, []);
    localStorage.setItem(LS.authUser, "ixxvimmv");
    localStorage.setItem(LS.auth, "karyzza0126!");
    writeJSON(LS.seeded, true);
  }

  /* ----------------------------- CMS ------------------------------ */
  const CREDS_MIGRATION_KEY = "inrt_creds_migration_v2";
  function migrateCredentialsOnce() {
    if (readJSON(CREDS_MIGRATION_KEY, false)) return;
    localStorage.setItem(LS.authUser, "ixxvimmv");
    localStorage.setItem(LS.auth, "karyzza0126!");
    writeJSON(CREDS_MIGRATION_KEY, true);
  }

  const CMS = {
    /* ---- lifecycle ---- */
    init() {
      seedIfNeeded();
      migrateCredentialsOnce();
    },
    resetDemoData() {
      localStorage.removeItem(LS.seeded);
      seedIfNeeded();
    },

    /* ---- posts ---- */
    getAllPosts() {
      return readJSON(LS.posts, []);
    },
    getPublishedPosts() {
      const now = new Date();
      return this.getAllPosts().filter(
        (p) => p.status === "published" && new Date(p.publishDate) <= now
      );
    },
    getPostBySlug(slug) {
      return this.getAllPosts().find((p) => p.slug === slug) || null;
    },
    getPostById(id) {
      return this.getAllPosts().find((p) => p.id === id) || null;
    },
    savePost(post) {
      const posts = this.getAllPosts();
      const isNew = !post.id;
      const existingRecord = post.id ? posts.find((p) => p.id === post.id) : null;
      const existingSlugs = posts.filter((p) => p.id !== post.id).map((p) => p.slug);
      const record = Object.assign({}, post);
      record.id = record.id || uid("post");
      record.slug = record.slug ? uniqueSlug(record.slug, existingSlugs) : uniqueSlug(record.title || "untitled", existingSlugs);
      record.updatedAt = nowIso();
      record.createdAt = record.createdAt || nowIso();
      record.excerpt = record.excerpt || excerptFrom(record.content, 160);
      record.tags = record.tags || [];
      record.status = record.status || "draft";
      if (record.status === "published" && !record.publishDate) {
        record.publishDate = nowIso();
      }
      record.featured = !!record.featured;
      if (record.featured) {
        // Preserve existing order across ordinary edits; only assign a fresh
        // order the first time a post becomes featured — and put it FIRST
        // (latest), shifting every other featured post back by one.
        if (typeof record.featuredOrder !== "number") {
          if (existingRecord && typeof existingRecord.featuredOrder === "number") {
            record.featuredOrder = existingRecord.featuredOrder;
          } else {
            posts.forEach((p) => {
              if (p.featured && p.id !== record.id && typeof p.featuredOrder === "number") {
                p.featuredOrder += 1;
              }
            });
            record.featuredOrder = 0;
          }
        }
      } else {
        delete record.featuredOrder;
      }
      const idx = posts.findIndex((p) => p.id === record.id);
      if (idx > -1) posts[idx] = record;
      else posts.unshift(record);
      writeJSON(LS.posts, posts);
      return record;
    },
    getFeaturedPostsOrdered() {
      const featured = this.getPublishedPosts().filter((p) => p.featured);
      return featured
        .slice()
        .sort((a, b) => {
          const ao = typeof a.featuredOrder === "number" ? a.featuredOrder : 999999;
          const bo = typeof b.featuredOrder === "number" ? b.featuredOrder : 999999;
          if (ao !== bo) return ao - bo;
          return new Date(b.publishDate) - new Date(a.publishDate);
        });
    },
    reorderFeatured(orderedIds) {
      const posts = this.getAllPosts();
      orderedIds.forEach((id, i) => {
        const p = posts.find((x) => x.id === id);
        if (p) p.featuredOrder = i;
      });
      writeJSON(LS.posts, posts);
    },
    deletePost(id) {
      const posts = this.getAllPosts().filter((p) => p.id !== id);
      writeJSON(LS.posts, posts);
    },
    duplicatePost(id) {
      const original = this.getPostById(id);
      if (!original) return null;
      const copy = Object.assign({}, original, {
        id: uid("post"),
        title: original.title + " (copy)",
        status: "draft",
        featured: false,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
      delete copy.featuredOrder;
      const existingSlugs = this.getAllPosts().map((p) => p.slug);
      copy.slug = uniqueSlug(original.slug + "-copy", existingSlugs);
      const posts = this.getAllPosts();
      posts.unshift(copy);
      writeJSON(LS.posts, posts);
      return copy;
    },

    archivePost(id) {
      const posts = this.getAllPosts();
      const idx = posts.findIndex((p) => p.id === id);
      if (idx < 0) return null;
      if (posts[idx].status !== "archived") {
        posts[idx] = Object.assign({}, posts[idx], {
          previousStatus: posts[idx].status,
          status: "archived",
          updatedAt: nowIso(),
        });
        writeJSON(LS.posts, posts);
      }
      return posts[idx];
    },
    restorePost(id) {
      const posts = this.getAllPosts();
      const idx = posts.findIndex((p) => p.id === id);
      if (idx < 0) return null;
      const restored = Object.assign({}, posts[idx]);
      restored.status = restored.previousStatus || "draft";
      delete restored.previousStatus;
      restored.updatedAt = nowIso();
      posts[idx] = restored;
      writeJSON(LS.posts, posts);
      return restored;
    },

    /* ---- categories ---- */
    getCategories() {
      return readJSON(LS.categories, []);
    },
    getCategory(slug) {
      return this.getCategories().find((c) => c.slug === slug) || null;
    },
    saveCategory(cat) {
      const cats = this.getCategories();
      const isNew = !cat._originalSlug;
      const slug = cat.slug || slugify(cat.name);
      const record = { slug, name: cat.name, description: cat.description || "", color: cat.color || "#8B6F47" };
      const targetSlug = cat._originalSlug || slug;
      const idx = cats.findIndex((c) => c.slug === targetSlug);
      if (idx > -1) {
        // slug changed? cascade to posts
        if (targetSlug !== slug) {
          const posts = this.getAllPosts().map((p) =>
            p.category === targetSlug ? Object.assign({}, p, { category: slug }) : p
          );
          writeJSON(LS.posts, posts);
        }
        cats[idx] = record;
      } else {
        cats.push(record);
      }
      writeJSON(LS.categories, cats);
      return record;
    },
    deleteCategory(slug) {
      const inUse = this.getAllPosts().some((p) => p.category === slug);
      if (inUse) return { ok: false, reason: "Category has writings assigned to it. Reassign them first." };
      writeJSON(LS.categories, this.getCategories().filter((c) => c.slug !== slug));
      return { ok: true };
    },

    /* ---- tags ---- */
    getTags() {
      return readJSON(LS.tags, []);
    },
    getTag(slug) {
      return this.getTags().find((t) => t.slug === slug) || null;
    },
    saveTag(tag) {
      const tags = this.getTags();
      const slug = tag.slug || slugify(tag.name);
      const targetSlug = tag._originalSlug || slug;
      const record = { slug, name: tag.name };
      const idx = tags.findIndex((t) => t.slug === targetSlug);
      if (idx > -1) {
        if (targetSlug !== slug) {
          const posts = this.getAllPosts().map((p) =>
            Object.assign({}, p, { tags: (p.tags || []).map((t) => (t === targetSlug ? slug : t)) })
          );
          writeJSON(LS.posts, posts);
        }
        tags[idx] = record;
      } else {
        tags.push(record);
      }
      writeJSON(LS.tags, tags);
      return record;
    },
    deleteTag(slug) {
      writeJSON(LS.tags, this.getTags().filter((t) => t.slug !== slug));
      const posts = this.getAllPosts().map((p) =>
        Object.assign({}, p, { tags: (p.tags || []).filter((t) => t !== slug) })
      );
      writeJSON(LS.posts, posts);
    },

    /* ---- media ---- */
    getMedia() {
      return readJSON(LS.media, []);
    },
    saveMedia(item) {
      const media = this.getMedia();
      const record = { id: item.id || uid("media"), name: item.name, dataUrl: item.dataUrl, createdAt: item.createdAt || nowIso() };
      const idx = media.findIndex((m) => m.id === record.id);
      if (idx > -1) media[idx] = record;
      else media.unshift(record);
      writeJSON(LS.media, media);
      return record;
    },
    deleteMedia(id) {
      writeJSON(LS.media, this.getMedia().filter((m) => m.id !== id));
    },

    /* ---- auth ---- */
    login(username, password) {
      const realUser = localStorage.getItem(LS.authUser) || "ixxvimmv";
      const realPass = localStorage.getItem(LS.auth) || "karyzza0126!";
      if (username === realUser && password === realPass) {
        sessionStorage.setItem(SESSION_KEY, "1");
        return true;
      }
      return false;
    },
    logout() {
      sessionStorage.removeItem(SESSION_KEY);
    },
    isAuthed() {
      return sessionStorage.getItem(SESSION_KEY) === "1";
    },
    getUsername() {
      return localStorage.getItem(LS.authUser) || "ixxvimmv";
    },
    changeUsername(newUser) {
      localStorage.setItem(LS.authUser, newUser);
    },
    changePassword(newPass) {
      localStorage.setItem(LS.auth, newPass);
    },
    /* Persistent (not session-based) flag set the first time you log in
       successfully on a given browser. Lets the public site show the
       admin icon only on your own device, without requiring you to be
       actively logged in at that moment. Not real security — just a
       convenience so the icon isn't visible to random visitors. */
    markKnownDevice() {
      localStorage.setItem("inrt_known_admin_device", "1");
    },
    isKnownAdminDevice() {
      return localStorage.getItem("inrt_known_admin_device") === "1";
    },
    forgetDevice() {
      localStorage.removeItem("inrt_known_admin_device");
    },

    /* ---- analytics / page views ----
       Honest limitation: there is no server here, so this only records
       views that happen in *this* browser (e.g. yours, while testing,
       or a visitor's own browser if you deploy this statically without
       a backend). It cannot see who visited from other devices. It's a
       real, working view counter — just a client-side one. */
    recordView(slug, meta) {
      const log = readJSON(LS.views, []);
      log.push({
        id: uid("view"),
        slug: slug,
        ts: nowIso(),
        ref: (meta && meta.ref) || (document.referrer ? new URL(document.referrer).hostname : "Direct"),
        device: (meta && meta.device) || (/Mobi|Android/i.test(navigator.userAgent) ? "Mobile" : "Desktop"),
      });
      if (log.length > MAX_VIEW_LOG) log.splice(0, log.length - MAX_VIEW_LOG);
      writeJSON(LS.views, log);
    },
    getViewsLog() {
      return readJSON(LS.views, []);
    },
    getViewsForPost(slug) {
      return this.getViewsLog().filter((v) => v.slug === slug).length;
    },
    getTotalViews() {
      return this.getViewsLog().length;
    },
    getTopPosts(limit) {
      const counts = {};
      this.getViewsLog().forEach((v) => (counts[v.slug] = (counts[v.slug] || 0) + 1));
      const posts = this.getAllPosts();
      return Object.keys(counts)
        .map((slug) => ({ post: posts.find((p) => p.slug === slug), slug, views: counts[slug] }))
        .filter((x) => x.post)
        .sort((a, b) => b.views - a.views)
        .slice(0, limit || 5);
    },
    getRecentViews(limit) {
      return [...this.getViewsLog()].reverse().slice(0, limit || 20);
    },
    getViewsByDay(days) {
      const n = days || 14;
      const buckets = [];
      const now = new Date();
      for (let i = n - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        buckets.push({ date: d.toISOString().slice(0, 10), count: 0 });
      }
      const map = {};
      buckets.forEach((b) => (map[b.date] = b));
      this.getViewsLog().forEach((v) => {
        const day = v.ts.slice(0, 10);
        if (map[day]) map[day].count++;
      });
      return buckets;
    },
    getReferrerBreakdown() {
      const counts = {};
      this.getViewsLog().forEach((v) => (counts[v.ref] = (counts[v.ref] || 0) + 1));
      return Object.entries(counts).map(([ref, count]) => ({ ref, count })).sort((a, b) => b.count - a.count);
    },
    clearViews() {
      writeJSON(LS.views, []);
    },

    /* ---- site settings (e.g. About page photo) ---- */
    getSettings() {
      const defaults = {
        aboutPhoto: "",
        aboutEyebrow: "About the writer",
        aboutHeading: "I write things down so I don't have to carry them alone.",
        aboutLede: "If No One Reads This started as a private folder of unfinished drafts and slowly, almost against my will, became a public one.",
        aboutContent:
          "<p>I've kept some form of journal since I was thirteen, mostly out of necessity rather than discipline — I've always needed to write things down before I fully understood how I felt about them.</p><p>The name comes from the only way I've ever been able to write anything honest: by half-convincing myself no one would actually read it. If No One Reads This is what happened when I got tired of being the only reader of things I suspected other people might need too.</p><blockquote>I'm not trying to have the last word on anything. I'm just trying to say the true thing before I forget what it felt like.</blockquote><p>What you'll find here is a mix: letters, personal reflections, journal entries kept mostly intact, a handful of poems, and short stories that are fiction in name only.</p><p>I don't publish on a schedule. I publish when something has finished the slow work of becoming a sentence instead of just a feeling. If you're here, I'm glad. There's no rush to any of this.</p>",
        aboutValues: [
          { title: "Slowness on purpose", description: "Nothing here is written to a content calendar. A piece is published when it's ready, not before." },
          { title: "Honesty over polish", description: "I'd rather a sentence be true and a little rough than smooth and slightly false." },
          { title: "Room for you in it", description: "The most personal writing is often the most shareable. I try to leave space for your own story inside mine." },
        ],
      };
      return Object.assign({}, defaults, readJSON(LS.settings, {}));
    },
    saveSettings(partial) {
      const current = this.getSettings();
      const updated = Object.assign({}, current, partial);
      writeJSON(LS.settings, updated);
      return updated;
    },

    /* ---- backup / restore ----
       Since content lives in this browser's localStorage, it's scoped to
       whatever domain you're viewing the site from. Editing on a GitHub-hosted
       preview and a Vercel deployment are two different origins with two
       separate storage boxes — nothing syncs between them automatically.
       Export on one, import on the other, to move content across. */
    exportAll() {
      return {
        exportedAt: nowIso(),
        version: 1,
        posts: this.getAllPosts(),
        categories: this.getCategories(),
        tags: this.getTags(),
        media: this.getMedia(),
        settings: this.getSettings(),
      };
    },
    importAll(data) {
      if (!data || typeof data !== "object") {
        return { ok: false, reason: "That file doesn't look like a valid backup." };
      }
      try {
        if (Array.isArray(data.posts)) writeJSON(LS.posts, data.posts);
        if (Array.isArray(data.categories)) writeJSON(LS.categories, data.categories);
        if (Array.isArray(data.tags)) writeJSON(LS.tags, data.tags);
        if (Array.isArray(data.media)) writeJSON(LS.media, data.media);
        if (data.settings && typeof data.settings === "object") writeJSON(LS.settings, data.settings);
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: "Import failed: " + e.message };
      }
    },

    /* ---- cross-device sync (GitHub) ----
       See the big comment at the top of this file for the full picture.
       getSyncTarget() reads the non-secret owner/repo/branch/path baked
       into the deployed code. getSyncConfig()/saveSyncConfig() manage the
       secret token, which lives ONLY in this browser's localStorage and
       is used solely by pushToGitHub() (admin-side). pullFromGitHubPublic()
       never sends or needs a token — it's a plain anonymous GET, safe to
       run on the public site for any visitor. */
    getSyncTarget() {
      return GITHUB_SYNC;
    },
    isSyncTargetConfigured() {
      return !!(GITHUB_SYNC.owner && GITHUB_SYNC.repo);
    },
    getSyncConfig() {
      return readJSON(LS.githubSync, { token: "", lastPush: "", lastPull: "" });
    },
    saveSyncConfig(partial) {
      const current = this.getSyncConfig();
      const updated = Object.assign({}, current, partial);
      writeJSON(LS.githubSync, updated);
      return updated;
    },
    getSyncPayload() {
      return {
        exportedAt: nowIso(),
        posts: this.getAllPosts(),
        categories: this.getCategories(),
        tags: this.getTags(),
        settings: this.getSettings(),
      };
    },
    async pullFromGitHubPublic() {
      if (!this.isSyncTargetConfigured()) return { ok: false, reason: "not-configured" };
      const cfg = GITHUB_SYNC;
      const url = `https://raw.githubusercontent.com/${cfg.owner}/${cfg.repo}/${cfg.branch}/${cfg.path}?t=${Date.now()}`;
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) {
          return { ok: false, reason: `No published content found yet (status ${res.status}).` };
        }
        const data = await res.json();
        let changed = false;
        const currentPosts = JSON.stringify(this.getAllPosts());
        if (Array.isArray(data.posts)) {
          writeJSON(LS.posts, data.posts);
          if (JSON.stringify(data.posts) !== currentPosts) changed = true;
        }
        if (Array.isArray(data.categories)) writeJSON(LS.categories, data.categories);
        if (Array.isArray(data.tags)) writeJSON(LS.tags, data.tags);
        if (data.settings && typeof data.settings === "object") writeJSON(LS.settings, data.settings);
        writeJSON(LS.seeded, true); // never let the local demo-seed overwrite real pulled content
        this.saveSyncConfig({ lastPull: nowIso() });
        return { ok: true, changed };
      } catch (e) {
        return { ok: false, reason: "Network error while pulling: " + e.message };
      }
    },
    async _fetchCurrentSha(apiUrl, cfg, headers) {
      const getRes = await fetch(`${apiUrl}?ref=${cfg.branch}&_=${Date.now()}`, { headers, cache: "no-store" });
      if (getRes.ok) {
        const info = await getRes.json();
        return info.sha;
      }
      if (getRes.status === 404) return undefined; // file doesn't exist yet — fine, we'll create it
      const err = await getRes.json().catch(() => ({}));
      throw new Error(err.message || `GitHub API error ${getRes.status} while checking the file.`);
    },
    async _pushToGitHubOnce() {
      const cfg = GITHUB_SYNC;
      const { token } = this.getSyncConfig();
      const apiUrl = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURIComponent(cfg.path)}`;
      const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" };
      const payload = this.getSyncPayload();
      const jsonStr = JSON.stringify(payload, null, 2);
      const contentB64 = btoa(unescape(encodeURIComponent(jsonStr)));

      const MAX_ATTEMPTS = 3;
      let lastMessage = "";
      let attemptsMade = 0;
      let wasConflict = false;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        attemptsMade = attempt;
        let sha;
        try {
          sha = await this._fetchCurrentSha(apiUrl, cfg, headers);
        } catch (e) {
          lastMessage = e.message;
          wasConflict = false;
          break; // fetching the sha itself failed (not a conflict) — no point retrying
        }
        const body = { message: "Update writings from admin dashboard", content: contentB64, branch: cfg.branch };
        if (sha) body.sha = sha;

        let putRes;
        try {
          putRes = await fetch(apiUrl, {
            method: "PUT",
            headers: Object.assign({ "Content-Type": "application/json" }, headers),
            body: JSON.stringify(body),
          });
        } catch (e) {
          return { ok: false, reason: "Network error while pushing: " + e.message };
        }
        if (putRes.ok) {
          this.saveSyncConfig({ lastPush: nowIso() });
          return { ok: true, attempts: attempt };
        }
        const err = await putRes.json().catch(() => ({}));
        const message = err.message || `GitHub API error ${putRes.status}.`;
        const isShaConflict = putRes.status === 409 || putRes.status === 422 || /does not match|sha/i.test(message);
        lastMessage = message;
        wasConflict = isShaConflict;
        if (!isShaConflict) break; // a real error, not a race — no point retrying
        if (attempt < MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, 350 * attempt)); // brief backoff before re-checking sha
        }
      }
      const suffix = wasConflict ? ` (retried ${attemptsMade} times, still conflicting)` : "";
      return { ok: false, reason: lastMessage + suffix };
    },
    async pushToGitHub() {
      if (!this.isSyncTargetConfigured()) {
        return { ok: false, reason: "GitHub sync target isn't set yet — fill in GITHUB_SYNC in data.js and redeploy." };
      }
      const { token } = this.getSyncConfig();
      if (!token) {
        return { ok: false, reason: "Enter a GitHub personal access token in Settings first." };
      }
      // Serialize pushes: if one is already in flight, queue this call to run
      // right after it (using the latest local content at that time) instead of
      // firing a second overlapping GET+PUT that would race the first.
      if (this._pushChain) {
        this._pushChain = this._pushChain.then(() => this._pushToGitHubOnce());
      } else {
        this._pushChain = this._pushToGitHubOnce();
      }
      const result = await this._pushChain;
      return result;
    },

    /* ---- helpers exposed for views ---- */
    slugify,
    stripHtml,
    wordCount,
    readingTime,
    excerptFrom,
    uid,
    nowIso,
  };

  global.CMS = CMS;
})(window);
