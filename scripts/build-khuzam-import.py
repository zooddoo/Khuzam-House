#!/usr/bin/env python3
"""
Builds source-data/bait-khuzam-import.json from the three source files:

  1. source-data/kitchen.md       — authoritative for the Main Kitchen
  2. source-data/living-room.md   — authoritative for Living & Dining
  3. source-data/house-layout.md  — all other rooms, floors, orientation, house decisions

Rules followed:
- Only what the files say. Every value keeps its status (confirmed / estimated / unknown).
- No invented dimensions, wall lengths, positions, heights or AC locations.
  Ceiling heights are unknown everywhere.
- Image links (images.openai.com …) are ignored. Only the listed photo file
  names are recorded, as "photo to upload" reminders on the right room/wall.
- Conflicts between files are not resolved; they are listed.

Run:  python3 scripts/build-khuzam-import.py
"""
import json
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "source-data" / "bait-khuzam-import.json"

C, E, U = "confirmed", "estimated", "unknown"
HOUSE = "house-layout.md"
LIVING = "living-room.md"
KITCHEN = "kitchen.md"


def dim(m, certainty):
    return {"m": m, "certainty": certainty if m is not None else U}


def rect(length, width, certainty, source):
    return {"shape": "rectangle", "length": dim(length, certainty), "width": dim(width, certainty), "source": source}


def req(title, description, category, priority, status="included", kind="want", source="", notes="", group=""):
    return {
        "title": title,
        "description": description,
        "category": category,
        "priority": priority,
        "status": status,
        "kind": kind,
        "group": group,
        "notes": notes,
        "source": source,
    }


def rejected(title, reason, category, source):
    return req(title, reason, category, "must", status="rejected", kind="avoid", source=source, group="Rejected ideas")


def split(s):
    return [x.strip() for x in s.split(",") if x.strip()]


CAT = {
    # source category -> app category
    "Architectural": "architectural",
    "Functional": "functional",
    "Layout": "layout",
    "Layout/Space": "layout",
    "Style": "style",
    "Colors": "colors",
    "Color": "colors",
    "Materials": "materials",
    "Material": "materials",
    "Flooring": "materials",
    "Furniture": "furniture",
    "Storage": "storage",
    "Lighting": "lighting",
    "Other": "other",
    "Cabinetry": "storage",
    "Appliances": "furniture",
    "Storage/Appliances": "storage",
    "Decor": "style",
    "Plumbing": "functional",
    "Ventilation": "functional",
    "HVAC": "architectural",
    "Ceiling": "architectural",
}
PRI = {"Must Have": "must", "Preferred": "preferred", "Optional": "optional"}


def table_req(title, description, category, priority, source, status="included"):
    return req(title, description, CAT[category], PRI[priority], status=status, source=source, notes=f"Source category: {category}")


# ---------------------------------------------------------------------------
# Living & Dining  (living-room.md is authoritative)
# ---------------------------------------------------------------------------

