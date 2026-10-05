# PicklePlay

Mobile-first pickleball tournament manager.

## Files
- `index.html` — main page
- `PicklePlay.html` — alternate entry page
- `styles.css` — styling
- `app.js` — tournament logic + optional live sharing
- `cloud-config.js` — optional Supabase project URL/key
- `supabase-setup.sql` — database table + Row Level Security policies

## Run locally
Keep all files in the same folder and serve them with a local web server. Opening only the HTML file in an iPhone file preview can block JavaScript or external libraries.

## Optional free live sharing + QR codes
The app now contains the live-sharing feature, but it is disabled until cloud credentials are supplied.

1. Create a Supabase project.
2. In Supabase Authentication, enable **Anonymous Sign-Ins**.
3. Open the Supabase SQL Editor and run `supabase-setup.sql` once.
4. In `cloud-config.js`, paste your **Project URL** and **anon/publishable key**. Never use a service-role key in browser code.
5. Deploy this folder as a website (Netlify, Vercel, GitHub Pages, etc.).
6. Start a tournament and tap **Share live session**.
7. PicklePlay creates a QR code and viewer link. People who scan it get a read-only live view.

The organizer syncs scores and tournament changes to the shared session. Viewers refresh automatically every few seconds.

## Current sharing security
- Shared viewers can read the tournament.
- Only the anonymous authenticated browser that created the session can update it through the normal app UI/database policy.
- The session URL uses a random UUID. Anyone with the link can view that session, so do not put sensitive information in player names or notes.
