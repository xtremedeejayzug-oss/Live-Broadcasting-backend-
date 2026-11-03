import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

const app = express();
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '*').split(',').map(v => v.trim());
app.use(cors({ origin: allowedOrigins.includes('*') ? '*' : allowedOrigins }));
app.use(express.json({ limit: '1mb' }));

const {
  PORT = 3000,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  CLOUDFLARE_ACCOUNT_ID,
  CLOUDFLARE_API_TOKEN,
  ADMIN_EMAIL = 'kiizanoor740@gmail.com'
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN) {
  console.error('Missing required environment variables. Configure Render Environment using .env.example.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});
const CF_BASE = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/stream`;

async function cloudflare(path, options = {}) {
  const response = await fetch(`${CF_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    const reason = payload.errors?.map(x => x.message).join('; ') || `Cloudflare API error ${response.status}`;
    throw new Error(reason);
  }
  return payload.result;
}

async function requireCEO(req, res, next) {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Please sign in as the CEO administrator.' });
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: 'Your login session is invalid or expired.' });
    if ((data.user.email || '').toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
      return res.status(403).json({ error: 'Only the CEO administrator can control DJ WHISTER LIVE.' });
    }
    req.admin = data.user;
    next();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

app.get('/', (_req, res) => res.json({
  ok: true,
  service: 'DJ WHISTER 256 LIVE Backend',
  version: '1.0.0',
  message: 'Backend is running. Configure the website integration to broadcast.'
}));
app.get('/health', (_req, res) => res.json({ ok: true, service: 'DJ WHISTER 256 LIVE Backend' }));

// Public playback metadata. The private publish URL is never returned here.
app.get('/api/live/current', async (_req, res) => {
  try {
    const { data, error } = await supabase.from('whister_live_broadcasts')
      .select('id,title,presenter_name,show_title,status,playback_url,started_at')
      .eq('status', 'live').order('started_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    res.json({ ok: true, live: data || null });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// CEO starts a new live input. The browser uses publishUrl for WebRTC ingest.
app.post('/api/live/start', requireCEO, async (req, res) => {
  let input;
  try {
    const { title = 'DJ WHISTER LIVE', presenterName = 'DJ WHISTER 256', showTitle = '', lowerThird = {} } = req.body || {};
    const { data: current, error: currentError } = await supabase.from('whister_live_broadcasts')
      .select('id').in('status', ['starting', 'live']).limit(1).maybeSingle();
    if (currentError) throw currentError;
    if (current) return res.status(409).json({ error: 'A broadcast is already active. Stop it before starting another.' });

    input = await cloudflare('/live_inputs', {
      method: 'POST',
      body: JSON.stringify({
        meta: { brand: 'DJ WHISTER 256', title: String(title).slice(0, 160) },
        recording: { mode: 'off' }
      })
    });
    const publishUrl = input?.webRTC?.url;
    const playbackUrl = input?.webRTCPlayback?.url;
    if (!input?.uid || !publishUrl || !playbackUrl) {
      throw new Error('Cloudflare did not return WebRTC publish/playback addresses. Check Stream account and token permissions.');
    }

    const row = {
      cloudflare_input_id: input.uid,
      title: String(title).slice(0, 160),
      presenter_name: String(presenterName).slice(0, 120),
      show_title: String(showTitle).slice(0, 160),
      lower_third: lowerThird && typeof lowerThird === 'object' ? lowerThird : {},
      status: 'starting',
      publish_url: publishUrl,
      playback_url: playbackUrl,
      started_at: new Date().toISOString(),
      created_by: req.admin.id
    };
    const { data, error } = await supabase.from('whister_live_broadcasts')
      .insert(row).select('id,title,presenter_name,show_title,status,playback_url,started_at').single();
    if (error) throw error;
    res.status(201).json({ ok: true, broadcast: data, publishUrl, playbackUrl });
  } catch (error) {
    if (input?.uid) await cloudflare(`/live_inputs/${input.uid}`, {
      method: 'PUT', body: JSON.stringify({ enabled: false })
    }).catch(() => {});
    res.status(500).json({ error: error.message });
  }
});

// Browser calls this after its WebRTC publish session connects successfully.
app.post('/api/live/confirm', requireCEO, async (req, res) => {
  try {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'Broadcast id is required.' });
    const { data, error } = await supabase.from('whister_live_broadcasts')
      .update({ status: 'live' }).eq('id', id).eq('status', 'starting')
      .select('id,title,status,playback_url,started_at').single();
    if (error) throw error;
    res.json({ ok: true, broadcast: data });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/live/stop', requireCEO, async (_req, res) => {
  try {
    const { data: live, error: findError } = await supabase.from('whister_live_broadcasts')
      .select('id,cloudflare_input_id').in('status', ['starting', 'live'])
      .order('started_at', { ascending: false }).limit(1).maybeSingle();
    if (findError) throw findError;
    if (!live) return res.json({ ok: true, message: 'No active broadcast was found.' });
    await cloudflare(`/live_inputs/${live.cloudflare_input_id}`, {
      method: 'PUT', body: JSON.stringify({ enabled: false })
    });
    const { error } = await supabase.from('whister_live_broadcasts')
      .update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', live.id);
    if (error) throw error;
    res.json({ ok: true, message: 'Broadcast stopped.' });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/live/admin/status', requireCEO, async (_req, res) => {
  try {
    const { data, error } = await supabase.from('whister_live_broadcasts')
      .select('id,title,presenter_name,show_title,status,started_at,ended_at')
      .order('created_at', { ascending: false }).limit(10);
    if (error) throw error;
    res.json({ ok: true, broadcasts: data || [] });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.listen(PORT, () => console.log(`DJ WHISTER LIVE backend listening on ${PORT}`));