L = f"{LIVING} — Requirements"
living_requirements = [
    table_req("Preserve existing room structure", "Do not change the room's original structure and proportions", "Architectural", "Must Have", L),
    table_req("Preserve glass openings", "Keep all existing glass doors and windows in their original positions", "Architectural", "Must Have", L),
    table_req("North glazing", "Two vertical glass panes plus side corridor glass door", "Architectural", "Must Have", L),
    table_req("No glazing dividers", "No added wall dividers between connected glass panels/doors", "Architectural", "Must Have", L),
    table_req("Backyard glazing", "Backyard entrance with two adjacent vertical glass panes", "Architectural", "Must Have", L),
    table_req("Kitchen sliding door", "Sliding kitchen door on east wall", "Architectural", "Must Have", L),
    table_req("Wall section beside kitchen", "Preserve wall space between backyard glass group and kitchen sliding door", "Architectural", "Must Have", L),
    table_req("Clear circulation", "Clear path from majlis to stairs, guest bathroom, and kitchen", "Functional", "Must Have", L),
    table_req("Dining in West", "Place dining table on western side", "Layout", "Must Have", L),
    table_req("Long sofa facing North", "Main long sofa faces north toward TV", "Layout", "Must Have", L),
    table_req("Classic Persian/Turkish rugs", "Rugs with classical Persian or Turkish pattern", "Style", "Must Have", L),
    table_req("Warm minimalist style", "Contemporary warm minimalist", "Style", "Must Have", L),
    table_req("Secondary colors", "Dusty pink, sage green, burgundy", "Colors", "Must Have", L),
    table_req("Warm neutral base", "Beige and stone-grey neutral foundation", "Colors", "Must Have", L),
    table_req("Natural wood", "Warm natural wood elements", "Materials", "Must Have", L),
    table_req("Parquet flooring", "Wooden parquet floor", "Materials", "Must Have", L),
    table_req("Lower dining ceiling", "Dining ceiling lower than living area ceiling", "Architectural", "Must Have", L),
    table_req("Preserve ceiling levels", "Retain original ceiling transitions and heights", "Architectural", "Must Have", L),
    table_req("TV wall shiplap", "Full TV wall shiplap treatment", "Materials", "Must Have", L),
    table_req("Wall-mounted TV", "Mount TV on wall", "Furniture", "Must Have", L),
    table_req("Floating console", "Floating TV console", "Furniture", "Must Have", L),
    table_req("Console limited to TV area", "Do not extend console below AC units", "Furniture", "Must Have", L),
    table_req("No TV wall shelves", "TV wall without shelves", "Storage", "Must Have", L),
    table_req("No TV wall decorative lights", "No decorative lights on TV wall", "Lighting", "Must Have", L),
    table_req("No LED/backlighting", "No LED strip or backlighting on TV wall", "Lighting", "Must Have", L),
    table_req("Keep doors accessible", "Furniture must not obstruct door operation or access", "Functional", "Must Have", L),
    table_req("Keep windows accessible", "Furniture must not block glass or light", "Functional", "Must Have", L),
    table_req("Plants", "Use plants as selected decorative elements", "Other", "Preferred", L),
    table_req("Soft textiles", "Layer textiles to create warmth", "Style", "Preferred", L),
    table_req("Warm lighting", "Warm lighting ambience", "Lighting", "Preferred", L),
    # Conflict 5: only in house-layout.md → Pending until confirmed.
    req(
        "Dining table for 8 people",
        "Dining table planned for 8 people in the living/dining space.",
        "furniture",
        "preferred",
        status="pending",
        source=f"{HOUSE} — Approved living room design constraints",
        notes="CONFLICT 5: only stated in house-layout.md; living-room.md lists dining chair count as Unknown. Pending until you confirm.",
    ),
]
LR = f"{LIVING} — Rejected ideas"
living_rejected = [
    rejected("Adding wall dividers between glass panels", "The existing glass should appear continuous with no added wall separation", "architectural", LR),
    rejected("Treating the north/east glazing as one uninterrupted glass façade", "The actual room has distinct door/window arrangements across two walls", "architectural", LR),
    rejected("Inventing a large continuous rear glass wall", "Does not match the actual architecture", "architectural", LR),
    rejected("Shelves on the TV wall", "Explicitly rejected", "storage", LR),
    rejected("LED strips on the TV wall", "Explicitly rejected", "lighting", LR),
    rejected("Backlighting behind TV wall finishes", "Explicitly rejected", "lighting", LR),
    rejected("Decorative TV-wall lighting", "Explicitly rejected", "lighting", LR),
    rejected("Floating console extending below AC units", "Explicitly prohibited", "furniture", LR),
    rejected("Console extending beyond TV area", "Explicitly prohibited", "furniture", LR),
    rejected("Blocking the side passage, backyard entrance or kitchen access with furniture", "Conflicts with circulation requirements", "functional", LR),
    rejected("Moving doors, windows or AC units to fit the design", "Explicitly prohibited", "architectural", LR),
]
living_constraints = [
    "Existing room geometry and proportions.",
    "Existing doors and openings.",
    "Existing windows and glass panels.",
    "Existing AC locations.",
    "Original glass arrangement and connections.",
    "The north wall's glazing and side corridor entrance arrangement.",
    "The east wall's backyard entrance, glazing, wall section and kitchen door arrangement.",
    "The kitchen door being a sliding door.",
    "The parquet flooring.",
    "The different ceiling levels; dining ceiling is lower.",
    "The north TV wall location.",
    "The long sofa facing north.",
    "Dining zone on the west side.",
    "Clear circulation from majlis to stairs, guest bathroom, and kitchen.",
    "No obstruction of circulation.",
    "No added dividers between connected glazing.",
]
living_direction = {
    "style": "Contemporary Warm Minimalist with subtle classic Turkish / Persian influence",
    "atmosphere": "Natural, calm, warm, elegant, timeless, not overly decorated",
    "palette": [
        {"hex": "#D9C9B8", "name": "Warm Beige / بيج دافئ", "role": "Main color for upholstery and interior (Confirmed)"},
        {"hex": "#A7A39A", "name": "Stone Grey / رمادي حجري", "role": "Secondary neutral (Confirmed)"},
        {"hex": "#8B6F56", "name": "Natural Wood / خشب طبيعي", "role": "TV wall, furniture and tables (Confirmed)"},
        {"hex": "#B98F8F", "name": "Dusty Pink / وردي غباري", "role": "Accent textiles and chairs (Confirmed)"},
        {"hex": "#7A826B", "name": "Sage Green / أخضر مريمي", "role": "Cushions, accessories, plants (Confirmed)"},
        {"hex": "#5B2C2C", "name": "Burgundy / عنابي", "role": "Selective accents (Confirmed)"},
    ],
    "paletteNotes": (
        "HEX values used in the approved design boards — Confirmed as design palette values, not necessarily final paint/material product codes. "
        "CONFLICT 3: house-layout.md gives a different general palette (warm walnut wood, off-white, beige, natural fabric tones) — not resolved."
    ),
    "materials": "Contemporary clean architecture combined with traditional patterns in rugs and textile accents. Rugs: classic Turkish or Persian-style patterns (Confirmed).",
    "woodType": "Natural and warm, medium tone (Confirmed as design direction; exact species/finish Unknown)",
    "flooring": "Wooden parquet (باركيه خشبي) — Confirmed",
    "wallFinishes": "Warm neutral matte finish (Confirmed as design direction). TV wall: full-wall shiplap / شيبورد cladding (Confirmed).",
    "furnitureStyle": "Long main sofa facing north / TV wall; accent chairs; coffee table; dining table on the west side. Floating TV console limited to the TV area.",
    "lighting": "Warm lighting atmosphere (Confirmed). General ceiling lighting (Planned). Specification, color temperature, fixture types, quantity and locations Unknown.",
    "curtains": "Soft, light curtains shown in design direction; exact fabric, color and specification Unknown.",
    "description": (
        "Existing ceiling shape must be preserved (Confirmed). Dining ceiling is lower than the living/lounge ceiling (Confirmed). "
        "Approved renderings are aesthetic direction only, not measurement sources."
    ),
    "avoid": "Shelves, decorative lighting, LED strips or backlighting on the TV wall; decorative divisions interrupting the TV wall treatment; dividers between connected glazing.",
}
living_furniture = [
    # name, category, position, status
    ("Long main sofa", "sofa", "Living zone; faces North / TV wall", "Confirmed"),
    ("Additional sofa / sectional components", "sofa", "Living zone", "Estimated based on approved render"),
    ("Accent chairs", "armchair", "Around living seating zone", "Confirmed concept"),
    ("Coffee table", "table", "Center of seating", "Confirmed"),
    ("Side tables", "table", "Beside seating", "Preferred"),
    ("Living rug", "rug", "Under main seating", "Confirmed"),
    ("Persian/Turkish-style rug", "rug", "Living zone", "Must Have"),
    ("Dining table", "dining-table", "Western side of room", "Confirmed"),
    ("Dining chairs", "chair", "Around dining table", "Confirmed"),
    ("Dining rug", "rug", "Western dining zone", "Included in approved concept"),
    ("Plants", "plant", "Select corners/areas, not blocking movement", "Preferred"),
    ("TV console", "tv-unit", "North TV wall", "Confirmed"),
    ("TV", "tv-unit", "North TV wall", "Confirmed"),
]
living_missing = {
    "Room geometry": [
        "Exact north wall length", "Exact south wall length", "Exact east wall length", "Exact west wall length",
        "Exact overall room dimensions verified against original plan", "Exact room shape, including offsets/returns",
        "Exact ceiling height in living area", "Exact ceiling height in dining area", "Exact height difference between ceiling levels",
        "Exact ceiling offset / transition dimensions", "Exact area in square meters verified from architectural plan",
    ],
    "Doors and glazing": [
        "Width and height of every north glass panel", "Width and height of side passage glass door",
        "Exact positioning of north glass elements measured from corner", "Width and height of backyard glass door",
        "Width and height of the two east glass panels", "Exact positioning of east glazing from corner",
        "Kitchen sliding door width and height", "Wall section width between backyard glazing and kitchen door",
        "Door sill elevation and frame dimensions", "Opening direction/operating details for all doors",
    ],
    "AC units": [
        "Number of AC units in the living room", "Exact wall for each unit", "Position along wall (distance from corner)",
        "Width and height of each unit", "Elevation from floor", "Required clearance below/around each AC",
        "Verified console termination points relative to the AC units",
    ],
    "TV wall": [
        "Exact TV wall width and height", "TV size in inches", "TV center height", "Exact shiplap width/profile/material",
        "Console width, depth, height and mounting elevation", "Exact console location relative to AC units",
        "Wood species and stain/finish", "Confirmed power/data outlet positions",
    ],
    "Furniture": [
        "Main sofa dimensions", "Additional sofa dimensions, if any", "Accent chair dimensions", "Number of accent chairs",
        "Coffee table dimensions", "Side table dimensions", "Dining table dimensions", "Dining chair dimensions",
        "Dining chair count", "Living rug dimensions", "Dining rug dimensions", "Plant sizes and exact locations",
    ],
    "Finish specifications": [
        "Exact parquet product and color", "Exact wood species and finish", "Wall paint codes and brands", "Curtain fabric and color",
        "Curtain dimensions and track placement", "Rug colors/pattern specifications", "Lighting fixtures and quantities",
        "Lighting color temperature", "Lighting circuit/scene plan", "Final accessories/decor selections",
    ],
}

