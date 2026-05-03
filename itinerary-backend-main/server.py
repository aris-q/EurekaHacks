from flask import Flask, jsonify, request
from flask_cors import CORS

import google.generativeai as genai
import json, requests, os, random, time
from functools import wraps
from dotenv import load_dotenv
from jose import jwt as jose_jwt

load_dotenv()

app = Flask(__name__)
CORS(app)

genai.configure(api_key=os.environ.get("GOOGLE_API_KEY"))
_model = genai.GenerativeModel(
    "gemini-2.5-flash", generation_config={"response_mime_type": "application/json"}
)

HTTP_OK = 200
HTTP_CREATED = 201
HTTP_BAD_REQUEST = 400

AUTH0_DOMAIN = os.environ.get("AUTH0_DOMAIN", "")
AUTH0_AUDIENCE = os.environ.get("AUTH0_AUDIENCE", "")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

_jwks_cache: dict = {"keys": None, "ts": 0.0}
_JWKS_TTL = 3600.0
_supabase_client = None


def _get_jwks():
    now = time.time()
    if _jwks_cache["keys"] and now - _jwks_cache["ts"] < _JWKS_TTL:
        return _jwks_cache["keys"]
    resp = requests.get(f"https://{AUTH0_DOMAIN}/.well-known/jwks.json", timeout=5)
    resp.raise_for_status()
    _jwks_cache["keys"] = resp.json()["keys"]
    _jwks_cache["ts"] = now
    return _jwks_cache["keys"]


def _verify_token(token):
    header = jose_jwt.get_unverified_header(token)
    keys = _get_jwks()
    rsa_key = next((k for k in keys if k.get("kid") == header.get("kid")), None)
    if not rsa_key:
        raise ValueError("No matching JWKS key")
    return jose_jwt.decode(
        token, rsa_key, algorithms=["RS256"],
        audience=AUTH0_AUDIENCE, issuer=f"https://{AUTH0_DOMAIN}/",
    )


def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return jsonify({"error": "Unauthorized"}), 401
        try:
            payload = _verify_token(auth[7:])
            request.user_id = payload["sub"]
        except Exception:
            return jsonify({"error": "Invalid token"}), 401
        return f(*args, **kwargs)
    return decorated


def get_supabase():
    global _supabase_client
    if _supabase_client is None:
        from supabase import create_client
        _supabase_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    return _supabase_client


def gemini_api_call(user_prompt, system_prompt):
    response = _model.generate_content(f"{system_prompt}\n\n{user_prompt}")
    return response.text


def filter_skit(data):
    if isinstance(data, list):
        return [filter_skit(item) for item in data if not contains_skit(item)]
    if isinstance(data, dict):
        return {k: filter_skit(v) for k, v in data.items()}
    return data


def contains_skit(data):
    if isinstance(data, str):
        return "skit" in data.lower()
    if isinstance(data, list):
        return any(contains_skit(item) for item in data)
    if isinstance(data, dict):
        return any(contains_skit(v) for v in data.values())
    return False


@app.route("/")
def index():
    return jsonify("Hello world"), HTTP_OK


@app.route("/generate_itinerary", methods=["POST"])
def generate_itinerary():
    try:
        args_user_prompt = request.args.get("prompt")
        if not args_user_prompt:
            return jsonify({"error": "No prompt found"}), HTTP_BAD_REQUEST

        video_urls_param = request.args.get("video_urls", "")
        videos = [v for v in video_urls_param.split(",") if v.strip()]
        if len(videos) > 5:
            videos = random.sample(videos, 5)

        video_summary = "The user have not specified any videos."
        if videos:
            lines = [f"Video {i+1}:\n  URL: {url}" for i, url in enumerate(videos)]
            video_summary = "\n\n".join(lines)

        with open("./prompts/system_prompt_vid_analysis.txt", "r") as f:
            system_prompt = f.read()
        with open("./prompts/prompt_with_vid_analysis.txt", "r") as f:
            user_prompt_template = f.read()

        user_prompt = user_prompt_template.replace("<user_prompt>", args_user_prompt).replace("<video_analysis>", video_summary)
        itinerary_str = gemini_api_call(user_prompt, system_prompt)
        itinerary_data = json.loads(itinerary_str)
        itinerary_data = filter_skit(itinerary_data)
        return jsonify({"itinerary": itinerary_data}), HTTP_CREATED
    except Exception as e:
        print("ERROR:", e)
        return jsonify({"error": str(e)}), 500


