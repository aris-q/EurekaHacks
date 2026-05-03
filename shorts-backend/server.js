#!/usr/bin/env node
/**
 * Shorts Feed API server.
 * Serves /api/feed and /api/proxy endpoints backed by yt-dlp.
 * Static files are served by the Vite frontend (public/shorts/).
 *
 * Usage:  node shorts-backend/server.js
 */

const http    = require('http');
const os      = require('os');
const { spawn, execSync } = require('child_process');
const { URL } = require('url');

const PORT  = parseInt(process.env.PORT || '3000', 10);
const YTDLP = (() => {
  try { return execSync('which yt-dlp', { encoding: 'utf8' }).trim(); }
  catch { return 'yt-dlp'; }
})();

// ── yt-dlp runner ───────────────────────────────────────────────────────────
// Spawns yt-dlp, collects newline-delimited JSON, resolves with array of objects.

function ytdlp(args, timeoutMs = 40_000) {
  return new Promise((resolve, reject) => {
    const items = [];
    let buf = '';
    const proc = spawn(YTDLP, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    const timer = setTimeout(() => { proc.kill('SIGKILL'); reject(new Error('yt-dlp timeout')); }, timeoutMs);

    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', chunk => {
      buf += chunk;
      let nl;
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line) { try { items.push(JSON.parse(line)); } catch {} }
      }
    });

    proc.on('close', () => {
      clearTimeout(timer);
      if (buf.trim()) { try { items.push(JSON.parse(buf.trim())); } catch {} }
      resolve(items);
    });

    proc.on('error', err => { clearTimeout(timer); reject(err); });
  });
}

// ── Feed ────────────────────────────────────────────────────────────────────

// Rotation keywords appended to "location + activity terms" — kept short so the
// activity-specific extra query (beach, food tour, hiking, etc.) stays dominant
const SEARCH_KEYWORDS = [
  'things to do',
  'travel vlog',
  'hidden gems',
  'best spots',
  'must see',
  'local guide',
];

// YouTube's protobuf filter for Shorts-only search results
const SHORTS_SP = 'EgIYAQ%3D%3D';

// Minimum views to exclude low-quality / spam videos
const MIN_VIEWS = 100_000;