living = {
    "key": "living-dining",
    "name": "Living & Dining Room",
    "nameAr": "الصالة / غرفة المعيشة والطعام",
    "type": "living-dining",
    "floor": "ground",
    "status": "requirements-added",
    "description": (
        "Open-plan living & dining (Confirmed). Space 3 in the house (Confirmed). "
        "Orientation: north is connected to the house entrance / side corridor, west is the Majlis side (Confirmed). "
        "Adjacent: West — Majlis; East — kitchen and backyard direction; North — side corridor and living-room entrance; South — stairs and bathroom (house-layout.md). "
        "Shape: approximately rectangular with a stepped ceiling and opening zones (Estimated)."
    ),
    # CONFLICT 1: house-layout.md says Confirmed, living-room.md says Estimated → Estimated until confirmed.
    "geometry": rect(8.2, 6.5, E, "8.2 × 6.5 m (~53.3 m²) — Estimated (living-room.md); house-layout.md lists it as plan dimensions. CONFLICT 1: marked Estimated until you confirm. Which side is east–west is not documented."),
    "walls": {
        "N": {
            "notes": "Length: Unknown. Height: Unknown. AC units: locations, sizes and heights Unknown. Fixed: the TV wall after the corridor entrance zone (Confirmed). No wall dividers between the glass pieces — must preserve.",
            "design": {
                "cladding": "Full-wall shiplap / شيبورد cladding (Confirmed)",
                "tv": "Wall-mounted TV with a floating console under it; console limited to the TV area and must not extend under the AC units (Confirmed)",
                "lighting": "No decorative lighting, no LED strips or backlighting (Rejected)",
                "other": "No shelves. No decorative divisions interrupting the wall treatment.",
            },
        },
        "S": {
            "notes": "Length, height, doors, windows, AC and fixed elements: Unknown.",
            "design": {"furniture": "Seating area and furniture must not block circulation (general furniture layout Confirmed; wall details Unknown)."},
        },
        "E": {
            "notes": "Length: Unknown. Height: Unknown. AC: Unknown. Solid wall section between the backyard glass group and the kitchen door (Confirmed). Backyard door and its two glass panes are visually connected with no wall dividers between the glass — must preserve.",
            "design": {"other": "Keep the openings as they are; kitchen door is a sliding door on the same plane as the glass group; no dividers between the glass."},
        },
        "W": {
            "notes": "Length: Unknown. Height: Unknown. Windows: Unknown. AC: Unknown. Dining-area side (Confirmed). Connection toward the Majlis (Confirmed); exact opening details Unknown.",
            "design": {"furniture": "Dining table zone. Keep easy movement from the Majlis toward the stairs, bathroom and kitchen."},
        },
    },
    "elements": [
        {"type": "door", "subtype": "Single door", "label": "Side corridor entrance (glass door) — باب الممر الجانبي", "wall": "N", "status": C, "preserve": True,
         "notes": "Glass door from the north side corridor. Visually connected to the two north glass panes. Width, height and position from corner Unknown."},
        {"type": "window", "subtype": "Fixed glazing", "label": "North vertical glass pane 1", "wall": "N", "status": C, "preserve": True,
         "notes": "One of two vertical glass panes beside the corridor door; no wall dividers between the glass pieces. Size and position Unknown. CONFLICT 4: house-layout.md only mentions the east (backyard) windows."},
        {"type": "window", "subtype": "Fixed glazing", "label": "North vertical glass pane 2", "wall": "N", "status": C, "preserve": True,
         "notes": "Second vertical glass pane beside the corridor door. Size and position Unknown. CONFLICT 4."},
        {"type": "door", "subtype": "Single door", "label": "Backyard entrance (glass door) — مدخل الفناء الخلفي", "wall": "E", "status": C, "preserve": True,
         "notes": "Glass door to the backyard. Width, height and position from corner Unknown."},
        {"type": "window", "subtype": "Fixed glazing", "label": "East vertical glass pane 1 (beside backyard door)", "wall": "E", "status": C, "preserve": True,
         "notes": "One of two vertical glass panes next to the backyard entrance, visually continuous with it, no wall dividers. Size and sill Unknown. house-layout.md: long vertical windows facing the backyard; operable section exists, configuration Unknown."},
        {"type": "window", "subtype": "Fixed glazing", "label": "East vertical glass pane 2 (beside backyard door)", "wall": "E", "status": C, "preserve": True,
         "notes": "Second vertical glass pane next to the backyard entrance. Size and sill Unknown."},
        {"type": "door", "subtype": "Sliding door", "label": "Kitchen sliding door — باب المطبخ", "wall": "E", "status": C, "preserve": True, "swing": "sliding",
         "notes": "Sliding door to the kitchen, on the same level/plane as the glass group, with a solid wall section between it and the backyard glazing. Width and height Unknown."},
        {"type": "door", "subtype": "Opening (no door)", "label": "Connection toward the Majlis", "wall": "W", "status": C, "preserve": True, "swing": "opening",
         "notes": "Connection toward the Majlis is Confirmed; exact opening type, size and position Unknown."},
    ],
    "layout": [],
    "requirements": living_requirements + living_rejected,
    "constraints": living_constraints,
    "direction": living_direction,
    "library": [
        {"name": n, "category": cat, "notes": f"Position: {pos}. Status: {st}. Dimensions Unknown. (living-room.md)"}
        for (n, cat, pos, st) in living_furniture
    ],
    "missing": [f"{grp}: {item}" for grp, items in living_missing.items() for item in items],
    "photos": [
        {"file": "غرفة المعيشة - المدخل من الممر الجانبي.jpg", "wall": "N", "note": "View from the side corridor entrance into the living room."},
        {"file": "غرفة المعيشة - جدار التلفاز ما بين نوافذ الفناء الخلفي والمدخل.jpg", "wall": "N", "note": "TV wall and its relationship to the backyard windows and entrance."},
        {"file": "غرفة المعيشة - المدخل والنوافذ على الفناء الخلفي.jpg", "wall": "E", "note": "Backyard entrance and glazing."},
    ],
}

# ---------------------------------------------------------------------------
# Main Kitchen  (kitchen.md is authoritative)
# ---------------------------------------------------------------------------

K = f"{KITCHEN} — Requirements"


def kreq(title, description, category, priority, src):
    return req(title, description, CAT[category], PRI[priority], source=f"{K}. Source: {src}", notes=f"Source category: {category}")