@app.route("/save_itinerary", methods=["POST"])
@require_auth
def save_itinerary():
    body = request.get_json(silent=True) or {}
    location = body.get("location", "")
    if not location:
        return jsonify({"error": "location required"}), HTTP_BAD_REQUEST
    result = get_supabase().table("itineraries").insert({"user_id": request.user_id, "location": location, "data": body}).execute()
    return jsonify({"id": result.data[0]["id"]}), HTTP_CREATED


@app.route("/my_itineraries", methods=["GET"])
@require_auth
def my_itineraries():
    result = get_supabase().table("itineraries").select("id, location, created_at, data").eq("user_id", request.user_id).order("created_at", desc=True).execute()
    return jsonify({"itineraries": result.data}), HTTP_OK


@app.route("/delete_itinerary/<string:itinerary_id>", methods=["DELETE"])
@require_auth
def delete_itinerary(itinerary_id):
    get_supabase().table("itineraries").delete().eq("id", itinerary_id).eq("user_id", request.user_id).execute()
    return jsonify({"ok": True}), HTTP_OK


@app.route("/what_if_timeline", methods=["POST"])
def what_if_timeline():
    try:
        body = request.get_json(silent=True) or {}
        itinerary = body.get("itinerary")
        scenario = body.get("scenario", "")
        if not itinerary:
            return jsonify({"error": "itinerary required"}), HTTP_BAD_REQUEST

        system_prompt = (
            'You are a travel planning assistant that generates alternative "what-if" timeline scenarios.\n'
            "Produce exactly 3 alternative versions: budget mode, rainy day, and half the time.\n"
            "Return ONLY valid JSON:\n"
            '{"timelines": ['
            '{"id": "budget", "label": "Budget Mode", "icon": "savings", "description": "Same trip, minimal spend", "days_plan": []},'
            '{"id": "rainy", "label": "Rainy Day", "icon": "rainy", "description": "Indoor-focused alternatives", "days_plan": []},'
            '{"id": "rushed", "label": "Half the Time", "icon": "fast_forward", "description": "Best highlights only", "days_plan": []}'
            "]}\n"
            "Each days_plan uses same Activity schema (startTime, endTime, activity, location). Keep locations real."
        )
        itinerary_json = json.dumps(itinerary, indent=2)
        scenario_hint = f"\nUser hint: {scenario}" if scenario else ""
        user_prompt = f"Generate 3 what-if timelines for this itinerary:{scenario_hint}\n\n{itinerary_json}"
        result_str = gemini_api_call(user_prompt, system_prompt)
        result = json.loads(result_str)
        return jsonify(result), HTTP_OK
    except Exception as e:
        print("ERROR /what_if_timeline:", e)
        return jsonify({"error": str(e)}), 500


PLACE_DETAILS_SYSTEM = """You are a meticulous travel data enrichment specialist with deep knowledge of real venues worldwide.

RATING RULES (strictly enforced):
- RESTAURANTS, CAFES, BARS, CLUBS, MARKETS, SHOPS, SPAS: rating allowed only if you are highly confident in the real Google Maps score. Otherwise null.
- PARKS, MOUNTAINS, BEACHES, TRAILS, FORESTS, LAKES, RIVERS, WATERFALLS, NATURAL LANDMARKS: rating = null ALWAYS. Never fabricate.
- MUSEUMS, TEMPLES, CHURCHES, HISTORIC SITES: rating only if highly confident. Otherwise null.
- TRANSIT, GENERIC ACTIVITIES (walk, check-in, transfer): rating = null.

MAPS URL: mandatory for every entry. Format: https://www.google.com/maps/search/?api=1&query=Venue+Name+City (spaces as +). Never null.

BOOKING URL: Restaurants -> OpenTable or official site. Tours -> Viator/GetYourGuide search. Museums -> official site. Parks/free -> null. Never fabricate.

PRICE: price_range: "$"<$15, "$$"=$15-40, "$$$"=$40-80, "$$$$">$80, null=free/unknown. price_estimate: specific string or null.

CATEGORY: one of: Restaurant, Cafe, Bar, Nightlife, Market, Shop, Museum, Historic Site, Temple, Church, Park, Nature, Beach, Trail, Mountain, Hotel, Transit, Activity, Tour, Spa, Entertainment

TIP: one practical specific tip, max 20 words."""

HOTEL_SYSTEM = """You are a hotel recommendation specialist. Suggest 5 real hotels covering: 1 budget/hostel, 2 mid-range, 1 upscale, 1 luxury.
Only real well-known hotels that actually exist. Accurate ratings only if confident. Never fabricate URLs.
Tier must be exactly: "Budget", "Mid-range", "Upscale", or "Luxury"."""


