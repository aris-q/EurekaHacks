import { useNavigate } from "react-router-dom";
import { useEffect, useState, useCallback } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { Sym, M3IconBtn, M3Button } from "../../components/M3";
import { saveItinerary, fetchWhatIfTimelines, fetchPlaceDetails, fetchHotelSuggestions } from "../../utils/api";
import type { WhatIfTimeline, PlaceDetail, HotelSuggestion } from "../../utils/api";
import "./YourTripScreen.css";

interface Activity {
  startTime: string;
  endTime: string;
  activity: string;
  location: string;
}

interface DayPlan {
  day: number;
  activities: Activity[];
}

interface Itinerary {
  location: string;
  days?: number;
  days_plan: DayPlan[];
}

const ACTIVITY_ICONS: Record<string, string> = {
  breakfast: "breakfast_dining", café: "local_cafe", cafe: "local_cafe", coffee: "local_cafe",
  lunch: "lunch_dining", dinner: "restaurant", food: "restaurant", eat: "restaurant",
  museum: "museum", history: "account_balance", temple: "temple_hindu", church: "church",
  hike: "hiking", hiking: "hiking", trail: "hiking", mountain: "landscape",
  beach: "beach_access", ocean: "waves", swim: "pool",
  spa: "spa", massage: "self_improvement", relax: "self_improvement",
  nightlife: "nightlife", bar: "local_bar", club: "nightlife",
  shopping: "shopping_bag", market: "storefront",
  park: "park", garden: "local_florist", nature: "eco",
  tour: "tour", sightseeing: "photo_camera", photo: "photo_camera",
  transfer: "flight_takeoff", airport: "flight_takeoff", flight: "flight_takeoff",
  hotel: "hotel", check: "hotel",
};

function inferIcon(activity: string): string {
  const lower = activity.toLowerCase();
  for (const [kw, icon] of Object.entries(ACTIVITY_ICONS)) {
    if (lower.includes(kw)) return icon;
  }
  return "star";
}

function StarRating({ rating }: { rating: number | null }) {
  if (!rating) return <span style={{ fontSize: 12, color: "var(--m3-on-surface-variant)", opacity: 0.5 }}>No rating</span>;
  const full = Math.floor(rating);
  const half = rating - full >= 0.4;
  const empty = 5 - full - (half ? 1 : 0);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
      {Array.from({ length: full }).map((_, i) => (
        <Sym key={`f${i}`} name="star" size={14} fill={1} style={{ color: "#f59e0b" }} />
      ))}
      {half && <Sym name="star_half" size={14} fill={1} style={{ color: "#f59e0b" }} />}
      {Array.from({ length: empty }).map((_, i) => (
        <Sym key={`e${i}`} name="star" size={14} fill={0} style={{ color: "#f59e0b", opacity: 0.4 }} />
      ))}
      <span style={{ fontSize: 12, color: "var(--m3-on-surface-variant)", marginLeft: 4 }}>
        {rating.toFixed(1)}
      </span>
    </span>
  );
}