kitchen_requirements = [
    kreq("Main kitchen expansion", "Merge the cancelled frying-kitchen area into the main kitchen, final size 5.4 × 4.3 m", "Layout/Space", "Must Have", "your explicit dimension agreement"),
    kreq("Rectangular footprint", "Maintain a rectangular 5.4 × 4.3 m room", "Layout", "Must Have", "agreed final dimensions"),
    kreq("Central island", "Include an island centered in the kitchen, 2.2 × 1.0 m", "Layout", "Must Have", "your approval of the revised island dimensions"),
    kreq("Functional circulation", "Preserve practical circulation around the island", "Layout", "Must Have", "discussion about reducing island size to improve movement; clearance values estimated"),
    kreq("North wall window", "Preserve the existing square window and keep the wall open visually", "Architectural", "Must Have", "your description"),
    kreq("Backyard glass door", "Keep the backyard entrance on the north wall, at its eastern corner", "Architectural", "Must Have", "your corrections"),
    kreq("Living-room sliding door", "Keep the sliding entrance on the west wall, at its northwest end, north of the refrigerator", "Architectural", "Must Have", "repeated explicit corrections"),
    kreq("North-wall lower cabinetry", "Install lower cabinets with countertop only, without upper cabinets", "Cabinetry", "Must Have", "your explicit instruction"),
    kreq("North-wall coffee station", "Place the coffee machine on the north countertop", "Appliances", "Must Have", "your instruction"),
    kreq("North decorative shelves", "Install wooden open shelves in the spaces around the window and doors", "Decor", "Preferred", "your instruction"),
    kreq("Climbing plants", "Use small plants and climbing greenery on the north shelves", "Decor", "Preferred", "your instruction"),
    kreq("West tall-unit wall", "Use the west wall for tall storage and refrigerator/freezer instead of a normal worktop", "Storage", "Must Have", "approved west-wall design"),
    kreq("West refrigerator", "Include a tall refrigerator", "Appliances", "Must Have", "west-wall design"),
    kreq("West freezer", "Include a separate tall freezer adjacent to the refrigerator", "Appliances", "Must Have", "west-wall design"),
    kreq("West light-colored tall cabinets", "Make the west wall's vertical storage units light-colored rather than wood-colored", "Cabinetry", "Must Have", "your explicit correction"),
    kreq("Southwest pantry", "Include a pantry integrated into the southwest corner, connected to the kitchen storage/counter layout", "Storage", "Must Have", "your correction to the layout"),
    kreq("South-wall cabinetry", "Install both upper and lower cabinets on the south wall", "Cabinetry", "Must Have", "your agreed wall layout"),
    kreq("South-wall sink", "Include one large, single-bowl sink on the south wall", "Plumbing", "Must Have", "your explicit specification"),
    kreq("Dishwasher placement", "Install dishwasher immediately east of the sink", "Appliances", "Must Have", "your explicit specification"),
    kreq("East-wall cabinetry", "Include upper and lower cabinets and a worktop", "Cabinetry", "Must Have", "your approved east-wall design"),
    kreq("East-wall cooktop", "Install a gas cooktop centrally within the east-wall cooking zone", "Appliances", "Must Have", "approved design"),
    kreq("Built-in oven", "Use a built-in oven arrangement under the cooktop", "Appliances", "Preferred", "your explicit preference"),
    kreq("Drawer above oven", "Include a pull-out drawer between the cooktop and oven", "Storage/Appliances", "Must Have", "your correction"),
    kreq("Range hood", "Install a hood above the east-wall gas cooktop", "Ventilation", "Must Have", "your specification"),
    kreq("East corner appliance storage", "Provide a corner storage area for small appliances, with an aluminum-covered corner treatment", "Storage", "Must Have", "your explicit correction"),
    kreq("Connected perimeter corners", "Keep cabinetry/worktops connected around corners wherever possible, except at the living-room entrance and backyard entrance", "Layout", "Must Have", "your explicit instruction"),
    kreq("Taj Mahal porcelain", "Use Taj Mahal color/appearance porcelain for the countertop", "Material", "Must Have", "your explicit material selection"),
    kreq("Wood-look aluminum cabinetry", "Use aluminum cabinetry with wood-like appearance for selected cabinet finishes", "Material", "Must Have", "your material list"),
    kreq("Cabinet color reversal", "Upper cabinets are wood-colored; lower cabinets are light-colored", "Color", "Must Have", "your explicit reversal"),
    kreq("Parquet floor", "Use the same flooring as the living room", "Flooring", "Must Have", "your explicit instruction"),
    kreq("Gypsum ceiling", "Install a gypsum ceiling", "Ceiling", "Must Have", "your specification"),
    kreq("Square ceiling AC opening", "Provide a square AC opening centered in the kitchen ceiling", "HVAC", "Must Have", "your specification"),
]
KR = f"{KITCHEN} — Rejected ideas"
kitchen_rejected = [
    rejected("Retaining a separate frying kitchen", "Rejected. Its area was merged into the main kitchen.", "layout", KR),
    rejected("Original smaller kitchen dimensions of 3.7 × 4.3 m", "Superseded by 5.4 × 4.3 m.", "layout", KR),
    rejected("Island at 2.4 × 1.0 m", "Superseded; revised to 2.2 × 1.0 m.", "layout", KR),
    rejected("Upper cabinets on north wall", "Rejected; north wall is lower cabinets only.", "storage", KR),
    rejected("Sink on north wall", "Rejected; sink belongs on south wall.", "functional", KR),
    rejected("Dishwasher on north wall", "Rejected.", "furniture", KR),
    rejected("Sink on east wall", "Rejected.", "functional", KR),
    rejected("Dishwasher or washing machine on east wall", "Rejected; that area is cabinetry/worktop only.", "furniture", KR),
    rejected("Living-room sliding door on east wall", "Rejected; it belongs on west wall.", "architectural", KR),
    rejected("Living-room sliding door at the wrong end of west wall", "Rejected; it must be at the northwest end, north of the refrigerator.", "architectural", KR),
    rejected("Backyard entrance on east wall", "Rejected; it is on the north wall at the northeast corner.", "architectural", KR),
    rejected("Wrong placement/orientation of the backyard door", "Rejected; door and window are on the same north-wall plane.", "architectural", KR),
    rejected("Wood-colored west tall storage", "Rejected; west tall units must be light-colored.", "colors", KR),
    rejected("Disconnected perimeter corners", "Rejected, except where the living-room sliding door and backyard entrance interrupt the cabinetry.", "layout", KR),
    rejected("Incorrect island/circulation proportions", "Rejected; island size was reduced to improve circulation.", "layout", KR),
]
kitchen_constraints = [
    "Final room size: 5.4 × 4.3 m",
    "Frying kitchen is cancelled and merged into the main kitchen",
    "North wall length: 5.4 m",
    "South wall length: 5.4 m",
    "East wall length: 4.3 m",
    "West wall length: 4.3 m",
    "Square window on north wall",
    "Backyard glass door at northeast end of the north wall",
    "Living-room sliding door at northwest end of west wall",
    "Sliding door must be north of the refrigerator",
    "Island: 2.2 × 1.0 m",
    "Pantry at southwest corner",
    "North wall has lower cabinets only",
    "Coffee machine on north-wall countertop",
    "Decorative shelves and plants on north wall",
    "West wall refrigerator + freezer + tall storage",
    "West tall cabinetry is light-colored, not wood",
    "South wall sink and dishwasher",
    "Dishwasher east of the sink",
    "East wall gas cooktop + hood",
    "Built-in oven below cooktop",
    "Pull-out drawer between cooktop and oven",
    "East corner small-appliance storage",
    "Perimeter corners connected except at the two door areas",
    "Taj Mahal porcelain countertop",
    "Wood-colored upper cabinets and light-colored lower cabinets",
    "Same parquet floor as living room",
    "Gypsum ceiling with a square centered AC opening",
]
kitchen_direction = {
    "style": "Warm, natural, classic-inspired kitchen (Estimated interpretation of approved reference/design direction)",
    "atmosphere": "",
    "palette": [],
    "paletteNotes": (
        "No HEX codes in the kitchen file. Upper cabinets: warm oak / natural wood look (Confirmed). Lower cabinets: light beige / creamy neutral (Confirmed). "
        "West tall units: light color, not wood (Confirmed). Exact wood shade and lower-cabinet color code Unknown."
    ),
    "materials": (
        "Aluminum cabinetry with wood-look finish where applicable (Confirmed material direction). Countertop: Taj Mahal-colored porcelain (Confirmed; exact slab/sample Unknown). "
        "Backsplash: coordinated light backsplash (Estimated; material/pattern unconfirmed). Handles: warm metal/brass-style (Estimated)."
    ),
    "woodType": "Warm oak / natural wood look for upper cabinets (exact finish/species Unknown)",
    "flooring": "Same parquet flooring as the living room (Confirmed)",
    "wallFinishes": "",
    "furnitureStyle": "U-shaped perimeter kitchen with a central island (Confirmed).",
    "lighting": "Exact lighting plan not approved (Unknown). Under-cabinet lighting appears in generated concepts but is not approved (Unknown).",
    "curtains": "",
    "description": "Gypsum ceiling (Confirmed) with a square AC opening centered in the ceiling (Confirmed design requirement; AC type/model Unknown).",
    "avoid": "",
}
kitchen_library = [
    ("Kitchen island", "island", 2.2, 1.0, "Center of kitchen. Size 2.2 × 1.0 m Confirmed; position Estimated (centered). Countertop: Taj Mahal porcelain. Seating: 3 stools along one long side — Estimated. Storage Unknown."),
    ("Refrigerator (tall)", "storage", None, None, "West wall, south of living-room door. Size Unknown. Included."),
    ("Freezer (tall)", "storage", None, None, "West wall, next to refrigerator. Size Unknown. Included."),
    ("Gas cooktop", "other", None, None, "East wall, central cooking zone. Size Unknown. Included."),
    ("Built-in oven", "other", None, None, "East wall, below cooktop. Size Unknown. Included."),
    ("Range hood", "other", None, None, "East wall, above cooktop. Size Unknown. Included."),
    ("Pull-out drawer (between cooktop and oven)", "storage", None, None, "East wall. Size Unknown. Included."),
    ("Dishwasher", "other", None, None, "South wall, east of sink. Size Unknown. Included."),
    ("Sink — one large single-bowl", "other", None, None, "South wall. Size Unknown. Included."),
    ("Coffee machine", "other", None, None, "North-wall countertop. Size Unknown. Included."),
    ("Microwave", "other", None, None, "No dedicated position confirmed. Unknown."),
    ("Small appliances", "other", None, None, "East-side appliance corner storage. Various. Included."),
    ("Island stools", "chair", None, None, "Along one long side of the island; 3 stools — Estimated (not explicitly confirmed)."),
]
kitchen_missing = {
    "Room & architecture": [
        "Ceiling height", "Exact square window width and height", "Window sill height", "Window frame/material/color",
        "Exact window opening mechanism (design request: open from half)", "Exact backyard glass-door width and height",
        "Backyard glass-door frame, swing/slider mechanism", "Exact living-room sliding door dimensions",
        "Structural details of the removed/merged frying kitchen wall", "Actual wall construction/thickness",
    ],
    "Cabinet dimensions": [
        "Base cabinet height", "Base cabinet depth", "Upper cabinet height and depth", "Tall storage unit heights/depths",
        "Refrigerator and freezer widths and heights", "Pantry dimensions, shelf configuration and door type",
        "Small-appliance corner cabinet dimensions and internal configuration", "Open shelf dimensions, number of shelves and spacing",
        "Exact cabinet aluminum profile/design", "Exact wood finish/species/texture/color code", "Exact light cabinet color/HEX/RAL code",
        "Cabinet internal accessories and drawer configuration",
    ],
    "Island": [
        "Island storage configuration", "Island seating quantity (Estimated at 3, not confirmed)", "Seating side (not formally locked)",
        "Final island location relative to exact walls (Estimated)", "Island overhang dimensions", "Island electrical outlets",
    ],
    "Appliances": [
        "Refrigerator make/model/size", "Freezer make/model/size", "Cooktop width, number of burners, model", "Built-in oven dimensions/model",
        "Range hood type, width, capacity, duct route", "Dishwasher size/model", "Coffee machine model/size", "Microwave location",
        "Small-appliance inventory for corner storage",
    ],
    "Services & technical": [
        "Exact sink position and cutout dimensions", "Sink model and faucet", "Water supply location", "Drain location",
        "Dishwasher water/drain connections", "Gas supply point location on east wall", "Gas shut-off arrangement", "Electrical outlet positions",
        "Appliance-specific electrical loads/circuits", "Coffee machine electrical outlet", "Refrigerator/freezer electrical outlets",
        "Island power/data connections", "Hood duct/exhaust route", "AC capacity/model", "Exact square AC opening dimensions",
        "Ceiling height/drop and gypsum details",
    ],
    "Finish & design details": [
        "Exact Taj Mahal porcelain product, slab/sample, and finish", "Countertop thickness and edge profile", "Backsplash material and height",
        "Exact wood cabinet shade", "Exact lower-cabinet shade", "Handles/knobs selection", "Metal finish (brass, bronze, stainless, etc.)",
        "Lighting type and color temperature", "Under-cabinet lighting (not approved)", "Decorative styling and final plant selection",
        "Grout color, if applicable",
    ],
    "Clearances (estimated from layout, to recalculate)": [
        "North of island ≈ 1.1 m (Estimated)", "South of island ≈ 1.1 m (Estimated)", "West of island ≈ 1.0 m (Estimated)", "East of island ≈ 1.1 m (Estimated)",
    ],
}

