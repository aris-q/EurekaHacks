import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth0 } from "@auth0/auth0-react";
import { Sym, M3Button, M3IconBtn } from "../../components/M3";
import wallpaper from "../../assets/wallpaper.jpg";

const HOW_IT_WORKS = [
  {
    icon: "edit_location_alt",
    title: "Tell us where",
    body: "Pick a destination and the kind of trip you want.",
    bg: "var(--m3-primary-container)",
    fg: "var(--m3-on-primary-container)",
    chip: "var(--m3-primary)",
    chipFg: "var(--m3-on-primary)",
    num: "01",
  },
  {
    icon: "swipe",
    title: "Swipe the shorts",
    body: "Like videos that match your vibe; skip the rest.",
    bg: "var(--m3-secondary-container)",
    fg: "var(--m3-on-secondary-container)",
    chip: "var(--m3-secondary)",
    chipFg: "var(--m3-on-secondary)",
    num: "02",
  },
  {
    icon: "event_available",
    title: "Get the itinerary",
    body: "A day-by-day plan, inspired by what you liked.",
    bg: "var(--m3-tertiary-container)",
    fg: "var(--m3-on-tertiary-container)",
    chip: "var(--m3-tertiary)",
    chipFg: "var(--m3-on-tertiary)",
    num: "03",
  },
];