@app.route("/place_details", methods=["POST"])
def place_details():
    """
    Enrich activities. Optionally includes hotel suggestions in same call to save quota.
    Body: { activities: [...], location: str (optional), days: int (optional) }
    """
    try:
        body = request.get_json(silent=True) or {}
        activities = body.get("activities", [])
        location = body.get("location", "")
        days = body.get("days", 0)

        if not activities:
            return jsonify({"error": "activities required"}), HTTP_BAD_REQUEST

        activities = activities[:40]
        include_hotels = bool(location)

        activities_list = "\n".join(
            f'{i}. Activity: "{a.get("activity","")}" | Location: "{a.get("location","")}"'
            for i, a in enumerate(activities)
        )

        if include_hotels:
            system_prompt = PLACE_DETAILS_SYSTEM + "\n\n" + HOTEL_SYSTEM + (
                "\n\nReturn ONLY valid JSON:\n"
                '{"enriched": [{"index":0,"category":"Restaurant","rating":4.5,"review_count":2300,'
                '"price_range":"$$","price_estimate":"~$22/person","booking_url":"https://...","maps_url":"https://...",'
                '"tip":"Tip here.","hours":"Mon-Fri 11:30-22:00","website":"https://...","phone":"+1-555-0000"}],'
                '"hotels": [{"name":"Hotel Name","tier":"Budget","neighbourhood":"Downtown",'
                '"price_per_night":"~$45/night","rating":4.2,"review_count":1800,'
                '"highlights":["Free breakfast","Near metro","Rooftop"],'
                '"booking_url":"https://www.booking.com/searchresults.html?ss=Hotel+Name+City",'
                '"maps_url":"https://www.google.com/maps/search/?api=1&query=Hotel+Name+City",'
                '"tip":"Book 3 weeks ahead."}]}'
            )
            user_prompt = (
                f"Enrich these {len(activities)} activities AND suggest 5 hotels for {days}-day trip to {location}.\n\n"
                f"{activities_list}"
            )
        else:
            system_prompt = PLACE_DETAILS_SYSTEM + (
                "\n\nReturn ONLY valid JSON:\n"
                '{"enriched": [{"index":0,"category":"Restaurant","rating":4.5,"review_count":2300,'
                '"price_range":"$$","price_estimate":"~$22/person","booking_url":"https://...","maps_url":"https://...",'
                '"tip":"Tip here.","hours":"Mon-Fri 11:30-22:00","website":"https://...","phone":"+1-555-0000"}]}'
            )
            user_prompt = (
                f"Enrich these {len(activities)} travel activities with complete real-world details:\n\n"
                f"{activities_list}"
            )

        result_str = gemini_api_call(user_prompt, system_prompt)
        result = json.loads(result_str)
        return jsonify(result), HTTP_OK
    except Exception as e:
        print("ERROR /place_details:", e)
        return jsonify({"error": str(e)}), 500


@app.route("/hotel_suggestions", methods=["POST"])
def hotel_suggestions():
    """
    Standalone hotel suggestions endpoint.
    Body: { location: str, days: int, season: str (optional) }
    """
    try:
        body = request.get_json(silent=True) or {}
        location = body.get("location", "")
        days = body.get("days", 1)
        season = body.get("season", "")

        if not location:
            return jsonify({"error": "location required"}), HTTP_BAD_REQUEST

        system_prompt = HOTEL_SYSTEM + (
            "\n\nReturn ONLY valid JSON:\n"
            '{"hotels": [{"name":"Hotel Name","tier":"Budget","neighbourhood":"Downtown",'
            '"price_per_night":"~$45/night","rating":4.2,"review_count":1800,'
            '"highlights":["Free breakfast","Near metro","Rooftop"],'
            '"booking_url":"https://www.booking.com/searchresults.html?ss=Hotel+Name+City",'
            '"maps_url":"https://www.google.com/maps/search/?api=1&query=Hotel+Name+City",'
            '"tip":"Book 3 weeks ahead in peak season."}]}'
        )
        season_hint = f" The trip is in {season}." if season else ""
        user_prompt = f"Suggest 5 hotels for a {days}-day trip to {location}.{season_hint} Cover budget to luxury tiers."

        result_str = gemini_api_call(user_prompt, system_prompt)
        result = json.loads(result_str)
        return jsonify(result), HTTP_OK
    except Exception as e:
        print("ERROR /hotel_suggestions:", e)
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(port=8080)