kitchen = {
    "key": "kitchen",
    "name": "Main Kitchen",
    "nameAr": "المطبخ الرئيسي",
    "type": "kitchen",
    "floor": "ground",
    "status": "requirements-added",
    "description": (
        "Rectangular (Confirmed). The frying kitchen (مطبخ القلي) was cancelled and its area incorporated into the main kitchen (Confirmed). "
        "Original dimensions before expansion 3.7 × 4.3 m, superseded. Exact structural wall removal details Unknown. "
        "Layout: U-shaped perimeter kitchen with central island (Confirmed). "
        "CONFLICT 2: house-layout.md places the backyard east of the living room/kitchen; kitchen.md puts the backyard door and window on the kitchen's north wall and the east wall solid."
    ),
    "geometry": rect(5.4, 4.3, C, "Final agreed dimensions 5.4 × 4.3 m (23.22 m²) — Confirmed. North/South walls = 5.4 m, East/West walls = 4.3 m."),
    "walls": {
        "N": {
            "notes": "Length 5.4 m (Confirmed). Height Unknown. Gas: no confirmed point (Unknown). Electrical: required for coffee machine, locations Unknown. Plumbing/drainage: none confirmed (Unknown). Hood: none.",
            "design": {
                "furniture": "Base cabinets with continuous countertop sections where possible; NO upper cabinets; coffee station on the countertop. No sink, no dishwasher.",
                "other": "Decorative wooden open shelves between the window and door / remaining spaces toward the living-room side, with climbing plants / small greenery. Lower cabinetry only, open and visually light.",
            },
        },
        "S": {
            "notes": "Length 5.4 m (Confirmed). Height Unknown. Windows: none (blank wall, Confirmed). Doors: none documented (Unknown). AC: none specified (Unknown). Plumbing: sink requires services, exact location not documented. Hood: none.",
            "design": {
                "furniture": "Zone (no sizes): base + upper cabinets; Taj Mahal countertop continuous with the east-wall counter; one large single-bowl sink; dishwasher immediately east of the sink.",
            },
        },
        "E": {
            "notes": "Length 4.3 m (Confirmed). Height Unknown. Doors: none. Windows: none. AC: none specified (Unknown). Gas point required for cooktop, exact position Unknown. No plumbing planned.",
            "design": {
                "furniture": "Zone (no sizes): base + upper cabinets and worktop connected to the south counter; gas cooktop centered in the wall composition; pull-out drawer between cooktop and built-in oven; hood above the cooktop; covered aluminum corner storage for small appliances.",
            },
        },
        "W": {
            "notes": "Length 4.3 m (Confirmed). Height Unknown. Windows: none specified (Unknown). AC: none specified (Unknown). No plumbing, no hood. Not a working countertop wall.",
            "design": {
                "furniture": "Sequence north → south (no sizes): 1. sliding living-room door, 2. refrigerator, 3. freezer, 4. tall storage cabinetry (light-colored, not wood), 5. pantry in the southwest corner.",
            },
        },
    },
    "elements": [
        {"type": "window", "subtype": "Window", "label": "Square window (backyard)", "wall": "N", "status": C, "preserve": True,
         "notes": "Square window, approximately centered on the north wall — location Confirmed; width, height, sill and frame Unknown. Design request: opens from half (mechanism Unknown)."},
        {"type": "door", "subtype": "Single door", "label": "Backyard glass door", "wall": "N", "status": C, "preserve": True,
         "notes": "Glass door at the eastern corner (northeast end) of the north wall, same plane as the window. Width, height, frame and swing/slider Unknown."},
        {"type": "door", "subtype": "Sliding door", "label": "Living-room sliding door", "wall": "W", "status": C, "preserve": True, "swing": "sliding",
         "notes": "At the northwest end/corner of the west wall, north of the refrigerator (Confirmed, repeatedly corrected). Dimensions Unknown."},
        {"type": "ac", "subtype": "", "label": "Ceiling AC opening (square, centered)", "placement": "free", "center": True, "status": C, "preserve": False,
         "notes": "Square opening centered in the gypsum ceiling — Confirmed design requirement (planned). Opening size, AC type/model and capacity Unknown."},
    ],
    "layout": [
        {"name": "Kitchen island", "category": "island", "widthM": 2.2, "depthM": 1.0, "center": True, "dimsStatus": "confirmed",
         "notes": "Size 2.2 × 1.0 m Confirmed. Position Estimated (centered in the kitchen). Clearances ≈ 1.0–1.1 m are layout estimates, not measurements.",
         "library": "Kitchen island"},
    ],
    "requirements": kitchen_requirements + kitchen_rejected,
    "constraints": kitchen_constraints,
    "direction": kitchen_direction,
    "library": [
        {"name": n, "category": cat, "width": w, "depth": d, "notes": f"{note} (kitchen.md)"} for (n, cat, w, d, note) in kitchen_library
    ],
    "missing": [f"{grp}: {item}" for grp, items in kitchen_missing.items() for item in items],
    "photos": [
        {"file": "المطبخ - نافذة مطلة على الفناء الخلفي.jpg", "wall": "N", "note": "Original kitchen window facing the backyard."},
        {"file": "المطبخ - مدخل من الفناء الخلفي.jpg", "wall": "N", "note": "Original backyard entrance to the kitchen."},
    ],
}

