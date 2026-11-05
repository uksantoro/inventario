// Funzione Vercel: legge e salva lo stato dell'inventario in Neon (Postgres).
// Variabili d'ambiente: DATABASE_URL (la imposta l'integrazione Neon) e APP_PASSWORD (la scegli tu).
import { neon } from '@neondatabase/serverless';
import { timingSafeEqual } from 'node:crypto';

function passwordOk(given) {
  const expected = process.env.APP_PASSWORD || '';
  if (!expected || typeof given !== 'string') return false;
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!passwordOk(req.headers['x-app-key'])) return res.status(401).json({ error: 'unauthorized' });
  if (!process.env.DATABASE_URL) return res.status(500).json({ error: 'DATABASE_URL mancante' });
  const sql = neon(process.env.DATABASE_URL);
  try {
    await sql`create table if not exists app_state (
      id int primary key, version int not null default 0, data jsonb, updated_at timestamptz not null default now())`;

    // foto degli articoli: /api/data?img=<chiave>  (GET, PUT {dati}, DELETE)
    if (req.query && req.query.img !== undefined) {
      const k = String(req.query.img).slice(0, 300);
      if (!k) return res.status(400).json({ error: 'chiave mancante' });
      await sql`create table if not exists immagini (chiave text primary key, dati text not null, updated_at timestamptz not null default now())`;
      if (req.method === 'GET') {
        const r = await sql`select dati from immagini where chiave = ${k}`;
        return res.status(200).json({ dati: r.length ? r[0].dati : null });
      }
      if (req.method === 'PUT') {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const dati = body && body.dati;
        if (typeof dati !== 'string' || !dati.startsWith('data:image/') || dati.length > 900000) return res.status(400).json({ error: 'immagine non valida' });
        await sql`insert into immagini (chiave, dati) values (${k}, ${dati}) on conflict (chiave) do update set dati = excluded.dati, updated_at = now()`;
        return res.status(200).json({ ok: true });
      }
      if (req.method === 'DELETE') {
        await sql`delete from immagini where chiave = ${k}`;
        return res.status(200).json({ ok: true });
      }
      return res.status(405).json({ error: 'method not allowed' });
    }

    if (req.method === 'GET' && req.query && req.query.ver !== undefined) {
      const r = await sql`select version from app_state where id = 1`;
      return res.status(200).json({ version: r.length ? r[0].version : 0 });
    }
    if (req.method === 'GET') {
      const rows = await sql`select version, data from app_state where id = 1`;
      return res.status(200).json(rows[0] || { version: 0, data: null });
    }
    if (req.method === 'PUT') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const data = body && body.data;
      if (!data || !Array.isArray(data.inv) || !Array.isArray(data.acq) || !Array.isArray(data.aree))
        return res.status(400).json({ error: 'dati non validi' });
      const base = Number(body.version) || 0;
      const json = JSON.stringify(data);
      const r = base === 0
        ? await sql`insert into app_state (id, version, data) values (1, 1, ${json}::jsonb) on conflict (id) do nothing returning version`
        : await sql`update app_state set data = ${json}::jsonb, version = version + 1, updated_at = now() where id = 1 and version = ${base} returning version`;
      if (!r.length) return res.status(409).json({ error: 'conflict' });
      return res.status(200).json({ version: r[0].version });
    }
    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'errore database' });
  }
}
