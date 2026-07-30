const DEFAULT_ALLOWED_ORIGINS = ['https://mikiflores711.github.io'];
const REPORT_STATUSES = new Set(['Pendiente', 'En revisión', 'Reparado', 'Descartado']);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return cors(request, env, null, 204);
    try {
      if (!env.DB) throw httpError(500, 'Falta la vinculación D1 con el nombre DB.');
      await ensureSchema(env.DB);

      if (url.pathname === '/' || url.pathname === '/api/health') {
        return json(request, env, { ok: true, service: 'Watch Movies Plus API', version: '2.0' });
      }
      if (url.pathname === '/api/report' && request.method === 'POST') {
        return json(request, env, await createReport(request, env));
      }
      if (url.pathname === '/api/resolve' && request.method === 'GET') {
        return json(request, env, await resolveOverride(url, env.DB));
      }
      if (url.pathname === '/api/statuses' && request.method === 'GET') {
        return json(request, env, await publicStatuses(env.DB));
      }
      if (url.pathname === '/api/login' && request.method === 'POST') {
        return json(request, env, await login(request, env));
      }
      if (url.pathname === '/api/dashboard' && request.method === 'GET') {
        await requireSession(request, env);
        return json(request, env, await dashboard(env.DB));
      }
      if (url.pathname === '/api/overrides' && request.method === 'POST') {
        const session = await requireSession(request, env);
        return json(request, env, await saveOverride(request, env.DB, session.username));
      }

      const reportMatch = url.pathname.match(/^\/api\/reports\/(\d+)$/);
      if (reportMatch && request.method === 'PATCH') {
        const session = await requireSession(request, env);
        return json(request, env, await updateReport(request, env.DB, Number(reportMatch[1]), session.username));
      }
      if (reportMatch && request.method === 'DELETE') {
        const session = await requireSession(request, env);
        return json(request, env, await deleteReport(env.DB, Number(reportMatch[1]), session.username));
      }
      const overrideMatch = url.pathname.match(/^\/api\/overrides\/(\d+)$/);
      if (overrideMatch && request.method === 'DELETE') {
        const session = await requireSession(request, env);
        return json(request, env, await deleteOverride(env.DB, Number(overrideMatch[1]), session.username));
      }
      return json(request, env, { ok: false, error: 'Ruta no encontrada.' }, 404);
    } catch (error) {
      console.error(error);
      return json(request, env, { ok: false, error: String(error.message || error) }, error.status || 500);
    }
  }
};

async function ensureSchema(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS movie_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_key TEXT NOT NULL,
      content_type TEXT NOT NULL,
      content_id TEXT NOT NULL,
      title TEXT NOT NULL,
      year TEXT DEFAULT '',
      season TEXT DEFAULT '',
      episode TEXT DEFAULT '',
      episode_title TEXT DEFAULT '',
      server_name TEXT DEFAULT '',
      media_url TEXT DEFAULT '',
      problem TEXT NOT NULL,
      comment TEXT DEFAULT '',
      page_url TEXT DEFAULT '',
      user_agent TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Pendiente',
      report_count INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_movie_reports_open ON movie_reports(report_key) WHERE status IN ('Pendiente','En revisión')`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_movie_reports_status ON movie_reports(status)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS movie_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id INTEGER,
      content_label TEXT DEFAULT '',
      action TEXT NOT NULL,
      detail TEXT DEFAULT '',
      actor TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS movie_sessions (
      token_hash TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS media_overrides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content_id TEXT NOT NULL,
      content_type TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      season TEXT DEFAULT '',
      episode TEXT DEFAULT '',
      episode_title TEXT DEFAULT '',
      server_name TEXT DEFAULT '',
      original_url TEXT DEFAULT '',
      replacement_url TEXT NOT NULL,
      note TEXT DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      updated_by TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_media_override_key ON media_overrides(content_id,season,episode,server_name)`)
  ]);
}