// Extract "City Country" from "City, Region, Country" autocomplete format for cleaner searches
function cleanLocationQuery(location) {
  const parts = location.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]} ${parts[parts.length - 1]}`;
  return parts[0] || location;
}

// Build terms used for post-fetch relevance filtering (all parts of the location)
function locationFilterTerms(location) {
  return location.toLowerCase().split(/[\s,]+/).filter(t => t.length > 2);
}

// Known places list — used to detect when a title is explicitly about a *different* location
const KNOWN_PLACES = [
  'japan','tokyo','osaka','kyoto','france','paris','italy','rome','milan','venice',
  'spain','madrid','barcelona','thailand','bangkok','phuket','indonesia','bali','jakarta',
  'vietnam','hanoi','india','mumbai','delhi','goa','china','beijing','shanghai',
  'korea','seoul','australia','sydney','melbourne','usa','america','new york','los angeles',
  'miami','hawaii','las vegas','uk','england','london','germany','berlin','munich',
  'netherlands','amsterdam','greece','athens','santorini','turkey','istanbul',
  'mexico','cancun','brazil','rio de janeiro','canada','toronto','vancouver',
  'singapore','malaysia','kuala lumpur','philippines','manila','cebu','palawan',
  'new zealand','auckland','queenstown','egypt','cairo','morocco','marrakech',
  'dubai','abu dhabi','uae','maldives','portugal','lisbon','porto','croatia','dubrovnik',
  'iceland','reykjavik','peru','lima','argentina','buenos aires','colombia','bogota',
  'switzerland','zurich','austria','vienna','czech republic','prague','hungary','budapest',
  'poland','warsaw','taiwan','taipei','hong kong','cambodia','siem reap',
  'nepal','kathmandu','kenya','nairobi','south africa','cape town','cuba','havana',
  'costa rica','jamaica','bahamas',
];

// Returns the most specific known-place name found in the title, or null
function extractDestKey(title) {
  const lower = title.toLowerCase();
  const matches = KNOWN_PLACES.filter(p => lower.includes(p));
  if (matches.length === 0) return null;
  return matches.sort((a, b) => b.length - a.length)[0];
}

// Returns true if the title explicitly names a known place that is NOT the requested location
function isDifferentKnownPlace(title, filterTerms) {
  const dest = extractDestKey(title);
  if (!dest) return false;
  return !filterTerms.some(t => dest.includes(t) || t.includes(dest));
}

// Reject a video if none of the location terms appear in its title
function isTitleRelevant(title, terms) {
  const lower = title.toLowerCase();
  return terms.some(t => lower.includes(t));
}

// Generic "top N places in the world" titles that don't belong to any specific location
const GENERIC_TITLE_RE = /places (on earth|in the world|around the world|you (must|need to|should) visit)|top \d+.*(places|destinations|spots|countries)|most (beautiful|amazing|incredible|stunning|underrated).*(places|destinations|countries|spots)|best (places|destinations|spots) (to visit|in the world|on earth)|\d+ (places|destinations|countries|cities) (that|you|to)/i;

const feedCache   = new Map(); // cacheKey → { items, ts }
const FEED_TTL_MS = 20 * 60 * 1000; // 20 min

// ── Stream URL resolver ──────────────────────────────────────────────────────
// Gets the direct CDN URL for a video (720p combined mp4 — no merge needed).
// The browser sets <video src="/api/proxy?v=ID">, we redirect to the CDN URL,
// and the browser streams directly at full CDN speed with no server buffering.

const streamCache   = new Map(); // videoId → { url, ts }
const streamPending = new Map(); // videoId → Promise<url>
const STREAM_TTL_MS = 90 * 60 * 1000; // YouTube CDN URLs last ~6 hr; refresh after 90 min

// Limit concurrent yt-dlp stream-resolve processes so they don't pile up and
// starve each other — 4 parallel is fast without overwhelming the machine.
const STREAM_CONCURRENCY = 4;
let   streamActive = 0;
const streamWaitQueue = []; // { videoId, resolve, reject, priority }

function drainStreamQueue() {
  while (streamWaitQueue.length > 0 && streamActive < STREAM_CONCURRENCY) {
    // Always pick the highest-priority item first (priority 1 = urgent/current video)
    streamWaitQueue.sort((a, b) => a.priority - b.priority);
    const { videoId, resolve, reject } = streamWaitQueue.shift();
    streamActive++;
    resolveStreamUrl(videoId)
      .then(resolve)
      .catch(reject)
      .finally(() => { streamActive--; drainStreamQueue(); });
  }
}

// Internal: actually runs yt-dlp to get the CDN URL
async function resolveStreamUrl(videoId) {
  const [info] = await ytdlp([
    `https://www.youtube.com/watch?v=${videoId}`,
    '--dump-json', '--no-warnings', '--quiet',
    '-f',
    'best[height<=720][ext=mp4][vcodec!=none][acodec!=none]' +      // 720p combined mp4 (fast, no merge)
    '/22' +                                                           // YouTube format code 22 = 720p mp4
    '/best[height<=480][ext=mp4][vcodec!=none][acodec!=none]' +     // 480p combined mp4
    '/18' +                                                          // 360p combined mp4
    '/best[ext=mp4][vcodec!=none][acodec!=none]' +                  // any combined mp4
    '/best[vcodec!=none][acodec!=none]' +                           // any combined stream
    '/best',
  ], 25_000);

  if (!info?.url) throw new Error('no url');
  streamCache.set(videoId, { url: info.url, ts: Date.now() });
  return info.url;
}

// priority 1 = urgent (current video being played / proxy redirect)
// priority 2 = background warmup
function getStreamUrl(videoId, priority = 2) {
  const hit = streamCache.get(videoId);
  if (hit && Date.now() - hit.ts < STREAM_TTL_MS) return Promise.resolve(hit.url);

  // If already pending but we now need it urgently, boost its priority in the wait queue
  if (streamPending.has(videoId)) {
    if (priority === 1) {
      const entry = streamWaitQueue.find(e => e.videoId === videoId);
      if (entry) entry.priority = 1;
    }
    return streamPending.get(videoId);
  }

  const promise = new Promise((resolve, reject) => {
    if (streamActive < STREAM_CONCURRENCY) {
      streamActive++;
      resolveStreamUrl(videoId)
        .then(resolve)
        .catch(reject)
        .finally(() => { streamActive--; drainStreamQueue(); });
    } else {
      streamWaitQueue.push({ videoId, resolve, reject, priority });
    }
  });

  streamPending.set(videoId, promise);
  promise.catch(() => {}).finally(() => streamPending.delete(videoId));
  return promise;
}