# ---------------------------------------------------------------------------
# Other spaces  (house-layout.md)
# ---------------------------------------------------------------------------

H = f"{HOUSE}"


def simple(key, name, nameAr, type_, floor, L_, W_, cert, source, description, missing, status="not-started"):
    return {
        "key": key,
        "name": name,
        "nameAr": nameAr,
        "type": type_,
        "floor": floor,
        "status": status,
        "description": description,
        "geometry": rect(L_, W_, cert, source) if L_ is not None else {"shape": "rectangle", "length": dim(None, U), "width": dim(None, U), "source": source},
        "walls": {w: {"notes": "Length Unknown. Height Unknown. Doors, windows and AC on this wall Unknown.", "design": {}} for w in "NESW"},
        "elements": [],
        "layout": [],
        "requirements": [],
        "constraints": [],
        "direction": None,
        "library": [],
        "missing": ["Ceiling height"] + [m for m in missing if m.lower() != "ceiling height"],
        "photos": [],
    }


ORIENT = " Which side is east–west is not documented."
others = [
    simple("garage", "Garage & Entrance", "الكراج والمدخل", "garage", "ground", 11.6, 5.9, C,
           "11.6 × 5.9 m — dimensions confirmed by user's revision." + ORIENT,
           "Garage + entrance (Confirmed). Shape: rectangular (Estimated from plan). Entrance connects into the house — Confirmed in layout; exact walls Unknown. Main entrance at the garage/entry area on the west/front side — exact door position Unknown. Status: layout confirmed; detailed design Unknown.",
           split("Exact garage width/depth split, door location and dimensions, ceiling height, AC, columns, structural beams")),
    simple("majlis", "Majlis", "المجلس", "majlis", "ground", 4, 9.4, C, "4 × 9.4 m — dimensions from plan." + ORIENT,
           "Guest reception (Confirmed). Shape: rectangular (Estimated). Living room to the east — Confirmed; other shared walls Unknown. Guest entrance details Unknown; dedicated Majlis entrance not confirmed. Status: layout confirmed; design Unknown.",
           split("Entrance location and dimensions, windows, AC, ceiling height, exact adjacent wall configuration, structural columns")),
    simple("majlis-bath", "Majlis Bathroom", "حمام المجلس", "bathroom", "ground", 1.8, 2.6, C, "1.8 × 2.6 m — plan dimensions." + ORIENT,
           "Guest bathroom (Confirmed). Shape: rectangular (Estimated). Majlis vicinity — Confirmed by plan; exact wall relationships Unknown. Plumbing fixture layout Unknown. Status: layout confirmed; design Unknown.",
           split("Door position/dimensions, window, ceiling height, plumbing layout, ventilation, AC")),
    simple("living-bath", "Living Room Bathroom", "حمام الصالة", "bathroom", "ground", 1.85, 2.6, C, "1.85 × 2.6 m — plan dimensions." + ORIENT,
           "Bathroom (Confirmed). Shape: rectangular (Estimated). South side service area near the stairs — Confirmed generally; exact shared walls Unknown. Bathroom door referenced in video 3; wall, position and size Unknown. Status: layout confirmed; design Unknown.",
           split("Exact door position/dimensions, window, ventilation, ceiling height, fixtures layout")),
    simple("suite", "Private Suite", "الجناح الخاص", "bedroom", "ground", 4.1, 6.7, C, "4.1 × 6.7 m — original plan dimensions." + ORIENT,
           "Private bedroom suite (Confirmed). Shape: rectangular (Estimated). Closet and private bathroom form part of the suite — Confirmed; exact wall arrangement Unknown. Status: layout confirmed; interior design Unknown.",
           split("Ceiling height, door dimensions/positions, windows and measurements, AC, structural features")),
    simple("suite-closet", "Private Suite Closet", "غرفة ملابس الجناح الخاص", "other", "ground", 3.9, 2.6, C, "3.9 × 2.6 m — plan dimensions." + ORIENT,
           "Walk-in closet / dressing room (Confirmed). Shape: rectangular (Estimated). Associated with the Private Suite — Confirmed; exact shared walls Unknown. Built-in wardrobe configuration Unknown. Status: layout confirmed; design Unknown.",
           split("Door details, window, ceiling height, wardrobe layout, AC")),
    simple("suite-bath", "Private Suite Bathroom", "حمام الجناح الخاص", "bathroom", "ground", 2.6, 3.9, C, "2.6 × 3.9 m — plan dimensions." + ORIENT,
           "Private bathroom (Confirmed). Shape: rectangular (Estimated). Private suite/closet vicinity — Confirmed generally; exact walls Unknown. Plumbing layout Unknown. Status: layout confirmed; design Unknown.",
           split("Door, window, ventilation, ceiling height, plumbing and fixture layout")),
    simple("backyard", "Backyard", "الفناء الخلفي", "backyard", "ground", 7, 5.4, C, "7 × 5.4 m — revised user dimensions." + ORIENT,
           "Outdoor courtyard/backyard (Confirmed). Shape: rectangular (Estimated). East of the living room and kitchen — Confirmed (house-layout.md; see CONFLICT 2). Kitchen access/glass entrance — Confirmed; living-room windows face the backyard — Confirmed; sizes Unknown. Status: dimensions confirmed; landscaping/design Unknown.",
           split("Exact boundary shape, levels, drainage, landscaping, privacy screens, outdoor lighting, outdoor AC units")),
    simple("north-corridor", "North Side Corridor", "الممر الجانبي الشمالي", "corridor", "ground", 1.9, 23, C, "1.9 × 23 m — user-revised dimensions." + ORIENT,
           "Side access passage (Confirmed). Long linear corridor (Confirmed/Estimated). Runs from the entry area toward the backyard on the north side — Confirmed. Living-room entrance from the corridor — Confirmed; other door details Unknown. Status: route and dimensions confirmed; detailed design Unknown.",
           split("Gate/door details, levels, drainage, lighting, wall heights, overhead cover, fixed elements")),
    simple("bedroom-1", "Bedroom 1", "غرفة النوم 1", "bedroom", "first", 3.9, 4.9, C, "3.9 × 4.9 m — plan." + ORIENT,
           "Bedroom (Confirmed). Shape: rectangular (Estimated). Bedroom 2 and shared bathroom in the same bedroom zone — plan; exact walls Unknown. Status: layout confirmed; design Unknown.",
           split("Ceiling height, doors, windows and their measurements, AC, structural elements, exact adjacency")),
    simple("bedroom-2", "Bedroom 2", "غرفة النوم 2", "bedroom", "first", 3.9, 4.9, C, "3.9 × 4.9 m — plan." + ORIENT,
           "Bedroom (Confirmed). Shape: rectangular (Estimated). Bedroom 1 and shared bathroom vicinity — plan; exact walls Unknown. Status: layout confirmed; design Unknown.",
           split("Ceiling height, doors, windows and their measurements, AC, structural elements, exact adjacency")),
    simple("bedrooms-bath", "Shared Bedroom Bathroom", "حمام الغرف", "bathroom", "first", 2.3, 2.5, C, "2.3 × 2.5 m — plan." + ORIENT,
           "Shared bathroom (Confirmed). Shape: rectangular (Estimated). Bedroom zone — Confirmed generally; exact shared walls Unknown. Plumbing layout Unknown. Status: layout confirmed; design Unknown.",
           split("Door, window, ventilation, ceiling height, plumbing fixtures, exact adjacency")),
    simple("master", "Master Bedroom", "غرفة النوم الرئيسية", "master-bedroom", "first", 9.4, 4, C, "9.4 × 4 m — revised by user." + ORIENT,
           "Master bedroom (Confirmed). Shape: rectangular (Estimated). Master bathroom adjacent — Confirmed; exact shared walls Unknown. Status: revised dimensions confirmed; interior design Unknown.",
           split("Ceiling height, doors and their measurements, windows and sill heights, AC, columns/beams, detailed room configuration")),
    simple("master-bath", "Master Bathroom", "حمام غرفة النوم الرئيسية", "bathroom", "first", 1.8, 2.4, C, "1.8 × 2.4 m — plan." + ORIENT,
           "Private master bathroom (Confirmed). Shape: rectangular (Estimated). Master bedroom adjacent — Confirmed; exact walls Unknown. Plumbing layout Unknown. Status: layout confirmed; design Unknown.",
           split("Door, window, ventilation, ceiling height, plumbing and fixture arrangement")),
    simple("upper-lounge", "Upper Lounge", "الصالة العلوية", "family-lounge", "second", 4.7, 6.7, C, "4.7 × 6.7 m — revised table." + ORIENT,
           "Family lounge (Confirmed). Shape: rectangular (Estimated). Upper floor hallway, service rooms and terrace nearby — plan; exact walls Unknown. Status: layout confirmed; design Unknown.",
           split("Ceiling height, door dimensions, window dimensions, AC locations, structural columns/beams")),
    simple("upper-lounge-bath", "Upper Lounge Bathroom", "حمام الصالة العلوية", "bathroom", "second", 2.3, 2.6, C, "2.3 × 2.6 m — plan." + ORIENT,
           "Bathroom (Confirmed). Shape: rectangular (Estimated). Upper lounge and service zone — plan; exact walls Unknown. Plumbing layout Unknown. Status: layout confirmed; design Unknown.",
           split("Door, window, ventilation, ceiling height, plumbing details")),
    simple("hallway", "Hallway", "الردهة", "corridor", "second", 1.6, 3.3, C, "1.6 × 3.3 m — plan." + ORIENT,
           "Hallway / circulation (Confirmed). Shape: linear/rectangular (Estimated). Upper lounge and service rooms — plan; exact wall relationships Unknown. Status: layout confirmed; design Unknown.",
           split("Ceiling height, doors, windows, AC, exact circulation dimensions")),
    simple("laundry", "Laundry Room", "غرفة الغسيل", "laundry", "second", 3.5, 3.4, C, "3.5 × 3.4 m — plan." + ORIENT,
           "Laundry / utility (Confirmed). Shape: rectangular (Estimated). Service area and hallway — plan; exact shared walls Unknown. Washer, dryer, sink and storage locations Unknown. Status: layout confirmed; design Unknown.",
           split("Door/window, ventilation, ceiling height, appliance and sink arrangement, drainage")),
    simple("maid", "Maid's Room", "غرفة العاملة المنزلية", "bedroom", "second", 1.8, 3.2, C, "1.8 × 3.2 m — plan." + ORIENT,
           "Bedroom (Confirmed). Shape: rectangular (Estimated). Maid's bathroom and service zone — plan; exact shared walls Unknown. Status: layout confirmed; design Unknown.",
           split("Ceiling height, door, windows, AC, structural elements")),
    simple("maid-bath", "Maid's Bathroom", "حمام العاملة المنزلية", "bathroom", "second", 1.85, 2.6, C, "1.85 × 2.6 m — plan." + ORIENT,
           "Bathroom (Confirmed). Shape: rectangular (Estimated). Maid's room and service zone — plan; exact shared walls Unknown. Plumbing layout Unknown. Status: layout confirmed; design Unknown.",
           split("Door, window, ventilation, ceiling height, plumbing layout")),
    simple("rear-terrace", "Rear Terrace", "السطح الخلفي", "roof-terrace", "second", 3.6, 4.5, C, "3.6 × 4.5 m — plan dimensions." + ORIENT,
           "Outdoor terrace/roof (Confirmed). Shape: rectangular (Estimated). Upper floor — plan; exact boundary relationships Unknown. Parapet, shading, landscaping and other features Unknown. Status: layout confirmed; design Unknown.",
           split("Parapet heights, drainage, waterproofing, door, shading, AC units, final outdoor arrangement")),
    simple("stairs", "Staircase", "الدرج", "stairs", "ground", None, None, U, "Dimensions Unknown.",
           "Internal staircase connecting the floors (Confirmed by plan). Shape Unknown. South side of the living room — Confirmed (user message). Stair configuration and landing details visible in plan; exact structural data Unknown. Status: location confirmed; details Unknown.",
           split("Exact width, tread/riser measurements, number of steps, landings, railing, headroom, structural details")),
    simple("west-facade", "West Façade", "الواجهة الغربية", "front-facade", None, None, None, U, "Overall façade dimensions Unknown.",
           "Street-facing façade, exterior spanning the floors (Confirmed). Precise geometry Unknown. Majlis side is west — Confirmed. Original façade image available; no approved façade modifications documented.",
           split("Overall dimensions, material specifications, exact openings and door measurements, elevations, lighting")),
]

