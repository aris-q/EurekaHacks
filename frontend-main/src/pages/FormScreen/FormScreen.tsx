import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ActivityTag } from "../../utils/types";
import { Sym, M3Button, M3IconBtn, M3FAB, M3Chip, M3TextField, M3Segmented, StepBar } from "../../components/M3";
import {
  requestYouTubeToken,
  fetchLikedVideos,
  fetchFavoriteVideos,
  fetchUserPlaylists,
} from "../../utils/youtube";

const ALL_TAGS = Object.values(ActivityTag);
const SEASONS = ["Spring", "Summer", "Fall", "Winter"] as const;
type Season = (typeof SEASONS)[number];

const SEASON_ICONS: Record<Season, string> = {
  Spring: "local_florist",
  Summer: "wb_sunny",
  Fall: "eco",
  Winter: "ac_unit",
};

const TAG_ICONS: Partial<Record<ActivityTag, string>> = {
  [ActivityTag.Sightseeing]: "tour",
  [ActivityTag.Hiking]: "hiking",
  [ActivityTag.Dining]: "restaurant",
  [ActivityTag.Adventure]: "paragliding",
  [ActivityTag.Relaxation]: "self_improvement",
  [ActivityTag.Nightlife]: "nightlife",
  [ActivityTag.CulturalExperience]: "temple_buddhist",
  [ActivityTag.Camping]: "forest",
  [ActivityTag.Photography]: "photo_camera",
  [ActivityTag.Entertainment]: "theater_comedy",
  [ActivityTag.FamilyFun]: "family_restroom",
  [ActivityTag.ThemePark]: "attractions",
};

type ShortVideo = {
  videoId: string;
  title: string;
  thumbnail: string;
  uploader: string;
  viewCount: number | null;
  locationConfirmed?: boolean;
};

