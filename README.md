# DJ WHISTER 256 LIVE Backend

Node.js/Express control API for Cloudflare Stream WebRTC live ingest and Supabase broadcast metadata.

## What this backend does
- CEO-authenticated start and stop endpoints.
- Creates a Cloudflare Stream live input.
- Stores broadcast title, presenter, show title, lower-third settings, status and playback address in Supabase.
- Exposes public playback metadata without exposing the private publish URL.
- Verifies the logged-in Supabase user against ADMIN_EMAIL.

## Important
Render runs the API; it is not itself the video streaming server. Cloudflare Stream carries the live audio/video. The website still needs a frontend WebRTC publisher/viewer integration to capture the phone camera/microphone and display the stream. This backend alone does not activate the GO LIVE button.

## Deploy on Render
1. Create a GitHub repository and upload the contents of this folder.
2. In Render, create a Web Service connected to that repository.
3. Build command: `npm install`
4. Start command: `npm start`
5. Add the environment variables below in Render → Environment.
6. Deploy and test `https://YOUR-RENDER-SERVICE/health`.

## Supabase database
Run `supabase.sql` in Supabase → SQL Editor in the existing project. The SQL creates `whister_live_broadcasts`. No new Supabase project is required.

## Cloudflare Stream requirement
Create/enable a Cloudflare Stream account and create an API token with permission to manage Stream live inputs. Put its Account ID and API token in Render environment variables. Never put either secret in the website HTML or send them in chat.

## Render environment variables
- `SUPABASE_URL` — existing Supabase project URL.
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service-role key; Render only, never browser/Netlify.
- `CLOUDFLARE_ACCOUNT_ID` — Cloudflare account ID.
- `CLOUDFLARE_API_TOKEN` — Cloudflare Stream API token.
- `ADMIN_EMAIL` — defaults to `kiizanoor740@gmail.com`.
- `ALLOWED_ORIGINS` — website origin, e.g. `https://djwhister256uganda.netlify.app`.
- `PORT` — Render provides this automatically; default 3000 for local use.

## API routes
- `GET /health` — health check.
- `GET /api/live/current` — public current live metadata and playback URL.
- `POST /api/live/start` — CEO only; JSON `{ "title":"DJ WHISTER LIVE", "presenterName":"DJ WHISTER 256", "showTitle":"", "lowerThird":{} }`; header `Authorization: Bearer <Supabase access token>`. Returns a private `publishUrl` for the broadcaster and `playbackUrl` for the viewer.
- `POST /api/live/confirm` — CEO only; JSON `{ "id":"<broadcast id>" }`; call after the browser WebRTC publish session connects.
- `POST /api/live/stop` — CEO only; disables the Cloudflare live input and marks the broadcast ended.
- `GET /api/live/admin/status` — CEO only; recent broadcast records.

## Security
Keep Supabase service-role and Cloudflare API tokens only in Render environment variables. Never commit `.env`. Public endpoint never returns `publish_url`.
