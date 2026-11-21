# Bait Khuzam Studio

A private, local-first AI interior-design workspace for **Bait Khuzam** (Riyadh, Saudi Arabia). Each room has its own dimensions, architecture, requirements, design
direction, layout and design versions — and can be redesigned independently with an AI image-generation API you configure yourself.

The studio runs entirely on your computer. Your project lives in your browser's local database; nothing is uploaded anywhere except the images and text you choose to
send to the image provider when you click **Generate**. It does not use, connect to, or depend on ChatGPT.

---

## Quick start

Requirements: **Node.js 20 or newer** and a current Chrome, Edge, Safari or Firefox.

```bash
npm install
npm start          # builds and opens the studio at http://localhost:4173
```

For development with hot reload: `npm run dev` (http://localhost:5173).

Use a normal (not private/incognito) browser window — private windows can block or discard local storage. Keep using the same browser and address
(`localhost:4173` or `localhost:5173`): each address has its own separate local database.

## What's inside

| Section | What you can do |
| --- | --- |
| **Home** | Project overview with cover photo, room thumbnails, rooms being designed, recently updated rooms, pending tasks (your own + "needs attention" items derived from missing data), recent concepts, quick actions. |
| **My Rooms** | Gallery with cover, type, floor, dimensions, area, status, versions and last update. Create, edit, duplicate, change cover, delete (with confirmation and optional image clean-up). |
| **Room workspace** | Tabs for **Overview**, **Requirements**, **Dimensions**, **Architecture**, **Layout** (2D plan), **Walls**, **Direction**, **Photos & references** and **Versions**, plus a prominent **Redesign This Room** button. |
| **Floor Plans** | Floors, schematic placement of rooms (drawn from their own dimensions, placeholders when unknown), click a room to open it, optional uploaded architectural plan with two-point scale calibration. Always labelled *Schematic — Not to Scale* unless a calibrated plan is used. |
| **Design Studio** | Assembles the room's design package — room facts, confirmed architecture, a **DO NOT CHANGE** list, requirements with their images and captions, exclusions, the room's own direction, camera/light/lens/realism settings and your instructions — then generates through your provider and saves every result as a new version. |
| **Design Library** | All concepts across rooms; the full image/reference gallery (tags, search, links to rooms, requirements, walls and versions); comparison workspace (side-by-side for up to 4 images or slider, synced zoom/pan, full screen, notes, saved comparisons). |
| **Materials & Furniture** | Optional shared library with images, dimensions, material, colour, brand, product link, price and associated rooms. Furniture can be placed into any room's layout. |
| **Settings & Backup** | Project details, units, measurement defaults, optional house-wide guidelines (never applied unless a room opts in), image provider, optional text assistant, storage status, ZIP backup/restore and restore points. |

Search everything with **⌘K / Ctrl+K**.

### Principles built into the app

- **Every room is independent.** Directions, presets and palettes are per room. Presets are copied into a room only when you apply them; house-wide guidelines are
  opt-in per room.
- **Unknown stays unknown.** Every measurement and architectural element carries a status — *Confirmed*, *Estimated* or *Unknown*. Unknown values are never filled
  in; the prompt says they are unknown. Only confirmed elements are locked in the DO NOT CHANGE list; estimated ones are described as approximate.
- **Requirements drive the design.** Images attached to a requirement stay tied to it and are sent with a label such as
  *"Image 3 — Reference for the requirement 'Reading corner'"* or *"Example of what to AVOID"*.
- **No fake results.** Without a configured provider the Generate button is disabled; you can still copy the prompt or save a prompt-only version. Failed generations
  save nothing.
- **Nothing is moved silently.** The layout checker warns about overlaps, walls, door swings, windows, AC units and clearances, but never moves furniture.
- **Versions are never overwritten.** Approving a version keeps all earlier ones.

## Initial data

The repository contained no floor plans, measurements or photographs, so the studio was seeded only with information from the project brief:

- Project **Bait Khuzam**, **Riyadh, Saudi Arabia**.
- Rooms: Living & Dining, Kitchen, Majlis, Family Lounge, Master Bedroom, Children's Bedroom, Library, Backyard, Front Facade, Garage.
  ("Other bedrooms" were mentioned without a count, so none were invented — add them with **Add room**.)
- **All dimensions are Unknown** and no floor is assigned.
- Earlier conceptual directions (e.g. *"Warm minimalist, beige neutrals, wood cladding, restrained furniture"* for Living & Dining) are stored as an
  **"Earlier conceptual idea — not applied"** note in each room's Direction tab. They are never sent to the AI unless you choose *Use as starting point*.

Everything is editable.

## Setting up image generation

Open **Settings & Backup → Image generation**, choose a provider, paste your API key and click **Test connection** (it also lists the image models your key can
use).

| Provider | Uses your photos? | Notes |
| --- | --- | --- |
| **OpenAI Images API** (`gpt-image-1` default) | Yes, up to 16 images per request | Recommended for multi-reference redesigns. Some accounts must complete OpenAI organization verification before gpt-image models work. |
| **Google Gemini API** (`gemini-2.5-flash-image` default) | Yes (≈3 recommended; more on Pro image models) | Images are sent interleaved with their own labels and captions. `imagen-*` models are text-only. |
| **Stability AI** (`control-structure` default) | One image (the room photo) | *Structure control* keeps the structure of your room photo most closely. Other references are described in text. |
| **OpenAI-compatible endpoint** | Configurable | For self-hosted or other services that implement the OpenAI Images API. |

Model names change over time — type any model ID; capability overrides are available if a model behaves differently from the defaults.

**No image model can guarantee exact architectural preservation.** The studio sends the real photo first, describes confirmed elements precisely and forbids changes
to them, but always review results against the actual room.

### Local proxy

When you run `npm start` or `npm run dev`, a small proxy inside the local server forwards provider requests (`/__provider/...`) so they aren't blocked by browser
cross-origin rules. It runs only on your machine, stores nothing, strips cookies/origin/referer headers, and honours `HTTPS_PROXY` / `NO_PROXY` if your network
needs them. In Settings you can force *Direct* or *Local proxy* mode; *Automatic* uses the proxy when it is available.

### Optional AI text assistant

**Settings → AI text assistant** can use Anthropic Claude (official SDK, default `claude-opus-5-5`, structured JSON output), OpenAI, Gemini or an
OpenAI-compatible endpoint to turn pasted notes into structured requirements. It is optional: **Split into requirements** works offline.

## Privacy and storage

- Data is stored in IndexedDB in this browser on this device. Original uploads are stored byte-for-byte and never modified; thumbnails and (for HEIC) display copies
  are stored separately.
- Images sent to a provider are resized copies with metadata (such as GPS location) removed. The originals are untouched.
- API keys are stored locally only, are never hard-coded, and are left out of backups unless you explicitly include them.
- Use **Settings → Storage → Request persistent storage** so the browser doesn't evict the project under disk pressure.

## Backups

**Settings → Backup & restore → Export backup** downloads one `.zip` containing `data.json`, a manifest, and every original image with SHA-256 checksums.
**Choose backup file** validates a backup, shows what it contains, and replaces the project only after you type `REPLACE`. A **restore point** of the current data is
created automatically first (the last five are kept), so a restore can be undone. Export backups regularly and keep them somewhere safe — clearing the browser's site
data deletes the local project.

## Development

```
src/
  app/            App shell, router, global search
  components/     UI kit, image components (upload, lightbox, zoom), plan renderer & editors
  features/       Pages: home, rooms, room workspace tabs, floor plans, studio, library, materials, settings
  lib/
    db/           Dexie (IndexedDB) schema, factories, repositories, seed, presets
    geometry/     Units, room shapes (rectangle / L / custom walls), areas, consistency checks
    layout/       Furniture layout validation
    ai/           Prompt/package builder, image providers, text structuring, generation pipeline
    backup/       ZIP export / validated import / restore points
    images/       Ingest, thumbnails, HEIC conversion, upload preparation
e2e/acceptance.mjs  End-to-end walkthrough of the acceptance criteria
```

Stack: React 19, TypeScript, Vite, Tailwind CSS v4, Radix UI primitives, Dexie, fflate, Zod, Lucide icons.

```bash
npm run typecheck    # TypeScript
npm test             # unit tests (geometry, validation, prompt builder, requirement parser)
npm run test:e2e     # browser walkthrough; needs `npm run dev` running and `npx playwright install chromium` once
npm run format       # Prettier
```

The end-to-end test uses a fresh browser profile (your data is untouched) and intercepts the image provider at the network layer, so it needs no API key.

## Known limitations

- **Architectural fidelity depends on the model.** Results can still drift (window sizes, ceiling details). Stability's structure control preserves structure best;
  gpt-image and Gemini usually keep composition but not guaranteed.
- **Live generation was not run in the build environment** (no API key; outbound network restricted). The generation pipeline was verified end-to-end with an
  intercepted provider endpoint, and provider authentication/error handling against Google's live API. Your first real run needs your own key.
- **Single browser, single device.** There is no sync between devices; move a project with a backup file.
- **Floor plans are schematic.** Rooms are positioned by hand; uploaded plans are calibrated manually and not traced automatically.
- **Shapes and furniture are simplified.** Custom rooms use straight walls (no curves); furniture footprints are rectangles or ovals (draw an L-shaped sofa as two
  pieces).
- **Very large projects.** Backups are assembled in memory; projects of several hundred MB will export and import slowly.
- **HEIC photos** are converted for display with a bundled decoder; if a file can't be converted, export it as JPEG.
- **Gemini Flash image models** work best with about three input images; extra images are described in text unless you raise the limit in Settings.
