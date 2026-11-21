# Bait Khuzam Studio · استوديو بيت خزام

A private interior-design workspace for the house in Riyadh. Every room has its own
requirements, dimensions, architecture, 2D layout, photos and files, design direction
and design versions. Arabic (default) and English, phone-first, installable.

Live site: https://khuzam-house.vercel.app

---

## Set it up (one time)

You need: the Supabase project (already created) and the Vercel project that deploys
this repository from `main`.

### 1. Create the database and file storage in Supabase

1. Open https://supabase.com/dashboard → your project.
2. Left menu **SQL Editor** → **New query**.
3. Open the file [`supabase/setup.sql`](supabase/setup.sql) in this repository, copy
   all of it, paste it into the editor and press **Run**.
   It creates every table, Row Level Security on every table, the history of earlier
   versions, and the private `studio-files` storage bucket with its policies.
   It is safe to run again (nothing is deleted).

(The same SQL is in `supabase/migrations/` for the Supabase CLI.)

### 2. Tell Vercel how to reach Supabase

Vercel → the **khuzam-house** project → **Settings** → **Environment Variables**.
Add these two (for Production, Preview and Development):

| Name | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://vvybgqmziuidpexikbky.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | your **publishable** key (`sb_publishable_…`) |

Both are in Supabase → **Project Settings** → **API Keys**. Never use the
`secret` / `service_role` key — the app refuses to start with one.

Then **Deployments** → the latest deployment → **⋯** → **Redeploy**
(the values are built into the site, so a redeploy is required after changing them).

### 3. Site URL for the confirmation email

Supabase → **Authentication** → **URL Configuration**:

- **Site URL**: `https://khuzam-house.vercel.app`
- **Redirect URLs** → **Add URL**: `https://khuzam-house.vercel.app/**`

### 4. Create your account, then close sign-ups

1. Open https://khuzam-house.vercel.app → **First time? Create the owner account**.
2. Confirm the email Supabase sends you, sign in, and press **Make this account the owner**.
   From now on only this account can read, create, edit or delete anything
   (enforced by the database itself, not just the app).
3. Supabase → **Authentication** → **Sign In / Providers** → under **User Signups**
   turn **off** “Allow new users to sign up” → **Save**.

If you used the studio on a device before (data stored in the browser), it is uploaded
automatically after your first sign-in on that device, with a restore point first and
a count check at the end.

### 5. Install on the phone

Open the site in Chrome on Android → menu **⋮** → **Add to Home screen** (or the
“Install” banner). It then opens full-screen like an app.

---

## Your data is safe

- **Cloud + device.** Everything is saved to your Supabase database and storage
  (files in original quality). Each device keeps a working copy, so the studio opens
  fast and works offline; changes upload when you are back online.
- **Save indicator** at the top: *Saved*, *Saving…*, or *Not saved — retry*.
- **Recently Deleted.** Deleting a room, requirement, attachment, version, etc. only
  moves it to Recently Deleted (with confirmation). Restore it any time.
- **Earlier versions.** The database keeps the previous version of every record that is
  overwritten or deleted. Settings → Data safety → *Earlier versions in the cloud*.
- **Backups.** Settings → Data safety → *Export backup* downloads one `.zip` with all data
  and every original file. *Import* checks the file and shows a summary before replacing
  anything, and creates a restore point first.

## Working without an image API

No API key is needed. In the **Design Studio**:

1. Arabic texts used in the design are listed at the top; give each an English version
   (or press *Translate all automatically* if an AI text assistant is set up).
   The prompt is always English; your Arabic originals are kept with every version.
2. **Copy prompt**, then **Download images** (a ZIP with the numbered images and
   `prompt.txt`) or **Share** them straight to another app on the phone.
3. Generate the image in the tool you use (ChatGPT, etc.).
4. **Import generated image** — it is saved as a new version together with the exact
   prompt, settings, input images, and snapshots of the requirements and dimensions.

Image providers (OpenAI, Gemini, Stability, OpenAI-compatible) can still be set up in
Settings → Image generation; keys stay on the device and are never uploaded.

## Language

Arabic is the default with full right-to-left layout. Switch with the 文A button at the
top or in Settings → Language & formats (also Western/Arabic-Indic digits and
Gregorian/Hijri dates). Search ignores hamza/alef forms, ة/ه and diacritics.

---

## Development

```bash
npm install
cp .env.example .env.local   # fill in the two values
npm run dev                  # http://localhost:5173
npm test                     # unit tests + SQL/RLS tests (PGlite)
npm run build
```

End-to-end flows run against a local fake Supabase (no real project needed):

```bash
npm run fake-supabase &       # http://localhost:54321
VITE_SUPABASE_URL=http://localhost:54321 VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_test \
  npx vite build && npx vite preview --port 5173 &
npm run test:e2e
```

They cover: owner sign-up, requirement with a photo and a PDF, delete → restore,
offline editing, a failing server with *Not saved — retry*, Arabic → English prompt,
importing a generated image, and a second device seeing the same data.

Structure: `src/i18n` (Arabic/English text — `locales/en.ts` is the source of truth,
`ar.ts` must have the same keys), `src/lib/sync` (cloud sync, auth, storage, history),
`src/lib/db` (local database, Recently Deleted), `src/lib/ai` (prompt builder, providers,
translation), `src/features/*` (screens), `supabase/` (database setup).

## Known limitations

- Image generation and automatic translation need an API key of your own; without one
  everything else works and prompts are copied manually.
- Model-specific technical notes in Settings → Image generation are shown in English.
- The largest file you can upload is limited by your Supabase plan
  (Storage → Settings → upload size limit; 50 MB on the free plan).