export default function GetStartedScreen() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, loginWithRedirect, logout, user } = useAuth0();
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const avatarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!avatarMenuOpen) return;
    function handleClick(e: MouseEvent) {
      if (avatarRef.current && !avatarRef.current.contains(e.target as Node)) {
        setAvatarMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [avatarMenuOpen]);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "auto" }}>
      {/* App bar */}
      <div className="m3-appbar" style={{ padding: "0 8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 8px", flex: 1 }}>
          <img src="/swipeandfly-icon-color.png" alt="Soar" style={{ width: 36, height: 36, borderRadius: 10 }} />
          <span style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em" }}>Soar</span>
        </div>
        {!isLoading && (
          isAuthenticated ? (
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <M3Button variant="text" icon="luggage" onClick={() => navigate("/my-trips")}>My trips</M3Button>
              <div ref={avatarRef} style={{ position: "relative", marginRight: 8 }}>
                {user?.picture
                  ? <img src={user.picture} alt="avatar" onClick={() => setAvatarMenuOpen(o => !o)} style={{ width: 36, height: 36, borderRadius: "50%", cursor: "pointer", display: "block" }} />
                  : <M3IconBtn icon="account_circle" onClick={() => setAvatarMenuOpen(o => !o)} />
                }
                {avatarMenuOpen && (
                  <div style={{
                    position: "absolute",
                    top: "calc(100% + 8px)",
                    right: 0,
                    background: "var(--m3-surface-container)",
                    borderRadius: "var(--m3-corner-md, 12px)",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
                    padding: "8px 0",
                    minWidth: 160,
                    zIndex: 100,
                  }}>
                    {user?.name && (
                      <div style={{ padding: "8px 16px 4px", fontSize: 13, opacity: 0.6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {user.name}
                      </div>
                    )}
                    <button
                      onClick={() => { setAvatarMenuOpen(false); logout({ logoutParams: { returnTo: window.location.origin } }); }}
                      style={{
                        display: "flex", alignItems: "center", gap: 10,
                        width: "100%", padding: "10px 16px",
                        background: "none", border: "none", cursor: "pointer",
                        color: "var(--m3-on-surface)", fontSize: 14, textAlign: "left",
                      }}
                    >
                      <Sym>logout</Sym>
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <M3Button variant="text" icon="login" onClick={() => { console.log("auth state:", { isLoading, isAuthenticated }); loginWithRedirect({ authorizationParams: { prompt: "login" } }).catch(console.error); }} style={{ marginRight: 8 }}>Sign in</M3Button>
          )
        )}
      </div>

      <div style={{ padding: "12px 24px 32px", display: "flex", flexDirection: "column", gap: 32 }}>
        {/* Hero */}
        <div
          style={{
            position: "relative",
            borderRadius: "var(--m3-corner-2xl)",
            padding: "56px 40px 48px",
            backgroundImage: `linear-gradient(115deg, color-mix(in oklch, var(--m3-primary) 75%, transparent) 0%, color-mix(in oklch, var(--m3-tertiary) 30%, transparent) 55%, transparent 100%), url(${wallpaper})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            color: "#fff",
            overflow: "hidden",
            minHeight: 460,
            boxShadow: "0 1px 2px var(--m3-shadow), 0 8px 32px color-mix(in oklch, var(--m3-primary) 20%, transparent)",
          }}
        >
          {/* Organic accent blobs */}
          <div
            className="m3-blob"
            style={{
              position: "absolute", width: 360, height: 360, right: -100, top: -100,
              opacity: 0.55, mixBlendMode: "screen",
              background: "radial-gradient(circle at 35% 35%, oklch(75% 0.18 240) 0%, transparent 70%)",
            }}
          />
          <div
            style={{
              position: "absolute", width: 240, height: 240, right: 60, bottom: -80,
              opacity: 0.35, mixBlendMode: "screen",
              background: "radial-gradient(circle at 50% 50%, oklch(80% 0.15 200) 0%, transparent 70%)",
              borderRadius: "40% 60% 65% 35% / 60% 30% 70% 40%",
            }}
          />

          <div style={{ position: "relative", maxWidth: 620 }}>
            <div
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "6px 14px",
                background: "rgba(255,255,255,.18)", backdropFilter: "blur(12px)",
                border: "1px solid rgba(255,255,255,.25)",
                borderRadius: 999, fontSize: 12, fontWeight: 600,
                letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 24,
              }}
            >
              <Sym name="auto_awesome" size={14} fill={1} /> AI travel planner
            </div>
            <h1
              className="display-font"
              style={{
                fontSize: "clamp(40px, 6vw, 72px)", fontWeight: 500,
                lineHeight: 1.02, margin: 0, letterSpacing: "-0.025em",
                textShadow: "0 2px 24px rgba(0,0,0,.25)",
              }}
            >
              Swipe shorts.<br />Skip the planning.
            </h1>
            <p
              style={{
                fontSize: 18, lineHeight: 1.55, marginTop: 18, marginBottom: 32,
                maxWidth: 480, color: "rgba(255,255,255,.92)",
                textShadow: "0 1px 8px rgba(0,0,0,.35)",
              }}
            >
              Like the travel videos that match your vibe — we'll build a day-by-day
              itinerary you'll actually want to follow.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <M3Button icon="swipe" onClick={() => navigate("/create-trip")}>
                Plan by playing reels
              </M3Button>
              <M3Button
                variant="outlined"
                icon="smart_display"
                onClick={() => navigate("/create-trip-youtube")}
                style={{ background: "rgba(255,255,255,.15)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,.45)", color: "#fff" }}
              >
                Make itinerary with YouTube
              </M3Button>
            </div>
          </div>
        </div>

        {/* How it works */}
        <div>
          <h2
            className="display-font"
            style={{ fontSize: 24, fontWeight: 500, margin: "0 0 16px", color: "var(--m3-on-surface)" }}
          >
            Three taps to a perfect trip
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 12,
            }}
          >
            {HOW_IT_WORKS.map((s) => (
              <div
                key={s.num}
                style={{
                  padding: 24,
                  borderRadius: "var(--m3-corner-xl)",
                  background: s.bg,
                  color: s.fg,
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    display: "flex", alignItems: "center",
                    justifyContent: "space-between", marginBottom: 18,
                  }}
                >
                  <div
                    style={{
                      width: 48, height: 48, borderRadius: 14,
                      background: s.chip, color: s.chipFg,
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    <Sym name={s.icon} size={26} fill={1} />
                  </div>
                  <span
                    className="display-font"
                    style={{ fontSize: 32, fontWeight: 500, opacity: 0.35, letterSpacing: "-0.02em" }}
                  >
                    {s.num}
                  </span>
                </div>
                <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 6 }}>{s.title}</div>
                <div style={{ fontSize: 14, opacity: 0.8, lineHeight: 1.5 }}>{s.body}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