// ── Feed ─────────────────────────────────────────────────────────────────────

// Background prefetch queue: keeps the next 2 pages warm so the client never
// waits, but doesn't fetch pages far beyond what the user will reach soon.
const prefetchQueue = new Map(); // `${location}:${page}:${extra}` → Promise
const MAX_PREFETCH_PAGES = 2;

function schedulePrefetch(location, fromPage, extra = '', pages = MAX_PREFETCH_PAGES) {
  const limit = Math.min(pages, MAX_PREFETCH_PAGES);
  for (let p = fromPage; p < fromPage + limit; p++) {
    const key = `${location}:${p}:${extra}`;
    if (!prefetchQueue.has(key)) {
      const promise = getFeed(p, location, extra).catch(() => {});
      prefetchQueue.set(key, promise);
      promise.finally(() => prefetchQueue.delete(key));
    }
  }
}

async function getFeed(page, location, extra = '') {
  const kwIndex   = page % SEARCH_KEYWORDS.length;
  const kwRound   = Math.floor(page / SEARCH_KEYWORDS.length);
  const kw        = SEARCH_KEYWORDS[kwIndex];
  const locQuery  = cleanLocationQuery(location);       // "Paris France" not "Paris, Île-de-France, France"
  const query     = [locQuery, extra, kw].filter(Boolean).join(' ');
  const start     = kwRound * 10 + 1;
  const end       = start + 29;  // fetch 30 candidates per page (was 20) for a bigger filtering pool
  const cacheKey  = `${query}:${start}`;
  const hit       = feedCache.get(cacheKey);
  if (hit && Date.now() - hit.ts < FEED_TTL_MS) return hit.items;

  console.log(`  fetching feed page ${page}: "${query}" items ${start}-${end}`);

  const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=${SHORTS_SP}`;

  const raw = await ytdlp([
    searchUrl,
    '--flat-playlist',
    '--dump-json',
    '--no-warnings',
    '--quiet',
    '--playlist-items', `${start}-${end}`,
  ], 45_000);

  const filterTerms = locationFilterTerms(location);

  // Keep videos that clear the 100k view floor and pass duration check.
  const pool = raw
    .filter(v => v.id && v.duration != null && v.duration > 1 && v.duration <= 90)
    .filter(v => v.view_count == null || v.view_count >= MIN_VIEWS);

  // Partition into confirmed (title matches location) and unconfirmed.
  // Videos whose title explicitly names a *different* known place are dropped entirely.
  // Generic "top N places" titles are also dropped.
  const confirmed   = pool.filter(v =>
    !GENERIC_TITLE_RE.test(v.title) &&
    !isDifferentKnownPlace(v.title, filterTerms) &&
    isTitleRelevant(v.title, filterTerms)
  );
  const unconfirmed = pool.filter(v =>
    !GENERIC_TITLE_RE.test(v.title) &&
    !isDifferentKnownPlace(v.title, filterTerms) &&
    !isTitleRelevant(v.title, filterTerms)
  );

  // Shuffle each bucket independently so order within a bucket is random
  for (const bucket of [confirmed, unconfirmed]) {
    for (let i = bucket.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bucket[i], bucket[j]] = [bucket[j], bucket[i]];
    }
  }

  // Return up to 12 confirmed videos only.
  // Unconfirmed (title doesn't mention the location but doesn't name a different place)
  // are only used as a last-resort pad when there are zero confirmed results — and
  // even then capped at 2 so the feed stays relevant.
  const TARGET = 12;
  let selected = confirmed.slice(0, TARGET);
  if (selected.length === 0) {
    selected = unconfirmed.slice(0, 2);
  }

  const items = selected.map(v => ({
    videoId:      v.id,
    title:        v.title || '',
    thumbnail:    `https://i.ytimg.com/vi/${v.id}/maxresdefault.jpg`,
    uploader:     v.uploader || v.channel || v.uploader_id || '',
    viewCount:    v.view_count ?? null,
    duration:     v.duration,
    locationConfirmed: isTitleRelevant(v.title, filterTerms),
  }));

  feedCache.set(cacheKey, { items, ts: Date.now() });
  console.log(`  ✓ page ${page} "${query}": ${items.length} shorts (confirmed ${confirmed.length}, unconfirmed ${unconfirmed.length}, raw ${raw.length})`);

  // Warm up CDN URLs for all returned videos in parallel — the concurrency limiter
  // in getStreamUrl ensures we don't spawn more than STREAM_CONCURRENCY yt-dlp
  // processes at once, so this is safe to fire all at once.
  Promise.allSettled(items.map(item => getStreamUrl(item.videoId)));

  // Proactively prefetch the next 2 pages in the background so they're cached
  // when the client eventually requests them — keeps the feed fast.
  setImmediate(() => schedulePrefetch(location, page + 1, extra));

  return items;
}