async function fetchShorts(location: string, page = 0, extra = ""): Promise<ShortVideo[]> {
  const params = new URLSearchParams({ page: String(page), location });
  if (extra) params.set("extra", extra);
  const res = await fetch(`/api/feed?${params}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.items ?? [];
}



const TAG_KEYWORDS: Partial<Record<ActivityTag, string[]>> = {
  [ActivityTag.Sightseeing]: ["sightseeing", "landmark", "monument", "attractions", "tourist", "explore", "exploring", "tour", "tours", "viewpoint", "views", "scenery", "sights", "visit", "visiting", "must see", "guide"],
  [ActivityTag.Hiking]: ["hike", "hiking", "trail", "trek", "trekking", "mountain", "mountains", "nature", "waterfall", "summit", "climb", "climbing", "walk", "walking", "forest", "wilderness"],
  [ActivityTag.Dining]: ["food", "restaurant", "eat", "eating", "cuisine", "dining", "dish", "dishes", "meal", "street food", "street", "taste", "tasting", "snack", "cafe", "coffee", "ramen", "sushi", "bbq", "market"],
  [ActivityTag.Adventure]: ["adventure", "extreme", "thrill", "adrenaline", "outdoor", "sport", "sports", "surf", "surfing", "dive", "diving", "bungee", "zipline", "kayak", "rafting", "sailing"],
  [ActivityTag.Relaxation]: ["relax", "relaxing", "relaxation", "peaceful", "calm", "tranquil", "retreat", "spa", "beach", "sunset", "sunrise", "resort", "island", "chill", "chilling", "hammock"],
  [ActivityTag.Nightlife]: ["nightlife", "bar", "bars", "club", "clubs", "night", "party", "parties", "rooftop", "cocktail", "pub", "disco", "drinks"],
  [ActivityTag.CulturalExperience]: ["culture", "cultural", "tradition", "traditional", "local", "temple", "heritage", "history", "historical", "museum", "festival", "ceremony", "shrine", "mosque", "ancient", "geisha", "kimono"],
  [ActivityTag.Camping]: ["camp", "camping", "outdoors", "wilderness", "tent", "glamping", "bonfire", "stargazing", "national park"],
  [ActivityTag.Photography]: ["photography", "photo", "instagram", "instagrammable", "scenic", "viewpoint", "aesthetic", "hidden gem", "gems", "spots", "photo spots", "sunrise", "sunset"],
  [ActivityTag.Entertainment]: ["entertainment", "show", "concert", "performance", "theater", "shopping", "mall", "arcade", "experience"],
  [ActivityTag.FamilyFun]: ["family", "kids", "children", "playground", "zoo", "aquarium", "friendly", "family-friendly"],
  [ActivityTag.ThemePark]: ["theme park", "amusement", "rides", "disney", "universal", "roller coaster"],
};

function spreadSimilar(videos: ShortVideo[]): ShortVideo[] {
  if (videos.length <= 2) return videos;
  const stop = new Set(["a","an","the","in","at","of","to","and","for","with","my","your","this","is","on","from"]);
  const kw = (title: string) => new Set(title.toLowerCase().split(/\W+/).filter((w) => w.length > 3 && !stop.has(w)));
  const overlaps = (a: ShortVideo, b: ShortVideo) => { const ka = kw(a.title); for (const w of kw(b.title)) if (ka.has(w)) return true; return false; };
  const result = [...videos];
  for (let i = 0; i < result.length - 1; i++) {
    if (overlaps(result[i], result[i + 1])) {
      for (let j = i + 2; j < result.length; j++) {
        if (!overlaps(result[i], result[j])) { [result[i + 1], result[j]] = [result[j], result[i + 1]]; break; }
      }
    }
  }
  return result;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const KW_STOP = new Set(["a","an","the","in","at","of","to","and","for","with","my","your","this","is","on","from","that","its","are","but","not","have","been","will","what","how","when","where","about","more","some","than","they","them","their","top","new","old","get","got","big","one","two","ten","all","via","now","out","can","let","had","may","yet","ago","far","few","him","his","her","off","per","put","run","set","too","yes","did","day","way","use","try","see","our","who","why","best","must","visit","you","place","awesome","cool","nice"]);
function extractKeywords(title: string): string[] {
  return title.toLowerCase().split(/\W+/).filter((w) => w.length > 2 && !KW_STOP.has(w));
}

function inferTags(title: string): ActivityTag[] {
  const lower = title.toLowerCase();
  return ALL_TAGS.filter((tag) => TAG_KEYWORDS[tag]?.some((kw) => lower.includes(kw)));
}

const TAG_SEARCH_TERMS: Partial<Record<ActivityTag, string>> = {
  [ActivityTag.Sightseeing]: "sightseeing",
  [ActivityTag.Hiking]: "hiking", [ActivityTag.Dining]: "food tour",
  [ActivityTag.Adventure]: "adventure", [ActivityTag.Relaxation]: "relaxation",
  [ActivityTag.Nightlife]: "nightlife",
  [ActivityTag.CulturalExperience]: "cultural experience",
  [ActivityTag.Camping]: "camping",
  [ActivityTag.Photography]: "photography spots",
  [ActivityTag.Entertainment]: "entertainment",
  [ActivityTag.FamilyFun]: "family friendly", [ActivityTag.ThemePark]: "theme park",
};

const KNOWN_PLACES = [
  "japan","tokyo","osaka","kyoto","france","paris","italy","rome","milan","venice",
  "spain","madrid","barcelona","thailand","bangkok","phuket","indonesia","bali","jakarta",
  "vietnam","hanoi","india","mumbai","delhi","goa","china","beijing","shanghai",
  "korea","seoul","australia","sydney","melbourne","usa","america","new york","los angeles",
  "miami","hawaii","las vegas","uk","england","london","germany","berlin","munich",
  "netherlands","amsterdam","greece","athens","santorini","turkey","istanbul",
  "mexico","cancun","brazil","rio de janeiro","canada","toronto","vancouver",
  "singapore","malaysia","kuala lumpur","philippines","manila","cebu","palawan",
  "new zealand","auckland","queenstown","egypt","cairo","morocco","marrakech",
  "dubai","abu dhabi","uae","maldives","portugal","lisbon","porto","croatia","dubrovnik",
  "iceland","reykjavik","peru","lima","argentina","buenos aires","colombia","bogota",
  "switzerland","zurich","austria","vienna","czech republic","prague","hungary","budapest",
  "poland","warsaw","taiwan","taipei","hong kong","cambodia","siem reap",
  "nepal","kathmandu","kenya","nairobi","south africa","cape town","cuba","havana",
  "costa rica","jamaica","bahamas",
];

function parseLocationTerms(location: string): string[] {
  return location.toLowerCase().split(/[\s,]+/).filter((t) => t.length > 2);
}

function isLocationMatch(title: string, locationTerms: string[]): boolean {
  const lower = title.toLowerCase();
  if (locationTerms.some((t) => lower.includes(t))) return true;
  for (const place of KNOWN_PLACES) {
    if (lower.includes(place) && !locationTerms.some((t) => place.includes(t) || t.includes(place))) return false;
  }
  return true;
}

// ── Trip Details ──────────────────────────────────────────────────────────────
type TripData = { location: string; days: number; season: Season; tags: ActivityTag[]; comments: string };

type LocationSuggestion = { name: string; country: string; admin1?: string };

function TripDetailsStep({ onNext, onBack }: { onNext: (data: TripData) => void; onBack: () => void }) {
  const [location, setLocation] = useState("");
  const [days, setDays] = useState(5);
  const [season, setSeason] = useState<Season>("Spring");
  const [tags, setTags] = useState<ActivityTag[]>([]);
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggleTag = (tag: ActivityTag) =>
    setTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]);

  const handleLocationChange = (value: string) => {
    setLocation(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.length < 2) { setSuggestions([]); setShowSuggestions(false); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(value)}&count=6&language=en&format=json`);
        const data = await res.json();
        const results: LocationSuggestion[] = (data.results ?? []).map((r: { name: string; country: string; admin1?: string }) => ({ name: r.name, country: r.country, admin1: r.admin1 }));
        setSuggestions(results);
        setShowSuggestions(results.length > 0);
      } catch { /* ignore */ }
    }, 300);
  };

  const selectSuggestion = (s: LocationSuggestion) => {
    const label = s.admin1 ? `${s.name}, ${s.admin1}, ${s.country}` : `${s.name}, ${s.country}`;
    setLocation(label);
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const handleNext = () => {
    if (!location.trim() || tags.length === 0) {
      setError("Please enter a destination and select at least one activity vibe.");
      return;
    }
    setError("");
    onNext({ location, days, season, tags, comments: "" });
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* App bar */}
      <div className="m3-appbar">
        <M3IconBtn icon="arrow_back" onClick={onBack} />
        <div className="title">Plan a trip</div>
        <div style={{ padding: "0 16px" }}><StepBar step={0} /></div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", padding: "8px 24px 120px", display: "flex", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: 720, display: "flex", flexDirection: "column", gap: 28 }}>
          <div>
            <h1 className="display-font" style={{ fontSize: 36, fontWeight: 500, margin: 0, letterSpacing: "-0.01em" }}>Where to?</h1>
            <p style={{ color: "var(--m3-on-surface-variant)", marginTop: 8, fontSize: 15 }}>
              Tell us a bit about the trip and we'll find shorts to inspire it.
            </p>
          </div>

          {/* Destination with autocomplete */}
          <div style={{ position: "relative" }}>
            <M3TextField
              label="Destination"
              leadingIcon="location_on"
              value={location}
              onChange={(e) => handleLocationChange((e.target as HTMLInputElement).value)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
            />
            {showSuggestions && (
              <div style={{
                position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 100,
                background: "var(--m3-surface-container)", borderRadius: 12,
                boxShadow: "0 4px 16px var(--m3-shadow)", overflow: "hidden",
              }}>
                {suggestions.map((s, i) => {
                  const label = s.admin1 ? `${s.name}, ${s.admin1}, ${s.country}` : `${s.name}, ${s.country}`;
                  return (
                    <div
                      key={i}
                      onMouseDown={() => selectSuggestion(s)}
                      style={{
                        padding: "12px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12,
                        borderBottom: i < suggestions.length - 1 ? "1px solid var(--m3-outline-variant)" : "none",
                        fontSize: 14,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--m3-surface-container-high)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <Sym name="location_on" size={18} style={{ color: "var(--m3-on-surface-variant)", flexShrink: 0 }} />
                      {label}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Days */}
          <div>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: "var(--m3-on-surface-variant)" }}>Trip length</div>
              <div className="display-font" style={{ fontSize: 28, fontWeight: 500 }}>
                {days} <span style={{ fontSize: 14, color: "var(--m3-on-surface-variant)", fontWeight: 400 }}>day{days !== 1 ? "s" : ""}</span>
              </div>
            </div>
            <input type="range" min="1" max="14" value={days} onChange={(e) => setDays(+e.target.value)} />
          </div>

          {/* Season */}
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--m3-on-surface-variant)", marginBottom: 10 }}>Season</div>
            <M3Segmented
              value={season}
              onChange={(v) => setSeason(v as Season)}
              options={SEASONS.map((s) => ({ value: s, label: s, icon: SEASON_ICONS[s] }))}
              style={{ flexWrap: "wrap" }}
            />
          </div>

          {/* Vibes */}
          <div>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: "var(--m3-on-surface-variant)" }}>What's your vibe?</div>
              <div style={{ fontSize: 12, color: "var(--m3-on-surface-variant)" }}>{tags.length} selected</div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {ALL_TAGS.map((tag) => (
                <M3Chip
                  key={tag}
                  icon={TAG_ICONS[tag]}
                  selected={tags.includes(tag)}
                  onClick={() => toggleTag(tag)}
                >
                  {tag}
                </M3Chip>
              ))}
            </div>
          </div>

          {error && (
            <p style={{ color: "var(--m3-error)", fontSize: 14, margin: 0 }}>{error}</p>
          )}
        </div>
      </div>

      {/* Bottom action bar */}
      <div
        style={{
          position: "sticky", bottom: 0, padding: 16,
          background: "linear-gradient(to top, var(--m3-surface) 60%, transparent)",
          display: "flex", justifyContent: "flex-end", gap: 12,
          borderTop: "1px solid var(--m3-outline-variant)",
        }}
      >
        <M3Button variant="text" onClick={onBack}>Cancel</M3Button>
        <M3Button icon="swipe" onClick={handleNext}>Next: Swipe videos</M3Button>
      </div>
    </div>
  );
}

// ── Swipe step ────────────────────────────────────────────────────────────────
function SwipeStep({
  tripData,
  onDone,
  onBack,
}: {
  tripData: TripData;
  onDone: (liked: string[]) => void;
  onBack: () => void;
}) {
  const { location, tags: initialTags, season } = tripData;
  const [queue, setQueue] = useState<ShortVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [index, setIndex] = useState(0);
  const [liked, setLiked] = useState<string[]>([]);
  const [animDir, setAnimDir] = useState<"left" | "right" | null>(null);
  const animTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoRefs = useRef<Map<string, HTMLVideoElement | null>>(new Map());

  const weights = useRef<Record<string, number>>(
    Object.fromEntries(ALL_TAGS.map((tag) => [tag, initialTags.includes(tag) ? 1.0 : 0.3])),
  );
  const likedKeywords = useRef<Map<string, number>>(new Map());
  const dislikedKeywords = useRef<Map<string, number>>(new Map());
  const [topKeywords, setTopKeywords] = useState<{ liked: string[]; disliked: string[] }>({ liked: [], disliked: [] });
  const pageRef = useRef(Math.floor(Math.random() * 6));
  const tagCycleRef = useRef(0);
  const fetching = useRef(false);
  const seenIds = useRef(new Set<string>());
  const streamUrlCache = useRef(new Map<string, string>());

  const prefetchStreamUrl = (videoId: string) => {
    if (streamUrlCache.current.has(videoId)) return;
    fetch(`/api/stream-url?v=${videoId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.url) return;
        streamUrlCache.current.set(videoId, data.url);
        // If this video's element is already loaded via proxy, no need to swap.
        // But if it hasn't started loading yet (no src), set the direct URL now.
        const el = videoRefs.current.get(videoId);
        if (el && !el.src) {
          el.src = data.url;
          el.load();
        }
      })
      .catch(() => {});
  };

  const getNextExtra = () => {
    const seasonTerm = season.toLowerCase();

    // 40% of the time, use a liked keyword directly — location is sent separately so omit it here
    const topLiked = [...likedKeywords.current.entries()].filter(([, c]) => c >= 1).sort((a, b) => b[1] - a[1]);
    if (topLiked.length > 0 && Math.random() < 0.4) {
      const pool = topLiked.slice(0, 3);
      const total = pool.reduce((s, [, c]) => s + c, 0);
      let rand = Math.random() * total;
      let kw = pool[0][0];
      for (const [w, c] of pool) { rand -= c; if (rand <= 0) { kw = w; break; } }
      return [seasonTerm, kw].filter(Boolean).join(" ");
    }

    // Round-robin through all selected vibe tags so every tag gets equal search coverage
    const tag = initialTags[tagCycleRef.current % initialTags.length];
    tagCycleRef.current++;
    const activity = TAG_SEARCH_TERMS[tag] ?? tag.toLowerCase();
    return [seasonTerm, activity].filter(Boolean).join(" ");
  };

  const locationTerms = parseLocationTerms(location);
  const GENERIC_TITLE = /places (on earth|in the world|around the world|you (must|need to|should) visit)|top \d+.*(places|destinations|spots|countries)|most (beautiful|amazing|incredible|stunning|underrated).*(places|destinations|countries|spots)|best (places|destinations|spots) (to visit|in the world|on earth)|\d+ (places|destinations|countries|cities) (that|you|to)/i;

  // Filter out generic titles entirely, and hard-remove any video whose title
  // mentions a known place that is NOT the user's destination.
  const filterRelevant = (items: ShortVideo[]): ShortVideo[] => {
    return items.filter((v) => {
      if (GENERIC_TITLE.test(v.title)) return false;
      // If the title explicitly names a different known place, drop it entirely
      const dest = extractDestKey(v.title);
      if (dest && !locationTerms.some((t) => dest.includes(t) || t.includes(dest))) return false;
      return true;
    });
  };

  const scoreVideo = (video: ShortVideo): number => {
    let score = 0;
    for (const w of extractKeywords(video.title)) {
      score += (likedKeywords.current.get(w) ?? 0) * 1.0;
      score -= (dislikedKeywords.current.get(w) ?? 0) * 1.5;
    }
    return score;
  };

  const filterAndRank = (videos: ShortVideo[]): ShortVideo[] =>
    videos.filter((v) => scoreVideo(v) > -2).sort((a, b) => scoreVideo(b) - scoreVideo(a));

  const fetchMore = async () => {
    if (fetching.current) return;
    fetching.current = true;
    setLoadingMore(true);
    try {
      // 3 sequential rounds with a yield between each so the video proxy can
      // get requests through (Flask dev server is single-threaded)
      for (let round = 0; round < 3; round++) {
        const extra = getNextExtra();
        try {
          const items = await fetchShorts(location, pageRef.current++, extra);
          const fresh = spreadSimilar(filterAndRank(shuffle(filterRelevant(items.filter((v) => !seenIds.current.has(v.videoId))))));
          fresh.forEach((v) => seenIds.current.add(v.videoId));
          if (fresh.length > 0) setQueue((prev) => [...prev, ...fresh]);
        } catch { break; }
        if (round < 2) await new Promise<void>((r) => setTimeout(r, 400));
      }
    } finally { fetching.current = false; setLoadingMore(false); }
  };

  useEffect(() => {
    let active = true;
    const startPage = pageRef.current;
    // Location is sent as its own param — extra is activity/season terms only
    const firstExtra = [
      season.toLowerCase(),
      ...initialTags.slice(0, 2).map((t) => TAG_SEARCH_TERMS[t] ?? t.toLowerCase()),
    ].join(" ");

    (async () => {
      try {
        const items = await fetchShorts(location, startPage, firstExtra);
        if (!active) return;
        pageRef.current = startPage + 1;
        const fresh = spreadSimilar(filterAndRank(shuffle(filterRelevant(
          items.filter((v) => !seenIds.current.has(v.videoId))
        ))));
        fresh.forEach((v) => seenIds.current.add(v.videoId));
        if (fresh.length === 0) { setError("No videos found for this location."); return; }
        setQueue(fresh);
      } catch {
        if (active) setError("Couldn't load shorts — is the shorts backend running?");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  // When a fetch ends with 0 fresh results and we're out of cards, retry immediately
  useEffect(() => {
    if (!loading && !loadingMore && !error && queue.length > 0 && index >= queue.length) {
      fetchMore();
    }
  }, [loadingMore]);

  useEffect(() => {
    if (queue.length === 0) return;

    // Only prefetch stream URLs for current + up to 20 ahead — no point resolving
    // CDN URLs for videos the user is unlikely to reach soon.
    const PREFETCH_AHEAD = 20;
    for (let ahead = 0; ahead <= PREFETCH_AHEAD; ahead++) {
      const v = queue[index + ahead];
      if (v) prefetchStreamUrl(v.videoId);
    }
    // Pre-load the next 5 video elements so the browser buffers them.
    for (let ahead = 1; ahead <= 5; ahead++) {
      const v = queue[index + ahead];
      if (v) {
        const el = videoRefs.current.get(v.videoId);
        if (el && !el.src) {
          const cached = streamUrlCache.current.get(v.videoId);
          el.src = cached ?? `/api/proxy?v=${v.videoId}`;
          el.load();
        }
      }
    }
    const curr = queue[index];
    const currentEl = curr ? videoRefs.current.get(curr.videoId) : null;
    if (currentEl) {
      const playEl = (el: HTMLVideoElement) => {
        const doPlay = () => el.play().catch(() => {});
        if (el.readyState >= 3) {
          doPlay();
        } else {
          el.addEventListener('canplay', doPlay, { once: true });
        }
      };

      if (!currentEl.src) {
        // Fetch the direct CDN URL first — faster than going through the proxy
        // redirect since the browser doesn't have to follow a 302.
        fetch(`/api/stream-url?v=${curr.videoId}`)
          .then((r) => r.ok ? r.json() : null)
          .then((data) => {
            const url = data?.url ?? `/api/proxy?v=${curr.videoId}`;
            if (!currentEl.src) {
              // Still not set (user hasn't swiped away) — set and play
              streamUrlCache.current.set(curr.videoId, url);
              currentEl.src = url;
              currentEl.load();
              playEl(currentEl);
            }
          })
          .catch(() => {
            // Fallback to proxy if stream-url fails
            if (!currentEl.src) {
              currentEl.src = `/api/proxy?v=${curr.videoId}`;
              currentEl.load();
              playEl(currentEl);
            }
          });
      } else {
        playEl(currentEl);
      }
    }
    const prevV = index > 0 ? queue[index - 1] : null;
    if (prevV) videoRefs.current.get(prevV.videoId)?.pause();
    if (queue.length - index <= 20) fetchMore();
  }, [index, queue]);

  const updateWeights = (video: ShortVideo, dir: "left" | "right") => {
    inferTags(video.title).forEach((tag) => {
      const w = weights.current[tag] ?? 0.3;
      const isDifferent = !initialTags.includes(tag);
      weights.current[tag] = dir === "right" ? Math.min(2.0, w + 0.3) : Math.max(0.0, w - (isDifferent ? 0.5 : 0.3));
    });
    extractKeywords(video.title).forEach((word) => {
      const map = dir === "right" ? likedKeywords.current : dislikedKeywords.current;
      map.set(word, (map.get(word) ?? 0) + 1);
    });
  };

  const refreshTopKeywords = () => {
    const topLiked = [...likedKeywords.current.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([w]) => w);
    const topDisliked = [...dislikedKeywords.current.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([w]) => w);
    setTopKeywords({ liked: topLiked, disliked: topDisliked });
  };

  const swipe = (dir: "left" | "right") => {
    if (animTimeout.current || loading || queue.length === 0 || index >= queue.length) return;
    const current = queue[index];
    updateWeights(current, dir);
    refreshTopKeywords();
    // Re-sort pending videos with the updated keyword scores so the best match is always next
    setQueue((prev) => [
      ...prev.slice(0, index + 1),
      ...[...prev.slice(index + 1)].sort((a, b) => scoreVideo(b) - scoreVideo(a)),
    ]);
    setAnimDir(dir);
    animTimeout.current = setTimeout(() => {
      const newLiked = dir === "right" ? [...liked, current.videoId] : liked;
      if (dir === "right") setLiked(newLiked);
      setAnimDir(null);
      animTimeout.current = null;
      setIndex((i) => i + 1);
    }, 350);
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") swipe("right");
      else if (e.key === "ArrowLeft") swipe("left");
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const current = queue[index];
  const remaining = Math.max(0, queue.length - index);

  const cardAnim: React.CSSProperties = {
    transition: "transform 0.35s var(--m3-easing-emph), opacity 0.35s var(--m3-easing-emph)",
    transform: animDir === "right" ? "translateX(120%) rotate(14deg)" : animDir === "left" ? "translateX(-120%) rotate(-14deg)" : "none",
    opacity: animDir ? 0 : 1,
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* App bar */}
      <div className="m3-appbar">
        <M3IconBtn icon="arrow_back" onClick={onBack} />
        <div className="title">Swipe to inspire</div>
        <div style={{ padding: "0 16px" }}><StepBar step={1} /></div>
      </div>

      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(280px, 360px)",
          gap: 32,
          padding: "12px 32px 24px",
          alignItems: "center",
          maxWidth: 1100,
          width: "100%",
          margin: "0 auto",
          overflow: "hidden",
        }}
      >
        {/* Video card deck */}
        <div style={{ position: "relative", maxWidth: 380, justifySelf: "center", width: "100%", aspectRatio: "9/16" }}>
          {/* Shadow card */}
          {current && index + 1 < queue.length && (
            <div
              className="short-card"
              style={{ position: "absolute", inset: 0, transform: "translate(8px, 12px) rotate(2deg) scale(0.96)", opacity: 0.6, background: "var(--m3-surface-container-high)" }}
            />
          )}

          {/* Main card */}
          <div style={{ position: "absolute", inset: 0, ...cardAnim, boxShadow: "0 24px 60px var(--m3-shadow)", borderRadius: "var(--m3-corner-xl)", overflow: "hidden" }}>
            {/* Videos */}
            <div style={{ position: "relative", width: "100%", height: "100%", background: "var(--m3-surface-container-highest)" }}>
              {loading ? (
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
                  <div className="m3-blob" style={{ width: 80, height: 80, animation: "m3-blob1 4s ease-in-out infinite" }} />
                  <span style={{ color: "var(--m3-on-surface-variant)", fontSize: 14 }}>Loading shorts…</span>
                </div>
              ) : error ? (
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem", textAlign: "center", color: "var(--m3-on-surface-variant)", fontSize: 14 }}>
                  {error}
                </div>
              ) : index >= queue.length ? (
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
                  <div className="m3-blob" style={{ width: 80, height: 80, animation: "m3-blob1 4s ease-in-out infinite" }} />
                  <span style={{ color: "var(--m3-on-surface-variant)", fontSize: 14 }}>Finding more videos…</span>
                </div>
              ) : (
                queue.map((v, i) => (
                  <video
                    key={v.videoId}
                    ref={(el) => { videoRefs.current.set(v.videoId, el); }}
                    loop muted playsInline preload="auto"
                    style={{
                      position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover",
                      // visibility:hidden (not display:none) lets the browser buffer the video content.
                      // Only suppress rendering entirely for videos we won't need soon.
                      ...(i === index
                        ? { zIndex: 1 }
                        : (i > index && i <= index + 5)
                        ? { visibility: "hidden" as const, zIndex: 0 }
                        : { display: "none" as const }),
                    }}
                  />
                ))
              )}
            </div>

            {/* Swipe stamps */}
            {current && (
              <>
                <div style={{ position: "absolute", top: 80, left: 24, padding: "8px 16px", borderRadius: 10, border: "4px solid #34d399", color: "#34d399", fontWeight: 700, fontSize: 22, transform: "rotate(-12deg)", opacity: animDir === "right" ? 1 : 0, transition: "opacity .15s", zIndex: 3 }}>LIKED</div>
                <div style={{ position: "absolute", top: 80, right: 24, padding: "8px 16px", borderRadius: 10, border: "4px solid #f87171", color: "#f87171", fontWeight: 700, fontSize: 22, transform: "rotate(12deg)", opacity: animDir === "left" ? 1 : 0, transition: "opacity .15s", zIndex: 3 }}>SKIP</div>
              </>
            )}

            {/* Location warning — top of card when video may not match destination */}
            {current && !loading && !error && (() => {
              const lower = current.title.toLowerCase();
              if (locationTerms.some((t) => lower.includes(t))) return null;
              const dest = extractDestKey(current.title);
              const isDifferentPlace = dest && !locationTerms.some((t) => dest.includes(t) || t.includes(dest));
              const msg = isDifferentPlace ? `May be about ${toTitleCase(dest!)}` : "Location not confirmed";
              return (
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, padding: "14px 14px 40px", background: "linear-gradient(to bottom, rgba(0,0,0,.65), transparent)", zIndex: 2 }}>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 99, background: "rgba(251,191,36,.18)", border: "1px solid rgba(251,191,36,.45)", color: "#fbbf24" }}>
                    <Sym name="warning" size={13} style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{msg}</span>
                  </div>
                </div>
              );
            })()}

            {/* Video info overlay */}
            {current && !loading && !error && (
              <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "64px 14px 14px", background: "linear-gradient(to top, rgba(0,0,0,.88) 0%, rgba(0,0,0,.4) 55%, transparent 100%)", color: "white", zIndex: 2 }}>
                {/* Country / place chip + uploader */}
                {(() => {
                  const dest = extractDestKey(current.title);
                  return (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                      {dest && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, padding: "2px 8px", borderRadius: 99, background: "rgba(163,230,53,.2)", border: "1px solid rgba(163,230,53,.45)", color: "#a3e635", fontWeight: 600 }}>
                          <Sym name="location_on" size={12} style={{ flexShrink: 0 }} />
                          {toTitleCase(dest)}
                        </span>
                      )}
                      <span style={{ fontSize: 11, opacity: 0.65 }}>{current.uploader}</span>
                    </div>
                  );
                })()}
                {/* Title */}
                <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.35, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, marginBottom: 7 }}>
                  {current.title}
                </div>
                {/* Activity tags — green when weight is high (liked vibe), red when weight is low (disliked) */}
                {inferTags(current.title).length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {inferTags(current.title).map((tag) => {
                      const w = weights.current[tag] ?? 0.3;
                      const isLiked = w > 0.7;
                      const isDisliked = w < 0.15;
                      return (
                        <span key={tag} style={{
                          fontSize: 11, padding: "2px 8px", borderRadius: 99, fontWeight: 500,
                          background: isLiked ? "rgba(52,211,153,.28)" : isDisliked ? "rgba(248,113,113,.28)" : "rgba(255,255,255,.12)",
                          color: isLiked ? "#6ee7b7" : isDisliked ? "#fca5a5" : "rgba(255,255,255,.75)",
                          border: `1px solid ${isLiked ? "rgba(52,211,153,.45)" : isDisliked ? "rgba(248,113,113,.45)" : "rgba(255,255,255,.18)"}`,
                        }}>{tag}</span>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Controls panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Trip context */}
          <div className="m3-card filled" style={{ padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <Sym name="location_on" size={20} fill={1} style={{ color: "var(--m3-primary)" }} />
              <div style={{ fontSize: 16, fontWeight: 500 }}>{location}</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ background: "var(--m3-surface-container-low)", borderRadius: 12, padding: "10px 12px" }}>
                <div style={{ fontSize: 11, color: "var(--m3-on-surface-variant)", textTransform: "uppercase", letterSpacing: ".06em" }}>Liked</div>
                <div className="display-font" style={{ fontSize: 24, fontWeight: 500, color: "var(--m3-primary)" }}>{liked.length}</div>
              </div>
              <div style={{ background: "var(--m3-surface-container-low)", borderRadius: 12, padding: "10px 12px" }}>
                <div style={{ fontSize: 11, color: "var(--m3-on-surface-variant)", textTransform: "uppercase", letterSpacing: ".06em" }}>Remaining</div>
                <div className="display-font" style={{ fontSize: 24, fontWeight: 500 }}>{loading || loadingMore ? "…" : remaining}</div>
              </div>
            </div>
          </div>

          {/* Search tags */}
          <div style={{ background: "var(--m3-surface-container)", borderRadius: 16, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
            {/* Constant vibe tags — always pinned to every query */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "var(--m3-on-surface-variant)", textTransform: "uppercase", letterSpacing: ".06em", flexShrink: 0 }}>Always searching</span>
              {initialTags.map((tag) => (
                <span key={tag} style={{ fontSize: 12, padding: "2px 10px", borderRadius: 99, background: "rgba(52,211,153,.25)", color: "#34d399", fontWeight: 600, border: "1px solid rgba(52,211,153,.45)" }}>
                  {TAG_SEARCH_TERMS[tag] ?? tag.toLowerCase()}
                </span>
              ))}
            </div>
            {/* Dynamically learned liked keywords */}
            {topKeywords.liked.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "var(--m3-on-surface-variant)", textTransform: "uppercase", letterSpacing: ".06em", flexShrink: 0 }}>Showing more</span>
                {topKeywords.liked.map((w) => (
                  <span key={w} style={{ fontSize: 12, padding: "2px 10px", borderRadius: 99, background: "rgba(52,211,153,.18)", color: "#34d399", fontWeight: 500 }}>{w}</span>
                ))}
              </div>
            )}
            {topKeywords.disliked.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "var(--m3-on-surface-variant)", textTransform: "uppercase", letterSpacing: ".06em", flexShrink: 0 }}>Filtering out</span>
                {topKeywords.disliked.map((w) => (
                  <span key={w} style={{ fontSize: 12, padding: "2px 10px", borderRadius: 99, background: "rgba(248,113,113,.18)", color: "#f87171", fontWeight: 500 }}>{w}</span>
                ))}
              </div>
            )}
          </div>

          {/* FAB controls */}
          <div style={{ display: "flex", gap: 14, alignItems: "center", justifyContent: "center" }}>
            <M3FAB icon="close" onClick={() => swipe("left")} disabled={loading || !!error} />
            <M3FAB icon="favorite" variant="primary" size="large" onClick={() => swipe("right")} disabled={loading || !!error} />
            <M3FAB icon="bookmark" onClick={() => swipe("right")} disabled={loading || !!error} />
          </div>
          <div style={{ textAlign: "center", fontSize: 12, color: "var(--m3-on-surface-variant)" }}>
            Skip · Love it · Save for later
          </div>

          {/* Keyboard hint + done */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 4px" }}>
            <div style={{ fontSize: 12, color: "var(--m3-on-surface-variant)" }}>
              <kbd style={{ padding: "2px 6px", background: "var(--m3-surface-container-high)", borderRadius: 4, fontFamily: "monospace" }}>←</kbd> skip &nbsp;
              <kbd style={{ padding: "2px 6px", background: "var(--m3-surface-container-high)", borderRadius: 4, fontFamily: "monospace" }}>→</kbd> love
            </div>
            <M3Button variant="text" onClick={() => onDone(liked)} disabled={liked.length === 0}>
              I'm done →
            </M3Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── YouTube step ──────────────────────────────────────────────────────────────
// Extract the most specific known-place match from a video title
function extractDestKey(title: string): string | null {
  const lower = title.toLowerCase();
  const matches = KNOWN_PLACES.filter((p) => lower.includes(p));
  if (matches.length === 0) return null;
  return matches.sort((a, b) => b.length - a.length)[0];
}

function toTitleCase(str: string) {
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

type DestGroup = { key: string; name: string; videos: import("../../utils/youtube").VideoItem[] };

function groupByDest(allVideos: import("../../utils/youtube").VideoItem[]): {
  groups: DestGroup[];
  ungrouped: import("../../utils/youtube").VideoItem[];
} {
  const map = new Map<string, import("../../utils/youtube").VideoItem[]>();
  for (const v of allVideos) {
    const key = extractDestKey(v.title);
    if (key) {
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(v);
    }
  }
  const groups: DestGroup[] = Array.from(map.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .map(([key, videos]) => ({ key, name: toTitleCase(key), videos }));
  const groupedIds = new Set(groups.flatMap((g) => g.videos.map((v) => v.id)));
  const ungrouped = allVideos.filter((v) => !groupedIds.has(v.id));
  return { groups, ungrouped };
}

type YTDoneParams = { ids: string[]; titles: string[]; location: string; days: number };
type YTPhase = "idle" | "connecting" | "fetching" | "pick-dest" | "pick-days" | "error";

function YouTubeStep({
  onDone,
  onBack,
  generating = false,
}: {
  onDone: (params: YTDoneParams) => void;
  onBack: () => void;
  generating?: boolean;
}) {
  const [phase, setPhase] = useState<YTPhase>("idle");
  const [destGroups, setDestGroups] = useState<DestGroup[]>([]);
  const [ungrouped, setUngrouped] = useState<import("../../utils/youtube").VideoItem[]>([]);
  const [selected, setSelected] = useState<DestGroup | null>(null);
  const [days, setDays] = useState(5);
  const [errorMsg, setErrorMsg] = useState("");

  const handleConnect = async () => {
    setPhase("connecting");
    setErrorMsg("");
    try {
      const token = await requestYouTubeToken();
      setPhase("fetching");
      const [liked, favorites, playlists] = await Promise.all([
        fetchLikedVideos(token),
        fetchFavoriteVideos(token),
        fetchUserPlaylists(token),
      ]);
      // Flatten + deduplicate across all sources
      const seen = new Set<string>();
      const all = [...liked, ...favorites, ...playlists.flatMap((p) => p.videos)]
        .filter((v) => { if (seen.has(v.id)) return false; seen.add(v.id); return true; });
      const { groups, ungrouped: ung } = groupByDest(all);
      setDestGroups(groups);
      setUngrouped(ung);
      setPhase("pick-dest");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Something went wrong.");
      setPhase("error");
    }
  };

  // ── Phase: pick days ──────────────────────────────────────────────────────
  if (phase === "pick-days" && selected) {
    return (
      <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
        <div className="m3-appbar">
          <M3IconBtn icon="arrow_back" onClick={() => setPhase("pick-dest")} />
          <div className="title">{selected.name}</div>
          <div style={{ padding: "0 16px" }}><StepBar step={1} /></div>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "8px 24px 120px", display: "flex", justifyContent: "center" }}>
          <div style={{ width: "100%", maxWidth: 720, display: "flex", flexDirection: "column", gap: 28 }}>
            <div>
              <h1 className="display-font" style={{ fontSize: 36, fontWeight: 500, margin: 0, letterSpacing: "-0.01em" }}>
                How long?
              </h1>
              <p style={{ color: "var(--m3-on-surface-variant)", marginTop: 8, fontSize: 15 }}>
                We'll draw from {selected.videos.length} saved video{selected.videos.length !== 1 ? "s" : ""} about {selected.name}.
              </p>
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: "var(--m3-on-surface-variant)" }}>Trip length</div>
                <div className="display-font" style={{ fontSize: 28, fontWeight: 500 }}>
                  {days} <span style={{ fontSize: 14, color: "var(--m3-on-surface-variant)", fontWeight: 400 }}>day{days !== 1 ? "s" : ""}</span>
                </div>
              </div>
              <input type="range" min="1" max="14" value={days} onChange={(e) => setDays(+e.target.value)} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--m3-on-surface-variant)", marginBottom: 10 }}>
                Videos we'll draw from
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {selected.videos.slice(0, 10).map((v, i) => (
                  <div key={v.id} style={{ display: "flex", gap: 8, alignItems: "baseline", padding: "4px 0", borderBottom: "1px solid var(--m3-outline-variant)" }}>
                    <span style={{ fontSize: 12, color: "var(--m3-on-surface-variant)", minWidth: 20, flexShrink: 0 }}>{i + 1}.</span>
                    <span style={{ fontSize: 13, flex: 1 }}>{v.title}</span>
                    <span style={{ fontSize: 12, color: "var(--m3-on-surface-variant)", flexShrink: 0 }}>{v.channel}</span>
                  </div>
                ))}
                {selected.videos.length > 10 && (
                  <div style={{ fontSize: 12, color: "var(--m3-on-surface-variant)", padding: "6px 0" }}>
                    +{selected.videos.length - 10} more
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        <div style={{ position: "sticky", bottom: 0, padding: 16, background: "linear-gradient(to top, var(--m3-surface) 60%, transparent)", display: "flex", justifyContent: "flex-end", gap: 12, borderTop: "1px solid var(--m3-outline-variant)" }}>
          <M3Button variant="text" onClick={() => setPhase("pick-dest")}>Back</M3Button>
          <M3Button
            icon="auto_awesome"
            disabled={generating}
            onClick={() => onDone({ ids: selected.videos.map((v) => v.id), titles: selected.videos.map((v) => v.title), location: selected.name, days })}
          >
            {generating ? "Generating…" : `Build ${days}-day itinerary`}
          </M3Button>
        </div>
      </div>
    );
  }

  // ── Phase: idle / connecting / fetching / pick-dest / error ───────────────
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div className="m3-appbar">
        <M3IconBtn icon="arrow_back" onClick={onBack} />
        <div className="title">Import from YouTube</div>
        <div style={{ padding: "0 16px" }}><StepBar step={1} /></div>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "8px 24px 32px", display: "flex", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: 720, display: "flex", flexDirection: "column", gap: 24 }}>
          <div>
            <h1 className="display-font" style={{ fontSize: 36, fontWeight: 500, margin: 0, letterSpacing: "-0.01em" }}>
              {phase === "pick-dest" ? "Where do you want to go?" : "Connect YouTube"}
            </h1>
            <p style={{ color: "var(--m3-on-surface-variant)", marginTop: 8, fontSize: 15 }}>
              {phase === "pick-dest"
                ? `Found ${destGroups.length} destination${destGroups.length !== 1 ? "s" : ""} in your library — pick one to plan.`
                : "We'll scan your liked videos, favorites, and playlists to find travel destinations."}
            </p>
          </div>

          {(phase === "idle" || phase === "error") && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "40px 24px", borderRadius: "var(--m3-corner-xl)", background: "var(--m3-surface-container-low)", textAlign: "center" }}>
              <Sym name="smart_display" size={52} fill={1} style={{ color: "var(--m3-primary)", opacity: 0.85 }} />
              <div>
                <div style={{ fontWeight: 500, fontSize: 16, marginBottom: 6 }}>Sign in with Google</div>
                <div style={{ fontSize: 13, color: "var(--m3-on-surface-variant)", maxWidth: 360 }}>
                  A Google sign-in window will open. We only request read-only access.
                </div>
              </div>
              {errorMsg && <p style={{ color: "var(--m3-error)", fontSize: 13, margin: 0 }}>{errorMsg}</p>}
              <M3Button icon="login" onClick={handleConnect}>Connect YouTube account</M3Button>
            </div>
          )}

          {(phase === "connecting" || phase === "fetching") && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "40px 0", color: "var(--m3-on-surface-variant)", fontSize: 14 }}>
              <div className="m3-blob" style={{ width: 64, height: 64, animation: "m3-blob1 4s ease-in-out infinite" }} />
              {phase === "connecting" ? "Waiting for Google sign-in…" : "Scanning your videos for destinations…"}
            </div>
          )}

          {phase === "pick-dest" && destGroups.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px 0", color: "var(--m3-on-surface-variant)", fontSize: 14 }}>
              <Sym name="travel_explore" size={48} style={{ opacity: 0.3, display: "block", margin: "0 auto 12px" }} />
              No recognizable destinations found in your video titles.
              <div style={{ marginTop: 16 }}>
                <M3Button variant="outlined" icon="refresh" onClick={handleConnect}>Try again</M3Button>
              </div>
            </div>
          )}

          {phase === "pick-dest" && destGroups.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {destGroups.map((group) => (
                <button
                  key={group.key}
                  onClick={() => { setSelected(group); setPhase("pick-days"); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 16,
                    padding: "16px 20px", borderRadius: "var(--m3-corner-xl)",
                    background: "var(--m3-surface-container-low)",
                    border: "none", cursor: "pointer", textAlign: "left", width: "100%",
                    transition: "background .15s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--m3-surface-container)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "var(--m3-surface-container-low)")}
                >
                  <Sym name="location_on" size={22} fill={1} style={{ color: "var(--m3-primary)", flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: 16, color: "var(--m3-on-surface)" }}>{group.name}</div>
                    <div style={{ fontSize: 12, color: "var(--m3-on-surface-variant)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {group.videos.slice(0, 2).map((v) => v.title).join(" · ")}
                      {group.videos.length > 2 ? ` · +${group.videos.length - 2} more` : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    <span style={{ fontSize: 13, color: "var(--m3-on-surface-variant)" }}>{group.videos.length} video{group.videos.length !== 1 ? "s" : ""}</span>
                    <Sym name="chevron_right" size={20} style={{ color: "var(--m3-on-surface-variant)" }} />
                  </div>
                </button>
              ))}
              {ungrouped.length > 0 && (
                <div style={{ fontSize: 12, color: "var(--m3-on-surface-variant)", padding: "6px 4px" }}>
                  {ungrouped.length} video{ungrouped.length !== 1 ? "s" : ""} didn't match a known destination.
                </div>
              )}
              <M3Button variant="text" icon="refresh" onClick={handleConnect} style={{ alignSelf: "flex-start", marginTop: 4 }}>
                Rescan
              </M3Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Review step ───────────────────────────────────────────────────────────────
function ReviewStep({
  tripData,
  likedVideos,
  onBack,
  onGenerate,
  generating,
}: {
  tripData: TripData;
  likedVideos: string[];
  onBack: () => void;
  onGenerate: () => void;
  generating?: boolean;
}) {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div className="m3-appbar">
        <M3IconBtn icon="arrow_back" onClick={onBack} />
        <div className="title">Review</div>
        <div style={{ padding: "0 16px" }}><StepBar step={2} /></div>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "12px 32px 120px", display: "flex", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: 800, display: "flex", flexDirection: "column", gap: 24 }}>
          <div>
            <h1 className="display-font" style={{ fontSize: 36, fontWeight: 500, margin: 0, letterSpacing: "-0.01em" }}>Looks good?</h1>
            <p style={{ color: "var(--m3-on-surface-variant)", marginTop: 6 }}>
              We'll build a {tripData.days}-day plan for {tripData.location} from {likedVideos.length} videos you liked.
            </p>
          </div>

          {/* Summary card */}
          <div className="m3-card filled" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--m3-outline-variant)" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--m3-primary)", letterSpacing: ".06em", textTransform: "uppercase" }}>Trip summary</div>
              <div className="display-font" style={{ fontSize: 28, fontWeight: 500, marginTop: 4 }}>{tripData.location}</div>
              <div style={{ color: "var(--m3-on-surface-variant)", marginTop: 2 }}>
                {tripData.days} days · {tripData.season}
              </div>
            </div>
            <div style={{ padding: 16, display: "flex", flexWrap: "wrap", gap: 8 }}>
              {tripData.tags.map((tag) => (
                <span
                  key={tag}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "6px 12px", borderRadius: 8,
                    background: "var(--m3-surface-container-low)", fontSize: 13, fontWeight: 500,
                  }}
                >
                  {TAG_ICONS[tag] && <Sym name={TAG_ICONS[tag]!} size={16} />} {tag}
                </span>
              ))}
            </div>
          </div>

          {/* Liked videos */}
          {likedVideos.length > 0 && (
            <div>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
                <h2 className="display-font" style={{ fontSize: 20, fontWeight: 500, margin: 0 }}>
                  Inspired by {likedVideos.length} video{likedVideos.length !== 1 ? "s" : ""}
                </h2>
                <M3Button variant="text" icon="refresh" onClick={onBack}>Swipe more</M3Button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {likedVideos.map((id) => (
                  <img
                    key={id}
                    src={`https://img.youtube.com/vi/${id}/mqdefault.jpg`}
                    alt={id}
                    style={{ width: 80, height: 120, borderRadius: 8, objectFit: "cover", background: "var(--m3-surface-container-low)" }}
                  />
                ))}
              </div>
            </div>
          )}

          {tripData.comments && (
            <div className="m3-card outlined" style={{ padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--m3-on-surface-variant)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>Your notes</div>
              <div style={{ fontSize: 14 }}>{tripData.comments}</div>
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          position: "sticky", bottom: 0, padding: 16,
          background: "linear-gradient(to top, var(--m3-surface) 60%, transparent)",
          display: "flex", justifyContent: "flex-end", gap: 12,
          borderTop: "1px solid var(--m3-outline-variant)",
        }}
      >
        <M3Button variant="outlined" icon="arrow_back" onClick={onBack}>Back</M3Button>
        <M3Button
          icon="auto_awesome"
          onClick={() => onGenerate()}
          disabled={generating}
          style={{ opacity: generating ? 0.6 : 1 }}
        >
          {generating ? "Generating…" : "Generate itinerary"}
        </M3Button>
      </div>
    </div>
  );
}

