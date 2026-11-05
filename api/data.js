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

    // batterie: /api/data?batt=1  (GET movimenti e soglie; POST {mov}|{del}|{soglie})
    if (req.query && req.query.batt !== undefined) {
      await sql`create table if not exists batterie_mov (id bigserial primary key, creato timestamptz not null default now(), data text, tipo text not null, az text not null, q int not null, note text, utente text)`;
      await sql`create table if not exists impostazioni (chiave text primary key, valore text)`;
      const TIPI = ['9V', 'AAA', 'AA'];
      if (req.method === 'GET') {
        const mov = await sql`select id, data, tipo, az, q, note, utente, creato from batterie_mov order by id`;
        const s = await sql`select valore from impostazioni where chiave = 'batt_soglie'`;
        let soglie = {}; try { soglie = s.length ? JSON.parse(s[0].valore) : {}; } catch (e) {}
        return res.status(200).json({ mov: mov.map(x => ({ id: Number(x.id), data: x.data, tipo: x.tipo, az: x.az, q: x.q, note: x.note, u: x.utente, t: x.creato })), soglie });
      }
      if (req.method === 'POST') {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
        if (body.mov) {
          const m = body.mov, q = Number(m.q), u = String(m.u || '').slice(0, 40).trim();
          if (!TIPI.includes(m.tipo) || !['carico', 'prelievo'].includes(m.az) || !Number.isInteger(q) || q < 1 || q > 100000 || !u) return res.status(400).json({ error: 'dati non validi' });
          if (m.az === 'prelievo') {
            const g = await sql`select coalesce(sum(case when az = 'carico' then q else -q end), 0)::int as g from batterie_mov where tipo = ${m.tipo}`;
            if (g[0].g < q) return res.status(422).json({ error: 'Giacenza insufficiente: di ' + m.tipo + ' ce ne sono ' + g[0].g + '.' });
          }
          const d = /^\d{4}-\d{2}-\d{2}$/.test(m.data || '') ? m.data : new Date().toISOString().slice(0, 10);
          const r = await sql`insert into batterie_mov (data, tipo, az, q, note, utente) values (${d}, ${m.tipo}, ${m.az}, ${q}, ${String(m.note || '').slice(0, 300)}, ${u}) returning id`;
          return res.status(200).json({ ok: true, id: Number(r[0].id) });
        }
        if (body.del != null) { await sql`delete from batterie_mov where id = ${Number(body.del)}`; return res.status(200).json({ ok: true }); }
        if (body.soglie) {
          const o = {}; for (const t of TIPI) { const n = Number(body.soglie[t]); o[t] = Number.isInteger(n) && n >= 0 && n <= 100000 ? n : 0; }
          await sql`insert into impostazioni (chiave, valore) values ('batt_soglie', ${JSON.stringify(o)}) on conflict (chiave) do update set valore = excluded.valore`;
          return res.status(200).json({ ok: true });
        }
        return res.status(400).json({ error: 'richiesta non valida' });
      }
      return res.status(405).json({ error: 'method not allowed' });
    }

    // schemi di montaggio (show/live): /api/data?show=1  (GET elenco, GET &id=N immagine, POST nuovo|modifica, DELETE &id=N)
    if (req.query && req.query.show !== undefined) {
      await sql`create table if not exists show_schemi (id bigserial primary key, creato timestamptz not null default now(), titolo text, show text, note text, utente text, thumb text, dati text not null)`;
      const id = req.query.id !== undefined ? Number(req.query.id) : null;
      if (req.method === 'GET' && id == null) {
        const r = await sql`select id, creato, titolo, show, note, utente, thumb from show_schemi order by id desc limit 500`;
        return res.status(200).json({ lista: r.map(x => ({ id: Number(x.id), t: x.creato, titolo: x.titolo, show: x.show, note: x.note, u: x.utente, thumb: x.thumb })) });
      }
      if (req.method === 'GET') {
        const r = await sql`select dati from show_schemi where id = ${id}`;
        return res.status(200).json({ dati: r.length ? r[0].dati : null });
      }
      if (req.method === 'DELETE') { await sql`delete from show_schemi where id = ${id}`; return res.status(200).json({ ok: true }); }
      if (req.method === 'POST') {
        const b = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
        const cut = (v, n) => String(v == null ? '' : v).slice(0, n);
        if (b.id != null) {
          await sql`update show_schemi set titolo = ${cut(b.titolo, 120)}, show = ${cut(b.show, 80)}, note = ${cut(b.note, 400)} where id = ${Number(b.id)}`;
          return res.status(200).json({ ok: true });
        }
        const u = cut(b.u, 40).trim();
        if (!u || typeof b.dati !== 'string' || !b.dati.startsWith('data:image/') || b.dati.length > 3000000 || (b.thumb && (typeof b.thumb !== 'string' || !b.thumb.startsWith('data:image/') || b.thumb.length > 200000)))
          return res.status(400).json({ error: 'immagine non valida' });
        const r = await sql`insert into show_schemi (titolo, show, note, utente, thumb, dati) values (${cut(b.titolo, 120)}, ${cut(b.show, 80)}, ${cut(b.note, 400)}, ${u}, ${b.thumb || null}, ${b.dati}) returning id`;
        return res.status(200).json({ ok: true, id: Number(r[0].id) });
      }
      return res.status(405).json({ error: 'method not allowed' });
    }

    // registro delle modifiche: /api/data?log=1  (GET ultime 500 voci, POST {voci:[{u,a,o,d}]})
    if (req.query && req.query.log !== undefined) {
      await sql`create table if not exists registro (id bigserial primary key, quando timestamptz not null default now(), utente text not null, azione text not null, oggetto text, dettaglio text)`;
      if (req.method === 'GET') {
        const r = await sql`select quando, utente, azione, oggetto, dettaglio from registro order by id desc limit 500`;
        return res.status(200).json({ voci: r.map(x => ({ t: x.quando, u: x.utente, a: x.azione, o: x.oggetto, d: x.dettaglio })) });
      }
      if (req.method === 'POST') {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const voci = Array.isArray(body && body.voci) ? body.voci.slice(0, 60) : [];
        const cut = (v, n) => String(v == null ? '' : v).slice(0, n);
        for (const v of voci) {
          const u = cut(v.u, 40).trim(), a = cut(v.a, 20);
          if (!u || !a) continue;
          await sql`insert into registro (utente, azione, oggetto, dettaglio) values (${u}, ${a}, ${cut(v.o, 40)}, ${cut(v.d, 600)})`;
        }
        return res.status(200).json({ ok: true });
      }
      return res.status(405).json({ error: 'method not allowed' });
    }

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