function ActivityCard({
  act,
  index,
  detail,
  loadingDetail,
}: {
  act: Activity;
  index: number;
  detail?: PlaceDetail;
  loadingDetail: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="yts-activity-row">
      {/* Number badge */}
      <div className="yts-activity-num">{index + 1}</div>

      <div className="yts-activity-card" onClick={() => setExpanded((v) => !v)}>
        {/* Top row: time */}
        <div className="yts-activity-time">
          <Sym name="schedule" size={13} />
          {act.startTime} – {act.endTime}
        </div>

        {/* Main row */}
        <div className="yts-activity-main">
          <div className="yts-activity-icon-wrap">
            <Sym name={inferIcon(act.activity)} size={20} fill={1} />
          </div>
          <div className="yts-activity-info">
            <div className="yts-activity-name">{act.activity}</div>
            <div className="yts-activity-loc">
              <Sym name="location_on" size={13} /> {act.location}
            </div>
            {/* Stars row */}
            <div className="yts-activity-stars">
              {loadingDetail ? (
                <span className="yts-shimmer" style={{ width: 80, height: 12, borderRadius: 4 }} />
              ) : (
                <StarRating rating={detail?.rating ?? null} />
              )}
              {detail?.review_count && (
                <span style={{ fontSize: 11, color: "var(--m3-on-surface-variant)", marginLeft: 4 }}>
                  ({detail.review_count.toLocaleString()})
                </span>
              )}
              {detail?.price_range && (
                <span className="yts-price-badge">{detail.price_range}</span>
              )}
            </div>
          </div>

          {/* Quick action links */}
          <div className="yts-activity-actions" onClick={(e) => e.stopPropagation()}>
            {detail?.maps_url && (
              <a href={detail.maps_url} target="_blank" rel="noopener noreferrer" title="Open in Maps">
                <Sym name="map" size={18} style={{ color: "var(--m3-primary)" }} />
              </a>
            )}
            {detail?.booking_url && (
              <a href={detail.booking_url} target="_blank" rel="noopener noreferrer" title="Book / Buy tickets">
                <Sym name="open_in_new" size={18} style={{ color: "var(--m3-primary)" }} />
              </a>
            )}
          </div>
        </div>

        {/* Expanded detail */}
        {expanded && detail && (
          <div className="yts-activity-expanded">
            {detail.price_estimate && (
              <div className="yts-detail-row">
                <Sym name="payments" size={15} />
                <span>{detail.price_estimate}</span>
              </div>
            )}
            {detail.tip && (
              <div className="yts-detail-row">
                <Sym name="lightbulb" size={15} fill={1} style={{ color: "#f59e0b" }} />
                <span>{detail.tip}</span>
              </div>
            )}
            {detail.booking_url && (
              <a
                href={detail.booking_url}
                target="_blank"
                rel="noopener noreferrer"
                className="yts-book-btn"
                onClick={(e) => e.stopPropagation()}
              >
                <Sym name="confirmation_number" size={15} />
                Book / Buy tickets
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function WhatIfTab({ itinerary }: { itinerary: Itinerary }) {
  const [timelines, setTimelines] = useState<WhatIfTimeline[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTimeline, setActiveTimeline] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchWhatIfTimelines(itinerary as unknown as Record<string, unknown>);
      setTimelines(result);
      if (result.length > 0) setActiveTimeline(result[0].id);
    } catch (e) {
      setError("Failed to generate timelines. Try again.");
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [itinerary]);

  if (!timelines && !loading && !error) {
    return (
      <div className="yts-whatif-empty">
        <div className="yts-whatif-icon">
          <Sym name="fork_right" size={36} fill={1} />
        </div>
        <div className="yts-whatif-title">What-If Timelines</div>
        <div className="yts-whatif-desc">
          Generate 3 alternative versions of your trip — budget mode, rainy day plan, and a condensed highlights version.
        </div>
        <M3Button icon="auto_awesome" onClick={load}>
          Generate alternatives
        </M3Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="yts-whatif-empty">
        <div className="yts-loading-spinner" />
        <div style={{ marginTop: 16, color: "var(--m3-on-surface-variant)", fontSize: 14 }}>
          Gemini is generating your alternative timelines…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="yts-whatif-empty">
        <Sym name="error" size={36} style={{ color: "var(--m3-error)" }} />
        <div style={{ marginTop: 12, color: "var(--m3-error)" }}>{error}</div>
        <M3Button variant="tonal" icon="refresh" onClick={load} style={{ marginTop: 12 }}>
          Retry
        </M3Button>
      </div>
    );
  }

  const active = timelines?.find((t) => t.id === activeTimeline);

  return (
    <div className="yts-whatif-content">
      {/* Timeline selector chips */}
      <div className="yts-whatif-chips">
        {timelines?.map((t) => (
          <button
            key={t.id}
            className={`yts-whatif-chip ${activeTimeline === t.id ? "active" : ""}`}
            onClick={() => setActiveTimeline(t.id)}
          >
            <Sym name={t.icon} size={16} fill={activeTimeline === t.id ? 1 : 0} />
            {t.label}
          </button>
        ))}
        <button className="yts-whatif-chip regen" onClick={load} title="Regenerate">
          <Sym name="refresh" size={16} />
        </button>
      </div>

      {active && (
        <div className="yts-whatif-desc-bar">
          <Sym name="info" size={15} fill={1} style={{ color: "var(--m3-primary)" }} />
          {active.description}
        </div>
      )}

      {/* Activities list for active timeline */}
      {active?.days_plan.map((dayPlan) => (
        <div key={dayPlan.day}>
          <div className="yts-day-header">
            <div className="yts-day-badge">{dayPlan.day}</div>
            <span className="yts-day-label">Day {dayPlan.day}</span>
          </div>
          {dayPlan.activities.map((act, i) => (
            <div key={i} className="yts-activity-row" style={{ paddingLeft: 0 }}>
              <div className="yts-activity-num">{i + 1}</div>
              <div className="yts-activity-card" style={{ cursor: "default" }}>
                <div className="yts-activity-time">
                  <Sym name="schedule" size={13} />
                  {act.startTime} – {act.endTime}
                </div>
                <div className="yts-activity-main">
                  <div className="yts-activity-icon-wrap">
                    <Sym name={inferIcon(act.activity)} size={20} fill={1} />
                  </div>
                  <div className="yts-activity-info">
                    <div className="yts-activity-name">{act.activity}</div>
                    <div className="yts-activity-loc">
                      <Sym name="location_on" size={13} /> {act.location}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

const TIER_COLORS: Record<string, string> = {
  Budget: "#22c55e",
  "Mid-range": "#3b82f6",
  Upscale: "#a855f7",
  Luxury: "#f59e0b",
};

function HotelCard({ hotel }: { hotel: HotelSuggestion }) {
  return (
    <div className="yts-hotel-card">
      <div className="yts-hotel-header">
        <div className="yts-hotel-name">{hotel.name}</div>
        <span
          className="yts-hotel-tier"
          style={{
            background: (TIER_COLORS[hotel.tier] ?? "#888") + "22",
            color: TIER_COLORS[hotel.tier] ?? "#888",
          }}
        >
          {hotel.tier}
        </span>
      </div>
      <div className="yts-hotel-neighbourhood">
        <Sym name="location_on" size={12} /> {hotel.neighbourhood}
      </div>
      <div className="yts-hotel-price">{hotel.price_per_night}</div>
      {hotel.rating && (
        <div className="yts-hotel-rating">
          <Sym name="star" size={12} fill={1} style={{ color: "#f59e0b" }} />
          <span>{hotel.rating.toFixed(1)}</span>
          {hotel.review_count && (
            <span style={{ opacity: 0.6 }}>({hotel.review_count.toLocaleString()})</span>
          )}
        </div>
      )}
      <div className="yts-hotel-highlights">
        {hotel.highlights.map((h, i) => (
          <span key={i} className="yts-hotel-highlight-chip">{h}</span>
        ))}
      </div>
      {hotel.tip && (
        <div className="yts-hotel-tip">
          <Sym name="lightbulb" size={12} fill={1} style={{ color: "#f59e0b" }} />
          {hotel.tip}
        </div>
      )}
      <div className="yts-hotel-actions">
        <a href={hotel.maps_url} target="_blank" rel="noopener noreferrer" className="yts-hotel-action-btn maps">
          <Sym name="map" size={14} /> Map
        </a>
        {hotel.booking_url && (
          <a href={hotel.booking_url} target="_blank" rel="noopener noreferrer" className="yts-hotel-action-btn book">
            <Sym name="hotel" size={14} /> Book
          </a>
        )}
      </div>
    </div>
  );
}

export default function YourTripScreen() {
  const navigate = useNavigate();
  const { getAccessTokenSilently } = useAuth0();
  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const [likedCount, setLikedCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [snack, setSnack] = useState<{ msg: string; ok: boolean } | null>(null);
  const [activeTab, setActiveTab] = useState<"activities" | "whatif">("activities");
  const [placeDetails, setPlaceDetails] = useState<PlaceDetail[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [hotels, setHotels] = useState<HotelSuggestion[]>([]);
  const [loadingHotels, setLoadingHotels] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<"hotels" | "tips">("hotels");

  useEffect(() => {
    const raw = localStorage.getItem("itinerary");
    const liked = localStorage.getItem("liked_videos");
    if (raw) {
      const parsed = JSON.parse(raw) as Itinerary;
      setItinerary(parsed);
      loadPlaceDetails(parsed);
    }
    if (liked) setLikedCount(JSON.parse(liked).length);
  }, []);

  const loadPlaceDetails = async (itin: Itinerary) => {
    setLoadingDetails(true);
    setLoadingHotels(true);
    setDetailsError(null);
    try {
      const allActivities = itin.days_plan.flatMap((d) =>
        d.activities.map((a) => ({ activity: a.activity, location: a.location }))
      );
      const days = itin.days ?? itin.days_plan.length;
      const result = await fetchPlaceDetails(allActivities, itin.location, days);
      setPlaceDetails(result.enriched ?? []);
      if (result.hotels && result.hotels.length > 0) {
        setHotels(result.hotels);
      }
    } catch (e) {
      console.error("Place details failed:", e);
      setDetailsError(e instanceof Error ? e.message : "Failed to load place data");
    } finally {
      setLoadingDetails(false);
      setLoadingHotels(false);
    }
  };

  const showSnack = (msg: string, ok = true) => {
    setSnack({ msg, ok });
    setTimeout(() => setSnack(null), 2400);
  };

  const handleSave = async () => {
    if (!itinerary) return;
    setSaving(true);
    try {
      const token = await getAccessTokenSilently();
      await saveItinerary(itinerary as unknown as Record<string, unknown>, token);
      showSnack("Trip saved to your account");
    } catch {
      showSnack("Couldn't save — are you signed in?", false);
    } finally {
      setSaving(false);
    }
  };

  if (!itinerary) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 24 }}>
        <div style={{ width: 80, height: 80, borderRadius: 20, background: "var(--m3-primary-container)", color: "var(--m3-on-primary-container)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          <Sym name="map" size={40} fill={1} />
        </div>
        <div style={{ textAlign: "center" }}>
          <div className="display-font" style={{ fontSize: 24, fontWeight: 500 }}>No itinerary yet</div>
          <div style={{ color: "var(--m3-on-surface-variant)", marginTop: 6, fontSize: 14 }}>Plan a trip to get started.</div>
        </div>
        <M3Button icon="arrow_forward" onClick={() => navigate("/create-trip")}>Plan a trip</M3Button>
      </div>
    );
  }

  const totalActivities = itinerary.days_plan.reduce((sum, d) => sum + d.activities.length, 0);
  const numDays = itinerary.days ?? itinerary.days_plan.length;

  const detailMap = new Map<number, PlaceDetail>();
  placeDetails.forEach((d) => detailMap.set(d.index, d));

  const dayOffsets: number[] = [];
  let offset = 0;
  for (const d of itinerary.days_plan) {
    dayOffsets.push(offset);
    offset += d.activities.length;
  }

  const ratedVenues = placeDetails.filter((d) => d.rating !== null);
  const avgRating =
    ratedVenues.length
      ? (ratedVenues.reduce((s, d) => s + (d.rating ?? 0), 0) / ratedVenues.length).toFixed(1)
      : null;
  const freeActivities = placeDetails.filter(
    (d) => d.price_estimate?.toLowerCase().includes("free") || d.price_range === null
  );
  const paidActivities = placeDetails.filter((d) => d.price_range !== null);

  return (
    <div className="yts-root">
      <div className="m3-appbar">
        <M3IconBtn icon="arrow_back" onClick={() => navigate("/")} />
        <div className="title">{itinerary.location}</div>
        <M3IconBtn icon="bookmark" onClick={handleSave} disabled={saving} title="Save trip" />
        <M3IconBtn icon="refresh" onClick={() => navigate("/create-trip")} title="Rebuild" />
      </div>

      <div className="yts-body">
        {/* LEFT SIDEBAR */}
        <aside className="yts-sidebar">
          <div className="yts-globe-wrap">
            <div className="yts-globe">
              <Sym name="public" size={72} fill={1} style={{ color: "var(--m3-on-primary-container)", opacity: 0.7 }} />
            </div>
            <div className="yts-globe-hint">Tap activities to see details</div>
          </div>

          <div className="yts-stats-row">
            <div className="yts-stat-card">
              <div className="yts-stat-label">ACTIVITIES</div>
              <div className="yts-stat-value">{totalActivities}</div>
            </div>
            <div className="yts-stat-card accent">
              <div className="yts-stat-label">DAYS</div>
              <div className="yts-stat-value">{numDays}</div>
            </div>
          </div>

          {!loadingDetails && placeDetails.length > 0 && (
            <div className="yts-insight-chips">
              {avgRating && (
                <div className="yts-insight-chip">
                  <Sym name="star" size={13} fill={1} style={{ color: "#f59e0b" }} />
                  Avg {avgRating} rated venues
                </div>
              )}
              {likedCount > 0 && (
                <div className="yts-insight-chip">
                  <Sym name="play_circle" size={13} fill={1} style={{ color: "var(--m3-primary)" }} />
                  {likedCount} video{likedCount > 1 ? "s" : ""} used
                </div>
              )}
              {freeActivities.length > 0 && (
                <div className="yts-insight-chip">
                  <Sym name="savings" size={13} fill={1} style={{ color: "#22c55e" }} />
                  {freeActivities.length} free stops
                </div>
              )}
              {paidActivities.length > 0 && (
                <div className="yts-insight-chip">
                  <Sym name="payments" size={13} fill={1} style={{ color: "var(--m3-secondary)" }} />
                  {paidActivities.length} paid activities
                </div>
              )}
            </div>
          )}
          {loadingDetails && (
            <div className="yts-enrich-status">
              <div className="yts-enrich-dot" style={{ background: "#f59e0b" }} />
              <span>Loading place data...</span>
            </div>
          )}
          {!loadingDetails && detailsError && (
            <div className="yts-enrich-status">
              <div className="yts-enrich-dot" style={{ background: "var(--m3-error)" }} />
              <span style={{ color: "var(--m3-error)" }}>Place data failed</span>
            </div>
          )}

          <div className="yts-sidebar-tabs">
            <button
              className={"yts-sidebar-tab" + (sidebarTab === "hotels" ? " active" : "")}
              onClick={() => setSidebarTab("hotels")}
            >
              <Sym name="hotel" size={14} fill={sidebarTab === "hotels" ? 1 : 0} />
              Hotels
            </button>
            <button
              className={"yts-sidebar-tab" + (sidebarTab === "tips" ? " active" : "")}
              onClick={() => setSidebarTab("tips")}
            >
              <Sym name="tips_and_updates" size={14} fill={sidebarTab === "tips" ? 1 : 0} />
              Tips
            </button>
          </div>

          {sidebarTab === "hotels" && (
            <div className="yts-hotels-panel">
              {loadingHotels ? (
                <div className="yts-sidebar-loading">
                  <div className="yts-loading-spinner" style={{ width: 24, height: 24, borderWidth: 2 }} />
                  <span>Finding hotels...</span>
                </div>
              ) : detailsError ? (
                <div className="yts-sidebar-error">
                  <Sym name="error_outline" size={20} style={{ color: "var(--m3-error)", flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--m3-error)" }}>Couldn't load data</div>
                    <div style={{ fontSize: 11, color: "var(--m3-on-surface-variant)", marginTop: 2 }}>
                      {detailsError.includes("429") ? "API rate limit hit — try again in a minute." : detailsError}
                    </div>
                    <button className="yts-retry-btn" onClick={() => itinerary && loadPlaceDetails(itinerary)}>
                      <Sym name="refresh" size={13} /> Retry
                    </button>
                  </div>
                </div>
              ) : hotels.length === 0 ? (
                <div className="yts-sidebar-empty">No hotel data yet</div>
              ) : (
                hotels.map((h, i) => <HotelCard key={i} hotel={h} />)
              )}
            </div>
          )}

          {sidebarTab === "tips" && (
            <div className="yts-tips-panel">
              {[
                { icon: "credit_card", color: "#3b82f6", title: "Notify your bank", body: "Let your bank know you're travelling to avoid card blocks abroad." },
                { icon: "sim_card", color: "#f59e0b", title: "Local SIM or eSIM", body: "Pick up a local SIM at the airport or activate an eSIM before departure." },
                { icon: "download", color: "#22c55e", title: "Offline maps", body: `Download Google Maps offline for ${itinerary.location} before you go.` },
                { icon: "health_and_safety", color: "#a855f7", title: "Travel insurance", body: `Consider trip cancellation and medical coverage for your ${numDays}-day trip.` },
                { icon: "confirmation_number", color: "#ef4444", title: "Book ahead", body: "Popular restaurants and tours fill up fast — book at least a week in advance." },
                { icon: "currency_exchange", color: "#0ea5e9", title: "Local currency", body: "Carry some cash — many local markets and small restaurants are cash-only." },
              ].map((tip, i) => (
                <div key={i} className="yts-tip-item">
                  <div className="yts-tip-icon" style={{ background: tip.color + "22", color: tip.color }}>
                    <Sym name={tip.icon} size={16} fill={1} />
                  </div>
                  <div>
                    <div className="yts-tip-title">{tip.title}</div>
                    <div className="yts-tip-body">{tip.body}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="yts-agent-status">
            <div className="yts-sidebar-section-label">AGENT STATUS</div>
            <div className="yts-agent-pills">
              <div className="yts-agent-pill active"><span className="yts-agent-dot" />Planner</div>
              <div className="yts-agent-pill"><span className="yts-agent-dot off" />Reality</div>
              <div className="yts-agent-pill"><span className="yts-agent-dot off" />Optimize</div>
            </div>
          </div>
        </aside>

        {/* RIGHT PANEL */}
        <main className="yts-main">
          <div className="yts-tabs">
            <button className={"yts-tab" + (activeTab === "activities" ? " active" : "")} onClick={() => setActiveTab("activities")}>
              <Sym name="event_note" size={16} fill={activeTab === "activities" ? 1 : 0} />
              Activities ({totalActivities})
            </button>
            <button className={"yts-tab" + (activeTab === "whatif" ? " active" : "")} onClick={() => setActiveTab("whatif")}>
              <Sym name="fork_right" size={16} fill={activeTab === "whatif" ? 1 : 0} />
              What-If Timelines
            </button>
          </div>

          <div className="yts-tab-content">
            {activeTab === "activities" && (
              <div className="yts-activities-list">
                {itinerary.days_plan.map((dayPlan, di) => (
                  <div key={dayPlan.day}>
                    <div className="yts-day-header">
                      <div className="yts-day-badge">{dayPlan.day}</div>
                      <span className="yts-day-label">Day {dayPlan.day}</span>
                      <span className="yts-day-count">{dayPlan.activities.length} activities</span>
                    </div>
                    {dayPlan.activities.map((act, i) => {
                      const globalIdx = dayOffsets[di] + i;
                      return (
                        <ActivityCard
                          key={i}
                          act={act}
                          index={i}
                          detail={detailMap.get(globalIdx)}
                          loadingDetail={loadingDetails}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            )}

            {activeTab === "whatif" && <WhatIfTab itinerary={itinerary} />}
          </div>
        </main>
      </div>

      {snack && (
        <div style={{ position: "fixed", left: "50%", bottom: 24, transform: "translateX(-50%)", zIndex: 30 }}>
          <div className="m3-snackbar">
            <Sym name={snack.ok ? "check_circle" : "error"} size={18} fill={1} /> {snack.msg}
          </div>
        </div>
      )}
    </div>
  );
}