async function createReport(request, env) {
  checkOrigin(request, env);
  const body = await readJson(request);
  const type = clean(body.tipo, 30);
  const title = clean(body.titulo, 180);
  const contentId = clean(body.contenidoId, 180);
  const season = clean(body.temporada, 20);
  const episode = clean(body.episodio, 20);
  const server = clean(body.servidor, 120) || 'Servidor principal';
  const problem = clean(body.problema, 180);
  const mediaUrl = clean(body.video, 2000);
  if (!type || !title || !contentId || !problem) throw httpError(400, 'Faltan datos del contenido o del problema.');
  const reportKey = [type, contentId, season, episode, server, mediaUrl].join('|');
  const label = type === 'serie' ? `${title} · T${season} · E${episode}` : title;
  const existing = await env.DB.prepare(`SELECT id, report_count FROM movie_reports WHERE report_key=? AND status IN ('Pendiente','En revisión') LIMIT 1`).bind(reportKey).first();
  if (existing) {
    const count = Number(existing.report_count || 1) + 1;
    await env.DB.batch([
      env.DB.prepare(`UPDATE movie_reports SET report_count=?, problem=?, comment=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(count, problem, clean(body.comentario, 500), existing.id),
      env.DB.prepare(`INSERT INTO movie_history(report_id,content_label,action,detail,actor) VALUES(?,?,'Nuevo reporte agrupado',?,'Público')`).bind(existing.id, label, `Cantidad total: ${count}`)
    ]);
    return { ok: true, grouped: true, id: existing.id, cantidad: count };
  }
  const insert = await env.DB.prepare(`INSERT INTO movie_reports(report_key,content_type,content_id,title,year,season,episode,episode_title,server_name,media_url,problem,comment,page_url,user_agent,status,report_count) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,'Pendiente',1)`).bind(reportKey,type,contentId,title,clean(body.anio,10),season,episode,clean(body.tituloEpisodio,180),server,mediaUrl,problem,clean(body.comentario,500),clean(body.pagina,2000),clean(body.userAgent,1000)).run();
  const id = insert.meta.last_row_id;
  await env.DB.prepare(`INSERT INTO movie_history(report_id,content_label,action,detail,actor) VALUES(?,?,'Reporte creado',?,'Público')`).bind(id,label,problem).run();
  return { ok: true, grouped: false, id, cantidad: 1 };
}

async function resolveOverride(url, db) {
  const contentId = clean(url.searchParams.get('contentId'), 180);
  const season = clean(url.searchParams.get('season'), 20);
  const episode = clean(url.searchParams.get('episode'), 20);
  const server = clean(url.searchParams.get('server'), 120) || 'Servidor principal';
  if (!contentId) throw httpError(400, 'Falta contentId.');
  const row = await db.prepare(`SELECT id,replacement_url AS url,original_url AS originalUrl,note,updated_at AS updatedAt FROM media_overrides WHERE content_id=? AND season=? AND episode=? AND server_name=? AND active=1 LIMIT 1`).bind(contentId,season,episode,server).first();
  return row ? { ok: true, found: true, ...row } : { ok: true, found: false };
}

async function saveOverride(request, db, actor) {
  const body = await readJson(request);
  const contentId = clean(body.contenidoId || body.contentId, 180);
  const season = clean(body.temporada || body.season, 20);
  const episode = clean(body.episodio || body.episode, 20);
  const server = clean(body.servidor || body.server, 120) || 'Servidor principal';
  const replacement = clean(body.nuevoEnlace || body.replacementUrl, 2000);
  if (!contentId || !/^https?:\/\//i.test(replacement)) throw httpError(400, 'Falta el contenido o el nuevo enlace no es válido.');
  await db.prepare(`INSERT INTO media_overrides(content_id,content_type,title,season,episode,episode_title,server_name,original_url,replacement_url,note,active,updated_by,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,1,?,CURRENT_TIMESTAMP)
    ON CONFLICT(content_id,season,episode,server_name) DO UPDATE SET content_type=excluded.content_type,title=excluded.title,episode_title=excluded.episode_title,original_url=excluded.original_url,replacement_url=excluded.replacement_url,note=excluded.note,active=1,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`).bind(
      contentId, clean(body.tipo || body.contentType,30), clean(body.titulo || body.title,180), season, episode, clean(body.tituloEpisodio || body.episodeTitle,180), server, clean(body.enlaceAnterior || body.originalUrl,2000), replacement, clean(body.nota || body.note,500), actor
    ).run();
  if (body.reportId) {
    await updateStatusDirect(db, Number(body.reportId), 'Reparado', actor, 'Enlace reemplazado desde el panel');
  }
  const row = await db.prepare(`SELECT id FROM media_overrides WHERE content_id=? AND season=? AND episode=? AND server_name=? LIMIT 1`).bind(contentId,season,episode,server).first();
  await db.prepare(`INSERT INTO movie_history(report_id,content_label,action,detail,actor) VALUES(?,?,?,?,?)`).bind(Number(body.reportId)||null, clean(body.titulo||contentId,180), 'Enlace actualizado', replacement, actor).run();
  return { ok: true, id: row?.id, url: replacement };
}

async function deleteOverride(db, id, actor) {
  const row = await db.prepare(`SELECT title,content_id FROM media_overrides WHERE id=?`).bind(id).first();
  if (!row) throw httpError(404, 'Enlace administrado no encontrado.');
  await db.prepare(`UPDATE media_overrides SET active=0,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(actor,id).run();
  await db.prepare(`INSERT INTO movie_history(content_label,action,detail,actor) VALUES(?,'Enlace administrado desactivado',?,?)`).bind(row.title||row.content_id,`ID ${id}`,actor).run();
  return { ok: true, id };
}

async function publicStatuses(db) {
  const result = await db.prepare(`SELECT content_id AS contenidoId,title AS titulo,content_type AS tipo,season AS temporada,episode AS episodio,status AS estado,report_count AS cantidad FROM movie_reports WHERE status IN ('Pendiente','En revisión','Reparado') ORDER BY updated_at DESC LIMIT 2000`).all();
  return { ok: true, items: result.results || [] };
}

async function dashboard(db) {
  const [r,h,o,d] = await db.batch([
    db.prepare(`SELECT id,content_type AS tipo,content_id AS contenidoId,title AS titulo,year AS anio,season AS temporada,episode AS episodio,episode_title AS tituloEpisodio,server_name AS servidor,media_url AS video,problem AS problema,comment AS comentario,page_url AS pagina,status AS estado,report_count AS cantidad,created_at AS fecha,updated_at AS actualizacion FROM movie_reports ORDER BY updated_at DESC LIMIT 2000`),
    db.prepare(`SELECT report_id AS id,content_label AS contenido,action AS accion,detail AS detalle,actor,created_at AS fecha FROM movie_history ORDER BY movie_history.id DESC LIMIT 100`),
    db.prepare(`SELECT id,content_id AS contenidoId,content_type AS tipo,title AS titulo,season AS temporada,episode AS episodio,episode_title AS tituloEpisodio,server_name AS servidor,original_url AS enlaceAnterior,replacement_url AS nuevoEnlace,note AS nota,active,updated_by AS actualizadoPor,updated_at AS actualizacion FROM media_overrides WHERE active=1 ORDER BY updated_at DESC LIMIT 500`),
    db.prepare(`SELECT substr(created_at,1,10) AS dia,SUM(report_count) AS cantidad FROM movie_reports GROUP BY substr(created_at,1,10) ORDER BY dia DESC LIMIT 14`)
  ]);
  const reports=r.results||[], history=h.results||[], overrides=o.results||[], daily=(d.results||[]).reverse();
  const stats={total:reports.length,pending:reports.filter(x=>x.estado==='Pendiente').length,reviewing:reports.filter(x=>x.estado==='En revisión').length,fixed:reports.filter(x=>x.estado==='Reparado').length,discarded:reports.filter(x=>x.estado==='Descartado').length,totalSignals:reports.reduce((n,x)=>n+Number(x.cantidad||1),0),overrides:overrides.length};
  const map=new Map(), serverMap=new Map();
  for(const x of reports){
    const key=[x.contenidoId,x.temporada,x.episodio].join('|');
    const current=map.get(key)||{contenido:x.tipo==='serie'?`${x.titulo} · T${x.temporada}E${x.episodio}`:x.titulo,cantidad:0};current.cantidad+=Number(x.cantidad||1);map.set(key,current);
    const server=x.servidor||'Servidor principal';serverMap.set(server,(serverMap.get(server)||0)+Number(x.cantidad||1));
  }
  return {ok:true,reports,history,overrides,daily,stats,ranking:[...map.values()].sort((a,b)=>b.cantidad-a.cantidad).slice(0,10),serverRanking:[...serverMap].map(([servidor,cantidad])=>({servidor,cantidad})).sort((a,b)=>b.cantidad-a.cantidad).slice(0,10)};
}

async function login(request,env){checkOrigin(request,env);const b=await readJson(request),u=clean(b.username,80),p=String(b.password||''),eu=env.ADMIN_USER||env.ADMIN_USERNAME||'admin',ep=env.ADMIN_PASSWORD;if(!ep)throw httpError(500,'Falta configurar ADMIN_PASSWORD.');if(!safeEqual(u,eu)||!safeEqual(p,ep))throw httpError(401,'Usuario o contraseña incorrectos.');const token=randomToken(),hash=await sha256(token),expires=new Date(Date.now()+21600000).toISOString();await env.DB.prepare(`INSERT OR REPLACE INTO movie_sessions(token_hash,username,expires_at) VALUES(?,?,?)`).bind(hash,u,expires).run();return{ok:true,token,username:u,expiresAt:expires}}
async function requireSession(request,env){checkOrigin(request,env);const a=request.headers.get('Authorization')||'';if(!a.startsWith('Bearer '))throw httpError(401,'Sesión requerida.');const hash=await sha256(a.slice(7).trim()),now=new Date().toISOString(),s=await env.DB.prepare(`SELECT username FROM movie_sessions WHERE token_hash=? AND expires_at>? LIMIT 1`).bind(hash,now).first();if(!s)throw httpError(401,'Sesión inválida o expirada.');return s}
async function updateReport(request,db,id,actor){const b=await readJson(request),status=clean(b.estado||b.status,40);if(!REPORT_STATUSES.has(status))throw httpError(400,'Estado no válido.');await updateStatusDirect(db,id,status,actor);return{ok:true,id,estado:status}}
async function updateStatusDirect(db,id,status,actor,detail=''){const r=await db.prepare(`SELECT title,season,episode,status,content_type FROM movie_reports WHERE id=?`).bind(id).first();if(!r)throw httpError(404,'Reporte no encontrado.');const label=r.content_type==='serie'?`${r.title} · T${r.season}E${r.episode}`:r.title;await db.batch([db.prepare(`UPDATE movie_reports SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(status,id),db.prepare(`INSERT INTO movie_history(report_id,content_label,action,detail,actor) VALUES(?,?,'Estado actualizado',?,?)`).bind(id,label,detail||`${r.status} → ${status}`,actor)])}
async function deleteReport(db,id,actor){const r=await db.prepare(`SELECT title,season,episode,content_type FROM movie_reports WHERE id=?`).bind(id).first();if(!r)throw httpError(404,'Reporte no encontrado.');const label=r.content_type==='serie'?`${r.title} · T${r.season}E${r.episode}`:r.title;await db.batch([db.prepare(`INSERT INTO movie_history(report_id,content_label,action,detail,actor) VALUES(?,?,'Reporte eliminado','Eliminado desde el panel',?)`).bind(id,label,actor),db.prepare(`DELETE FROM movie_reports WHERE id=?`).bind(id)]);return{ok:true,id}}
function allowedOrigins(env){const x=String(env.ALLOWED_ORIGINS||'').split(',').map(v=>v.trim()).filter(Boolean);return x.length?x:DEFAULT_ALLOWED_ORIGINS}
function checkOrigin(request,env){const o=request.headers.get('Origin');if(o&&!allowedOrigins(env).includes(o))throw httpError(403,'Origen no autorizado.')}
function cors(request,env,body,status=200,headers={}){const o=request.headers.get('Origin')||'',allowed=allowedOrigins(env),allow=allowed.includes(o)?o:allowed[0];return new Response(body,{status,headers:{'Access-Control-Allow-Origin':allow,'Access-Control-Allow-Methods':'GET,POST,PATCH,DELETE,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Max-Age':'86400','Vary':'Origin',...headers}})}
function json(request,env,data,status=200){return cors(request,env,JSON.stringify(data),status,{'Content-Type':'application/json; charset=utf-8'})}
async function readJson(request){if(!(request.headers.get('Content-Type')||'').includes('application/json'))throw httpError(415,'Se requiere Content-Type application/json.');try{return await request.json()}catch{throw httpError(400,'JSON no válido.')}}
function clean(v,m=500){return String(v??'').trim().slice(0,m)}
function httpError(status,message){const e=new Error(message);e.status=status;return e}
function randomToken(){const b=new Uint8Array(32);crypto.getRandomValues(b);return[...b].map(v=>v.toString(16).padStart(2,'0')).join('')}
async function sha256(v){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v));return[...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function safeEqual(a,b){a=String(a);b=String(b);if(a.length!==b.length)return false;let r=0;for(let i=0;i<a.length;i++)r|=a.charCodeAt(i)^b.charCodeAt(i);return r===0}
