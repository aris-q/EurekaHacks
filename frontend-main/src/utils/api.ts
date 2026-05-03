export interface SavedItinerary {
  id: string;
  location: string;
  created_at: string;
  data: Record<string, unknown>;
}

export async function saveItinerary(itinerary: Record<string, unknown>, token: string): Promise<string> {
  const res = await fetch("/itinerary-api/save_itinerary", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(itinerary),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).id as string;
}

export async function fetchMyItineraries(token: string): Promise<SavedItinerary[]> {
  const res = await fetch("/itinerary-api/my_itineraries", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).itineraries as SavedItinerary[];
}

export async function deleteItinerary(id: string, token: string): Promise<void> {
  const res = await fetch(`/itinerary-api/delete_itinerary/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export interface WhatIfTimeline {
  id: string;
  label: string;
  icon: string;
  description: string;
  days_plan: Array<{
    day: number;
    activities: Array<{ startTime: string; endTime: string; activity: string; location: string }>;
  }>;
}

export async function fetchWhatIfTimelines(
  itinerary: Record<string, unknown>,
  scenario?: string
): Promise<WhatIfTimeline[]> {
  const res = await fetch("/itinerary-api/what_if_timeline", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itinerary, scenario: scenario ?? "" }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).timelines as WhatIfTimeline[];
}

export interface PlaceDetail {
  index: number;
  category: string | null;
  rating: number | null;
  review_count: number | null;
  price_range: string | null;
  price_estimate: string | null;
  booking_url: string | null;
  maps_url: string | null;
  tip: string | null;
  hours: string | null;
  website: string | null;
  phone: string | null;
}

export async function fetchPlaceDetails(
  activities: Array<{ activity: string; location: string }>,
  location?: string,
  days?: number,
): Promise<{ enriched: PlaceDetail[]; hotels?: HotelSuggestion[] }> {
  const res = await fetch("/itinerary-api/place_details", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ activities, location: location ?? "", days: days ?? 0 }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json() as { enriched: PlaceDetail[]; hotels?: HotelSuggestion[] };
}

export interface HotelSuggestion {
  name: string;
  tier: "Budget" | "Mid-range" | "Upscale" | "Luxury";
  neighbourhood: string;
  price_per_night: string;
  rating: number | null;
  review_count: number | null;
  highlights: string[];
  booking_url: string | null;
  maps_url: string;
  tip: string;
}

export async function fetchHotelSuggestions(
  location: string,
  days: number,
  season?: string
): Promise<HotelSuggestion[]> {
  const res = await fetch("/itinerary-api/hotel_suggestions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ location, days, season: season ?? "" }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).hotels as HotelSuggestion[];
}