# Ceiling height is "Unknown" for every room; outdoor spaces note "Not applicable/Unknown".
for r in others:
    if r["type"] in ("backyard", "roof-terrace", "front-facade"):
        r["missing"] = [m for m in r["missing"] if m != "Ceiling height"]

rooms = [living, kitchen] + others
# Order as listed in house-layout.md (spaces 1–25).
ORDER = ["garage", "majlis", "majlis-bath", "living-dining", "living-bath", "kitchen", "suite", "suite-closet", "suite-bath", "backyard",
         "north-corridor", "bedroom-1", "bedroom-2", "bedrooms-bath", "master", "master-bath", "upper-lounge", "upper-lounge-bath",
         "hallway", "laundry", "maid", "maid-bath", "rear-terrace", "stairs", "west-facade"]
rooms.sort(key=lambda r: ORDER.index(r["key"]))
assert len(rooms) == 25, len(rooms)

data = {
    "format": "bait-khuzam-import",
    "version": 1,
    "title": "Bait Khuzam — verified house data",
    "sources": [KITCHEN, LIVING, HOUSE],
    "project": {
        "name": "Bait Khuzam",
        "nameAr": "بيت خزام",
        "location": "Riyadh, Saudi Arabia",
        "locationAr": "الرياض",
        "description": (
            "Duplex villa — model نموذج عبية 2A–2B (Abiya 2A–2B). Total built-up area 430 m². 3 floors (ground, first, second). "
            "Street/front façade faces West. All Confirmed (plan / your messages)."
        ),
    },
    "floors": [
        {"key": "ground", "name": "Ground floor", "nameAr": "الدور الأرضي"},
        {"key": "first", "name": "First floor", "nameAr": "الدور الأول"},
        {"key": "second", "name": "Second floor", "nameAr": "الدور الثاني"},
    ],
    "house": {
        "decisions": [
            "House reference name: بيت خزام.",
            "Reference plan: نموذج عبية 2A–2B.",
            "West-facing street façade.",
            "Majlis is on the west side of the living room.",
            "Kitchen and backyard are on the east side of the living room.",
            "Side corridor runs north, from the entrance toward the backyard.",
            "Stairs and bathroom are south of the living room.",
            "Kitchen expansion approved: 5.4 × 4.3 m.",
            "Master bedroom dimensions revised to 9.4 × 4 m.",
            "Backyard revised to 7 × 5.4 m.",
            "Garage and entrance area: 11.6 × 5.9 m.",
            "North side corridor: 1.9 × 23 m.",
            "Exact plot compass/site orientation beyond these relationships: Unknown.",
            "Main entrance at the garage/entry area on the west/front side — exact door position Unknown.",
            "Majlis/guest entrance: Unknown. Service entrance: Unknown.",
        ],
        "removed": [
            "Fry Kitchen — مطبخ القلي: removed by your decision; its area was merged into the Main Kitchen.",
            "Balcony — الشرفة: removed from the revised layout.",
            "Front Roof/Terrace — السطح الأمامي: not included in the revised layout table.",
        ],
        "missing": [
            "Street boundary: boundary wall dimensions, gates, exact entry geometry",
            "Structural system: column coordinates/sizes, beams, load-bearing walls, slab details",
            "Ceiling heights: all floor-specific clear heights",
            "Levels: floor-to-floor heights, step levels, thresholds, courtyard/yard levels",
            "Doors throughout house: width, height, swing/sliding configuration, exact position measured from corners",
            "Windows throughout house: width, height, sill height, exact position and opening type",
            "AC throughout house: type, location, capacity, indoor/outdoor unit positions",
            "Services: plumbing, electrical, drainage, ventilation, and equipment locations",
        ],
    },
    "conflicts": [
        {"id": 1, "room": "living-dining", "title": "Living & Dining size: Confirmed or Estimated?",
         "detail": "house-layout.md lists 8.2 × 6.5 m as plan dimensions (Confirmed); living-room.md says Estimated (~53.3 m², not re-verified from plan). Imported as 8.2 × 6.5 m, marked Estimated until you confirm."},
        {"id": 2, "room": "kitchen", "title": "Backyard position relative to the kitchen",
         "detail": "house-layout.md: kitchen and backyard are on the east side of the living room. kitchen.md: the backyard door and window are on the kitchen's NORTH wall and the east wall is solid. Imported per kitchen.md (authoritative for the kitchen); not resolved."},
        {"id": 3, "room": "living-dining", "title": "Living palette",
         "detail": "house-layout.md: warm walnut wood, off-white, beige, natural fabric tones. living-room.md: warm beige, stone grey, natural wood + dusty pink, sage green, burgundy (with HEX codes). Imported the living-room.md palette; not resolved."},
        {"id": 4, "room": "living-dining", "title": "Living-room windows: east only, or north too?",
         "detail": "house-layout.md: long vertical windows face the backyard (east). living-room.md also has two vertical glass panes on the NORTH wall beside the corridor door. Both imported; not resolved."},
        {"id": 5, "room": "living-dining", "title": "Dining table for 8 people",
         "detail": "Only in house-layout.md. Added to Living & Dining as a Pending requirement."},
    ],
    "rooms": rooms,
}

text = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
OUT.write_text(text, encoding="utf-8")
# Same file bundled with the app (Settings → Data safety → Import & Merge → "Use the included house data").
PUBLIC = OUT.parent.parent / "public" / "import" / "bait-khuzam-import.json"
PUBLIC.parent.mkdir(parents=True, exist_ok=True)
PUBLIC.write_text(text, encoding="utf-8")
counts = {r["name"]: sum(1 for q in r["requirements"]) for r in rooms if r["requirements"]}
print("wrote", OUT, "rooms:", len(rooms), "requirements:", counts)