// ── HTTP ────────────────────────────────────────────────────────────────────

function jsonRes(res, body, status = 200) {
  res.writeHead(status, {
    'Content-Type':                'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control':               'no-store',
  });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p   = url.pathname;

  // ── /api/feed?page=N&location=... ─────────────────────────────────────
  if (p === '/api/feed') {
    const page     = Math.max(0, parseInt(url.searchParams.get('page') || '0', 10));
    const location = (url.searchParams.get('location') || '').trim().slice(0, 60);
    const extra    = (url.searchParams.get('extra') || '').trim().slice(0, 120);
    if (!location) { jsonRes(res, { items: [], error: 'location required' }, 400); return; }
    try {
      const items = await getFeed(page, location, extra);
      jsonRes(res, { items });
      // After responding, kick off background prefetch for the next pages
      // (getFeed already does this internally, but also do it here for page 0
      // so the very first request warms up pages 1-4 immediately)
      if (page === 0) setImmediate(() => schedulePrefetch(location, 1, extra));
    } catch (e) {
      console.error('[feed]', e.message);
      jsonRes(res, { items: [], error: e.message }, 502);
    }
    return;
  }

  // ── /api/stream-url?v=VIDEO_ID — return direct CDN URL as JSON ──────────
  if (p === '/api/stream-url') {
    const v = url.searchParams.get('v') ?? '';
    if (!/^[A-Za-z0-9_-]{5,15}$/.test(v)) { jsonRes(res, { error: 'bad id' }, 400); return; }
    try {
      const streamUrl = await getStreamUrl(v, 1); // priority 1 — client is waiting
      jsonRes(res, { url: streamUrl });
    } catch (e) {
      console.error('[stream-url]', v, e.message);
      jsonRes(res, { error: 'unavailable' }, 502);
    }
    return;
  }

  // ── /api/proxy?v=VIDEO_ID — resolve CDN URL and redirect ─────────────────
  if (p === '/api/proxy') {
    const v = url.searchParams.get('v') ?? '';
    if (!/^[A-Za-z0-9_-]{5,15}$/.test(v)) { res.writeHead(400); res.end('bad id'); return; }
    try {
      const cdnUrl = await getStreamUrl(v, 1); // priority 1 — browser is blocked on this
      res.writeHead(302, { 'Location': cdnUrl, 'Cache-Control': 'no-store' });
      res.end();
    } catch (e) {
      console.error('[proxy]', v, e.message);
      res.writeHead(502); res.end('unavailable');
    }
    return;
  }

  res.writeHead(404); res.end('Not found');
});

// ── Start ────────────────────────────────────────────────────────────────────

function lanIp() {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const i of ifaces) {
      if (i.family === 'IPv4' && !i.internal) return i.address;
    }
  }
  return null;
}

server.listen(PORT, '0.0.0.0', () => {
  const lan = lanIp();
  console.log(`\n  Shorts API`);
  console.log(`  Listening on \x1b[36mhttp://localhost:${PORT}\x1b[0m`);
  if (lan) console.log(`  LAN        \x1b[36mhttp://${lan}:${PORT}\x1b[0m`);
  console.log('');
});