// ── Main FormScreen ───────────────────────────────────────────────────────────
export default function FormScreen({ mode = "reels" }: { mode?: "reels" | "youtube" }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(mode === "youtube" ? 1 : 0);
  const [tripData, setTripData] = useState<TripData | null>(null);
  const [likedVideos, setLikedVideos] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async (ytParams?: YTDoneParams) => {
    setGenerating(true);
    const ids = ytParams?.ids ?? likedVideos;
    try {
      let prompt: string;
      if (ytParams) {
        prompt = [
          `Create a ${ytParams.days}-day travel itinerary for ${ytParams.location}.`,
          `The traveler's saved YouTube videos about ${ytParams.location}:`,
          ytParams.titles.slice(0, 20).map((t, i) => `${i + 1}. "${t}"`).join("\n"),
          "\nBuild a day-by-day plan drawing from the specific places, activities, food, and experiences featured in or implied by these videos. Use real, named locations.",
        ].join("\n");
      } else {
        prompt = [
          `Create a ${tripData!.days}-day travel plan`,
          ` - Location: ${tripData!.location}`,
          " - Start time: 08:00",
          " - End time: 21:00",
          ` - Activities: ${tripData!.tags.join(", ")}`,
          ` - Season: ${tripData!.season}`,
          tripData!.comments ? ` - Special notes: ${tripData!.comments}` : null,
        ].filter(Boolean).join("\n");
      }

      const videoUrls = ids.map((id) => `https://www.youtube.com/watch?v=${id}`).join(",");
      const params = new URLSearchParams({ prompt });
      if (videoUrls) params.set("video_urls", videoUrls);

      const res = await fetch(`/itinerary-api/generate_itinerary?${params}`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const itinerary = {
        location: ytParams?.location ?? tripData?.location ?? "Your Trip",
        days: ytParams?.days ?? tripData?.days ?? 7,
        ...data.itinerary,
      };
      localStorage.setItem("itinerary", JSON.stringify(itinerary));
      localStorage.setItem("liked_videos", JSON.stringify(ids));
      navigate("/your-trip");
    } catch (e) {
      console.error("Itinerary generation failed:", e);
      alert(`Couldn't generate itinerary: ${e instanceof Error ? e.message : "Backend error"}. Make sure the itinerary server is running and the API key is valid.`);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {step === 0 && (
        <TripDetailsStep
          onNext={(data) => { setTripData(data); setStep(1); }}
          onBack={() => navigate("/")}
        />
      )}
      {step === 1 && tripData && mode === "reels" && (
        <SwipeStep
          tripData={tripData}
          onDone={(liked) => { setLikedVideos(liked); setStep(2); }}
          onBack={() => setStep(0)}
        />
      )}
      {step === 1 && mode === "youtube" && (
        <YouTubeStep
          generating={generating}
          onDone={(params) => handleGenerate(params)}
          onBack={() => navigate("/")}
        />
      )}
      {step === 2 && tripData && (
        <ReviewStep
          tripData={tripData}
          likedVideos={likedVideos}
          onBack={() => setStep(1)}
          onGenerate={handleGenerate}
          generating={generating}
        />
      )}
    </div>
  );
}
