import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createPgPool,pgDb,movieRows} from './pg-db.mjs';
import {now,later,randomId,hashPassword,checkPassword,currentSession,signedVideoToken,verifyVideoToken} from './auth-pg.mjs';
import {b2Ready,b2Origin,createB2Media,isB2Video,isB2Poster,videoKey,posterKey} from './b2-media.mjs';

const BASE=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.mp4':'video/mp4','.ico':'image/x-icon','.webmanifest':'application/manifest+json','.vtt':'text/vtt; charset=utf-8'};
const respond=(res,status,body,headers={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(JSON.stringify(body));};
const fail=(status,message)=>{const err=new Error(message);err.status=status;throw err;};
const isoPlus=(date,days=0,hours=0)=>new Date(new Date(date).getTime()+days*864e5+hours*36e5).toISOString();
const currency=(v)=>Number(v||0)/100;
function toPublicUser(s){return s?{id:s.user_id,email:s.email,displayName:s.display_name,role:s.role}:null;}
function readBody(req,limit=1e6){return new Promise((resolve,reject)=>{let size=0,chunks=[];req.on('data',d=>{size+=d.length;if(size>limit){reject(Object.assign(new Error('Conteúdo muito grande.'),{status:413}));req.destroy();}else chunks.push(d);});req.on('end',()=>{try{const text=Buffer.concat(chunks).toString('utf8');resolve(text?JSON.parse(text):{});}catch{reject(Object.assign(new Error('JSON inválido.'),{status:400}));}});req.on('error',reject);});}
function getBody(req){if(!req.headers['content-type']?.startsWith('application/json'))fail(415,'Use application/json.');return readBody(req);}
function serializeMovie(row){return {...row,rentalPrice:currency(row.rental_cents),tags:row.genres||[]};}
function safeFile(root,requested){const target=path.resolve(root,'.'+requested);if(target!==root&&!target.startsWith(root+path.sep))return null;return target;}
function staticFile(res,pathname,publicDir){const filepath=safeFile(publicDir,pathname==='/'?'/index.html':pathname);if(!filepath){respond(res,403,{error:'Acesso negado.'});return;}
  let stat;try{stat=fs.statSync(filepath);}catch{respond(res,404,{error:'Arquivo não encontrado.'});return;}
  if(!stat.isFile()){respond(res,404,{error:'Arquivo não encontrado.'});return;}
  const ext=path.extname(filepath).toLowerCase();if(!mime[ext]){respond(res,403,{error:'Extensão não permitida.'});return;}
  res.writeHead(200,{'Content-Type':mime[ext],'Content-Length':stat.size,'X-Content-Type-Options':'nosniff','Cache-Control':ext==='.html'?'no-cache':'public, max-age=3600'});fs.createReadStream(filepath).pipe(res);
}
function requireAuth(session){if(!session)fail(401,'Entre na sua conta para continuar.');return session;}
function requireAdmin(session){requireAuth(session);if(session.role!=='admin')fail(403,'Acesso restrito a administradores.');}
async function profileFor(db,s){requireAuth(s);if(!s.profile_id)fail(400,'Selecione um perfil.');return (await db.prepare('SELECT * FROM profiles WHERE id=? AND user_id=?').get(s.profile_id,s.user_id));}
async function currentSub(db,uid){if(!uid)return null;return (await db.prepare(`SELECT s.*,p.name plan_name,p.code plan_code FROM subscriptions s
  JOIN subscription_plans p ON p.id=s.plan_id
  WHERE s.user_id=? AND s.status='active' AND s.expires_at>? ORDER BY s.expires_at DESC LIMIT 1`).get(uid,now()))||null;}
async function currentRental(db,uid,mid){if(!uid)return null;return (await db.prepare(`SELECT * FROM rentals WHERE user_id=? AND movie_id=?
  AND ((started_at IS NULL AND start_by>?) OR (started_at IS NOT NULL AND expires_at>?))
  ORDER BY purchased_at DESC LIMIT 1`).get(uid,mid,now(),now()))||null;}
async function entitlement(db,movie,session){if(!movie?.published)return {allowed:false,reason:'Filme não publicado'};
  if(session?.role==='admin')return {allowed:true,source:'admin'};
  const profile=session&&(await db.prepare('SELECT * FROM profiles WHERE id=?').get(session.profile_id));
  if(profile?.is_kid && movie.age_rating>10)return {allowed:false,reason:'Bloqueado pelo perfil infantil'};
  if(movie.access_type==='free')return {allowed:true,source:'free'};
  const sub=(await currentSub(db,session?.user_id));
  if(sub&&['subscription','both'].includes(movie.access_type))return {allowed:true,source:'subscription'};
  const rental=(await currentRental(db,session?.user_id,movie.id));
  if(rental&&['rental','both'].includes(movie.access_type))return {allowed:true,source:'rental',rental};
  return {allowed:false,reason:!session?'Faça login para continuar.':'Conteúdo não incluído no seu acesso atual.'};
}
async function award(db,pid){const watched=(await db.prepare('SELECT COUNT(DISTINCT movie_id) n FROM watch_history WHERE profile_id=?').get(pid)).n;
  const achievements=[];if(watched>=1)achievements.push('primeiro');if(watched>=5)achievements.push('cinefilo');
  const classic=(await db.prepare(`SELECT COUNT(*) n FROM watch_history wh JOIN movies m ON m.id=wh.movie_id WHERE wh.profile_id=? AND m.year<1990`).get(pid)).n;
  if(classic)achievements.push('classicos');
  for(const c of achievements){const a=(await db.prepare('SELECT id FROM achievements WHERE code=?').get(c));if(a)(await db.prepare('INSERT OR IGNORE INTO user_achievements(profile_id,achievement_id,awarded_at) VALUES(?,?,?)').run(pid,a.id,now()));}
}
async function completePayment(db,payment,status){if(payment.status!=='pending')fail(409,'Este pagamento já foi finalizado.');
  await db.exec('BEGIN IMMEDIATE');try {
    (await db.prepare('UPDATE payments SET status=?,updated_at=? WHERE id=?').run(status,now(),payment.id));
    if(status==='approved'){
      if(payment.kind==='subscription') {
        const plan=(await db.prepare('SELECT * FROM subscription_plans WHERE id=? AND active=1').get(payment.product_id));
        if(!plan)fail(409,'Plano indisponível.');
        const active=(await currentSub(db,payment.user_id));
        const starts=active?active.expires_at:now();
        (await db.prepare(`INSERT INTO subscriptions(user_id,plan_id,payment_id,status,starts_at,expires_at,auto_renew) VALUES(?,?,?,?,?,?,0)`)
          .run(payment.user_id,plan.id,payment.id,'active',starts,isoPlus(starts,plan.duration_days)));
      } else {
        const m=(await db.prepare('SELECT * FROM movies WHERE id=?').get(payment.product_id));
        if(!m||!m.published)fail(409,'Filme indisponível.');
        const start=now();
        (await db.prepare(`INSERT INTO rentals(user_id,movie_id,payment_id,purchased_at,start_by) VALUES(?,?,?,?,?)`)
          .run(payment.user_id,m.id,payment.id,start,isoPlus(start,m.rental_start_days)));
      }
    }
    await db.exec('COMMIT');
  } catch(e) { await db.exec('ROLLBACK');throw e; }
}
function videoFile(res,file,req){let stat;try{stat=fs.statSync(file);}catch{respond(res,404,{error:'Arquivo de demonstração ausente. Execute npm run media.'});return;}
  const range=req.headers.range;
  if(range){const match=/^bytes=(\d*)-(\d*)$/.exec(range);if(!match){respond(res,416,{error:'Range inválido.'},{'Content-Range':`bytes */${stat.size}`});return;}
    const start=match[1]?Number(match[1]):0,end=match[2]?Math.min(Number(match[2]),stat.size-1):stat.size-1;
    if(start>=stat.size||end<start){respond(res,416,{error:'Range indisponível.'},{'Content-Range':`bytes */${stat.size}`});return;}
    res.writeHead(206,{'Content-Type':'video/mp4','Content-Length':end-start+1,'Content-Range':`bytes ${start}-${end}/${stat.size}`,'Accept-Ranges':'bytes','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});
    fs.createReadStream(file,{start,end}).pipe(res);
  } else {res.writeHead(200,{'Content-Type':'video/mp4','Content-Length':stat.size,'Accept-Ranges':'bytes','Cache-Control':'private, no-store'});fs.createReadStream(file).pipe(res);}
}
export function createApp({publicDir=path.join(BASE,'public'),secret=process.env.RETRO_SECRET||crypto.randomBytes(48).toString('hex'),cookieSecure=process.env.COOKIE_SECURE==='true'}={}) {
  const pool=createPgPool(process.env.DATABASE_URL),rate=new Map();
  const media=b2Ready()?createB2Media():null;
  const server=http.createServer(async(req,res)=>{
    const u=new URL(req.url,'http://local.test');const pathname=decodeURIComponent(u.pathname);
    const method=req.method||'GET';
    let client;
    try {client=await pool.connect();}
    catch(error){console.error('[Retro Play] PostgreSQL indisponível:',error.message);return respond(res,503,{error:'Banco de dados indisponível. Tente novamente.'});}
    const db=pgDb(client);
    try {
    const match=(pattern)=>pathname.match(pattern);
    const json=(code,body)=>respond(res,code,body);
    try {
      const session=await currentSession(db,req.headers.cookie||'');
      res.setHeader('X-Content-Type-Options','nosniff');
      res.setHeader('X-Frame-Options','DENY');
      res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
      if(process.env.NODE_ENV==='production') res.setHeader('Strict-Transport-Security','max-age=31536000; includeSubDomains');
      const storageOrigin=b2Origin();
      res.setHeader('Content-Security-Policy',`default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: ${storageOrigin}; media-src 'self' ${storageOrigin}; connect-src 'self' ${storageOrigin}; object-src 'none'; base-uri 'self'; frame-ancestors 'none'`);
      if(pathname.startsWith('/api/') && !['GET','HEAD','OPTIONS'].includes(method)){
        const origin=req.headers.origin;
        if(origin && new URL(origin).host!==req.headers.host)fail(403,'Origem da solicitação inválida.');
        if(session && req.headers['x-csrf-token']!==session.csrf_token)fail(403,'Token CSRF ausente ou inválido.');
      }
      // Em ambientes públicos, operações de pagamento simulado nunca podem liberar assinaturas.
      if(process.env.NODE_ENV==='production' && (
        pathname==='/api/payments' || pathname.startsWith('/api/sandbox/')
      )) fail(503,'Pagamentos indisponíveis neste ambiente de demonstração.');
      // Armazenamento local não é persistente no serviço web sem disco externo.
      if(process.env.NODE_ENV==='production' && pathname==='/api/admin/upload')
        fail(503,'Uploads desativados na hospedagem temporária. Configure armazenamento externo antes de liberar.');
      if(method==='GET'&&/^\/api\/media\/poster\/[a-f0-9-]{36}\.(png|jpg|webp)$/.test(pathname)){
        if(!media)fail(503,'Armazenamento de mídia não configurado.');
        // Public covers; videos remain protected by the session and entitlement.
        const key=posterKey(pathname);
        const found=await db.prepare('SELECT id FROM movies WHERE (poster=? OR banner=?) AND published=1 LIMIT 1').get(pathname,pathname);
        if(!found)fail(404,'Capa não publicada.');
        res.writeHead(302,{'Location':await media.download(key,600),'Cache-Control':'private, no-store'});return res.end();
      }
      if(method==='POST'&&pathname==='/api/admin/upload/prepare'){
        requireAdmin(session);
        if(!media)fail(503,'Backblaze B2 não configurado no servidor.');
        const input=await getBody(req);
        return json(200,await media.prepare({kind:input.kind,contentType:input.contentType,size:input.size,owner:session.user_id}));
      }
      if(method==='GET'&&pathname==='/api/health')return json(200,{ok:true,version:'3.1.0',database:'postgresql',mode:'sandbox'});
      if(method==='GET'&&pathname==='/api/bootstrap'){
        const profiles=session?(await db.prepare('SELECT id,name,avatar,is_kid FROM profiles WHERE user_id=? ORDER BY id').all(session.user_id)):[];
        return json(200,{user:toPublicUser(session),csrf:session?.csrf_token||null,activeProfileId:session?.profile_id||null,
          profiles,genres:(await db.prepare('SELECT * FROM genres ORDER BY name').all()),plans:(await db.prepare('SELECT * FROM subscription_plans WHERE active=1 ORDER BY price_cents').all()),
          movies:(await movieRows(db)).map(serializeMovie),subscription:(await currentSub(db,session?.user_id))});
      }
      if(method==='GET'&&pathname==='/api/series'){
        const rows=(await db.prepare(`SELECT s.id,s.title,s.synopsis,s.published,
          (SELECT m.poster FROM episodes e JOIN movies m ON m.id=e.movie_id WHERE e.series_id=s.id AND m.published=1 ORDER BY e.season,e.number LIMIT 1) poster,
          (SELECT COUNT(*) FROM episodes e JOIN movies m ON m.id=e.movie_id WHERE e.series_id=s.id AND m.published=1) episode_count
          FROM series s WHERE s.published=1 ORDER BY s.id`).all());
        return json(200,{series:rows.filter(x=>x.episode_count>0)});
      }
      if(method==='GET'&&match(/^\/api\/series\/(\d+)$/)){
        const id=Number(match(/^\/api\/series\/(\d+)$/)[1]);
        const entry=(await db.prepare('SELECT id,title,synopsis,published FROM series WHERE id=? AND published=1').get(id));
        if(!entry)fail(404,'Série não encontrada.');
        // Carregar IDs dos filmes e autorização com consulta independente, sem confiar no navegador.
        const all=(await db.prepare(`SELECT e.id,e.title,e.season,e.number,e.movie_id,m.poster,m.synopsis,m.access_type,m.age_rating,m.rental_cents FROM episodes e
          JOIN movies m ON m.id=e.movie_id WHERE e.series_id=? AND m.published=1 ORDER BY e.season,e.number`).all(id));
        return json(200,{series:entry,episodes:await Promise.all(all.map(async x=>({...x,access:(await entitlement(db,(await db.prepare('SELECT * FROM movies WHERE id=?').get(x.movie_id)),session))})))});
      }
      if(method==='GET'&&pathname==='/api/movies')return json(200,{movies:(await movieRows(db,{search:u.searchParams.get('q')||'',genre:u.searchParams.get('genre')||'',decade:u.searchParams.get('decade')||'',access:u.searchParams.get('access')||'',sort:u.searchParams.get('sort')||'recent'})).map(serializeMovie)});
      if(method==='GET'&&(match(/^\/api\/movies\/(\d+)$/))) {
        const mid=Number(match(/^\/api\/movies\/(\d+)$/)[1]);const m=(await movieRows(db)).find(x=>x.id===mid);if(!m)fail(404,'Filme não encontrado.');
        return json(200,{movie:serializeMovie(m),access:(await entitlement(db,m,session)),reviews:(await db.prepare(`SELECT r.stars,r.body,r.updated_at,p.name FROM reviews r JOIN profiles p ON p.id=r.profile_id WHERE r.movie_id=? ORDER BY r.updated_at DESC LIMIT 30`).all(mid))});
      }
      if(method==='POST'&&(pathname==='/api/auth/login'||pathname==='/api/auth/register')){
        const ip=req.socket.remoteAddress||'unknown', key=`${ip}|${pathname}`, r=rate.get(key)||{count:0,at:Date.now()};
        if(Date.now()-r.at>15*60*1000){r.count=0;r.at=Date.now();}if(++r.count>20)fail(429,'Muitas tentativas. Tente novamente mais tarde.');rate.set(key,r);
        const data=await getBody(req),email=String(data.email||'').trim().toLowerCase(),password=String(data.password||'');
        if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>200)fail(400,'Informe um e-mail válido.');
        if(pathname.endsWith('register')){
          const name=String(data.name||'').trim();if(name.length<2||name.length>70||password.length<10||password.length>200)fail(400,'Use nome de 2 a 70 caracteres e senha de 10 a 200 caracteres.');
          if((await db.prepare('SELECT id FROM users WHERE email=?').get(email)))fail(409,'E-mail já cadastrado.');
          const id=(await db.prepare('INSERT INTO users(email,password_hash,display_name,created_at) VALUES(?,?,?,?)').run(email,hashPassword(password),name,now())).lastInsertRowid;
          (await db.prepare('INSERT INTO profiles(user_id,name,avatar,created_at) VALUES(?,?,?,?)').run(id,name.split(' ')[0],'🌸',now()));
        }
        const user=(await db.prepare('SELECT * FROM users WHERE email=?').get(email));
        if(!user||!checkPassword(password,user.password_hash))fail(401,'Credenciais inválidas.');
        const tok=randomId(),csrf=randomId(),profile=(await db.prepare('SELECT id FROM profiles WHERE user_id=? ORDER BY id LIMIT 1').get(user.id));
        (await db.prepare('INSERT INTO sessions(id,user_id,profile_id,csrf_token,expires_at) VALUES(?,?,?,?,?)').run(tok,user.id,profile?.id||null,csrf,later(30*864e5)));
        const cookie=`retro_session=${tok}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${30*86400}`+(cookieSecure?'; Secure':'');
        return respond(res,200,{user:{id:user.id,email:user.email,displayName:user.display_name,role:user.role},csrf},{'Set-Cookie':cookie});
      }
      if(method==='POST'&&pathname==='/api/auth/logout'){
        if(session)(await db.prepare('DELETE FROM sessions WHERE id=?').run(session.id));
        return respond(res,200,{ok:true},{'Set-Cookie':'retro_session=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0'});
      }
      if(method==='PATCH'&&pathname==='/api/account'){
        requireAuth(session);const {displayName}=await getBody(req),name=String(displayName||'').trim();
        if(name.length<2||name.length>70)fail(400,'O nome deve ter entre 2 e 70 caracteres.');
        (await db.prepare('UPDATE users SET display_name=? WHERE id=?').run(name,session.user_id));
        return json(200,{ok:true,displayName:name});
      }
      if(method==='POST'&&pathname==='/api/account/password'){
        requireAuth(session);const {currentPassword,newPassword}=await getBody(req);
        const cred=(await db.prepare('SELECT password_hash FROM users WHERE id=?').get(session.user_id));
        if(!checkPassword(String(currentPassword||''),cred.password_hash))fail(403,'A senha atual está incorreta.');
        if(typeof newPassword!=='string'||newPassword.length<10||newPassword.length>200)fail(400,'A nova senha deve ter entre 10 e 200 caracteres.');
        if(newPassword===currentPassword)fail(400,'Escolha uma senha diferente da atual.');
        await db.exec('BEGIN IMMEDIATE');try{
          (await db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(newPassword),session.user_id));
          (await db.prepare('DELETE FROM sessions WHERE user_id=? AND id<>?').run(session.user_id,session.id));
          await db.exec('COMMIT');
        }catch(e){await db.exec('ROLLBACK');throw e;}
        return json(200,{ok:true});
      }
      if(method==='POST'&&pathname==='/api/profiles'){
        requireAuth(session);const data=await getBody(req),name=String(data.name||'').trim(),avatar=String(data.avatar||'🌷');
        if(name.length<2||name.length>40||avatar.length>8)fail(400,'Nome ou avatar inválido.');
        const count=(await db.prepare('SELECT COUNT(*) n FROM profiles WHERE user_id=?').get(session.user_id)).n;
        if(count>=5)fail(409,'Limite de 5 perfis por conta.');
        const id=(await db.prepare('INSERT INTO profiles(user_id,name,avatar,is_kid,created_at) VALUES(?,?,?,?,?)').run(session.user_id,name,avatar,data.isKid?1:0,now())).lastInsertRowid;
        return json(201,{id:Number(id)});
      }
      if(method==='POST'&&pathname==='/api/profiles/select'){
        requireAuth(session);const {profileId}=await getBody(req);
        const p=(await db.prepare('SELECT id FROM profiles WHERE id=? AND user_id=?').get(profileId,session.user_id));if(!p)fail(404,'Perfil não encontrado.');
        (await db.prepare('UPDATE sessions SET profile_id=? WHERE id=?').run(p.id,session.id));return json(200,{ok:true});
      }
      if(method==='GET'&&pathname==='/api/me'){
        requireAuth(session);const p=(await profileFor(db,session));
        const favorites=(await db.prepare('SELECT movie_id FROM favorites WHERE profile_id=?').all(p.id)).map(x=>x.movie_id);
        const progress=(await db.prepare('SELECT movie_id,position_sec,updated_at,completed FROM watch_progress WHERE profile_id=? ORDER BY updated_at DESC').all(p.id));
        const rentals=(await db.prepare(`SELECT r.*,m.title,m.poster FROM rentals r JOIN movies m ON m.id=r.movie_id WHERE r.user_id=? ORDER BY r.purchased_at DESC`).all(session.user_id));
        const payments=(await db.prepare('SELECT * FROM payments WHERE user_id=? ORDER BY created_at DESC LIMIT 100').all(session.user_id));
        const achievements=(await db.prepare(`SELECT a.title,a.icon,ua.awarded_at FROM user_achievements ua JOIN achievements a ON a.id=ua.achievement_id WHERE ua.profile_id=?`).all(p.id));
        const stats=(await db.prepare(`SELECT COUNT(*) sessions,COALESCE(SUM(m.duration_sec),0) total_seconds FROM watch_history w JOIN movies m ON m.id=w.movie_id WHERE w.profile_id=?`).get(p.id));
        const favGenre=(await db.prepare(`SELECT g.name,count(*) n FROM watch_history w JOIN movie_genres mg ON mg.movie_id=w.movie_id JOIN genres g ON g.id=mg.genre_id WHERE w.profile_id=? GROUP BY g.id ORDER BY n DESC LIMIT 1`).get(p.id));
        const favDecade=(await db.prepare(`SELECT (m.year/10)*10 decade,count(*) n FROM watch_history w JOIN movies m ON m.id=w.movie_id WHERE w.profile_id=? GROUP BY decade ORDER BY n DESC LIMIT 1`).get(p.id));
        return json(200,{user:toPublicUser(session),profile:p,favorites,progress,rentals,payments,achievements,stats:{...stats,genre:favGenre?.name||null,decade:favDecade?.decade||null},subscription:(await currentSub(db,session.user_id))});
      }
      if(method==='POST'&&pathname==='/api/favorites'){
        const p=(await profileFor(db,session)),{movieId}=await getBody(req);
        if(!(await db.prepare('SELECT id FROM movies WHERE id=? AND published=1').get(movieId)))fail(404,'Filme não encontrado.');
        const has=(await db.prepare('SELECT 1 FROM favorites WHERE profile_id=? AND movie_id=?').get(p.id,movieId));
        if(has)(await db.prepare('DELETE FROM favorites WHERE profile_id=? AND movie_id=?').run(p.id,movieId));
        else (await db.prepare('INSERT INTO favorites(profile_id,movie_id) VALUES(?,?)').run(p.id,movieId));
        return json(200,{favorite:!has});
      }
      if(method==='POST'&&pathname==='/api/reviews'){
        const p=(await profileFor(db,session)),{movieId,stars,body=''}=await getBody(req);
        if(!(await db.prepare('SELECT id FROM movies WHERE id=? AND published=1').get(movieId)))fail(404,'Filme não encontrado.');
        if(!Number.isInteger(stars)||stars<1||stars>5||String(body).length>600)fail(400,'Avaliação inválida.');
        (await db.prepare(`INSERT INTO reviews(profile_id,movie_id,stars,body,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(profile_id,movie_id) DO UPDATE SET stars=excluded.stars,body=excluded.body,updated_at=excluded.updated_at`).run(p.id,movieId,stars,String(body),now()));return json(200,{ok:true});
      }
      if(method==='POST'&&pathname==='/api/payments'){
        requireAuth(session);const {kind,productId}=await getBody(req);if(!['rental','subscription'].includes(kind))fail(400,'Tipo inválido.');
        let amount;if(kind==='subscription') {const plan=(await db.prepare('SELECT * FROM subscription_plans WHERE id=? AND active=1').get(productId));if(!plan)fail(404,'Plano indisponível.');amount=plan.price_cents;}
        else {const m=(await db.prepare('SELECT * FROM movies WHERE id=? AND published=1').get(productId));if(!m||!['rental','both'].includes(m.access_type))fail(404,'Filme indisponível para aluguel.');amount=m.rental_cents;}
        const ref=crypto.randomUUID(),ts=now();const result=(await db.prepare(`INSERT INTO payments(user_id,kind,product_id,amount_cents,status,provider,external_reference,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)`)
          .run(session.user_id,kind,Number(productId),amount,'pending','internal_sandbox',ref,ts,ts));
        return json(201,{payment:{id:Number(result.lastInsertRowid),kind,productId,amountCents:amount,status:'pending',provider:'internal_sandbox'},sandboxOnly:true});
      }
      if(method==='POST'&&match(/^\/api\/sandbox\/payments\/(\d+)\/(approve|decline)$/)){
        requireAuth(session);const [,pid,action]=match(/^\/api\/sandbox\/payments\/(\d+)\/(approve|decline)$/);
        const payment=(await db.prepare('SELECT * FROM payments WHERE id=? AND user_id=?').get(Number(pid),session.user_id));if(!payment)fail(404,'Pagamento não encontrado.');
        (await completePayment(db,payment,action==='approve'?'approved':'declined'));return json(200,{ok:true,status:action==='approve'?'approved':'declined',sandboxOnly:true});
      }
      if(method==='POST'&&match(/^\/api\/subscriptions\/(\d+)\/cancel$/)){
        requireAuth(session);const sid=Number(match(/^\/api\/subscriptions\/(\d+)\/cancel$/)[1]);
        const sub=(await db.prepare('SELECT * FROM subscriptions WHERE id=? AND user_id=?').get(sid,session.user_id));if(!sub)fail(404,'Assinatura não encontrada.');
        (await db.prepare('UPDATE subscriptions SET auto_renew=0,cancel_requested_at=COALESCE(cancel_requested_at,?) WHERE id=?').run(now(),sid));return json(200,{ok:true,accessUntil:sub.expires_at});
      }
      if(method==='POST'&&match(/^\/api\/movies\/(\d+)\/play$/)){
        const mid=Number(match(/^\/api\/movies\/(\d+)\/play$/)[1]);
        const m=(await db.prepare('SELECT * FROM movies WHERE id=?').get(mid));if(!m||!m.published)fail(404,'Filme não encontrado.');
        const access=(await entitlement(db,m,session));if(!access.allowed)fail(403,access.reason);
        if(access.source==='rental'&&!access.rental.started_at){const start=now();(await db.prepare('UPDATE rentals SET started_at=?,expires_at=? WHERE id=?').run(start,isoPlus(start,0,m.rental_watch_hours),access.rental.id));}
        if(session?.profile_id){(await db.prepare('INSERT INTO watch_history(profile_id,movie_id,watched_at) VALUES(?,?,?)').run(session.profile_id,m.id,now()));(await award(db,session.profile_id));}
        const token=signedVideoToken(secret,m.id,session?.user_id||0);
        const hlsAvailable=!isB2Video(m.video_file)&&fs.existsSync(path.join(BASE,'storage','hls',path.basename(m.video_file,'.mp4'),'master.m3u8'));
        return json(200,{videoUrl:`/api/stream/${m.id}?token=${encodeURIComponent(token)}`,resumeAt:session?.profile_id?((await db.prepare('SELECT position_sec FROM watch_progress WHERE profile_id=? AND movie_id=?').get(session.profile_id,m.id))?.position_sec||0):0,format:'mp4',hlsUrl:hlsAvailable?`/api/hls/${m.id}/master.m3u8?token=${encodeURIComponent(token)}`:null,hls240Url:hlsAvailable?`/api/hls/${m.id}/240p/index.m3u8?token=${encodeURIComponent(token)}`:null,hls360Url:hlsAvailable?`/api/hls/${m.id}/360p/index.m3u8?token=${encodeURIComponent(token)}`:null,demo:!!m.demo});
      }
      if(method==='POST'&&pathname==='/api/progress'){
        const p=(await profileFor(db,session));const {movieId,positionSec}=await getBody(req),m=(await db.prepare('SELECT * FROM movies WHERE id=?').get(movieId));
        if(!m)fail(404,'Filme não encontrado.');if(!(await entitlement(db,m,session)).allowed)fail(403,'Sem acesso ao conteúdo.');
        if(typeof positionSec!=='number'||!Number.isFinite(positionSec)||positionSec<0||positionSec>m.duration_sec+3600)fail(400,'Posição inválida.');
        (await db.prepare(`INSERT INTO watch_progress(profile_id,movie_id,position_sec,updated_at,completed) VALUES(?,?,?,?,?) ON CONFLICT(profile_id,movie_id) DO UPDATE SET position_sec=excluded.position_sec,updated_at=excluded.updated_at,completed=excluded.completed`)
          .run(p.id,m.id,positionSec,now(),positionSec>=m.duration_sec*0.9?1:0));
        return json(200,{ok:true});
      }
      if(method==='GET'&&match(/^\/api\/stream\/(\d+)$/)){
        const mid=Number(match(/^\/api\/stream\/(\d+)$/)[1]);const m=(await db.prepare('SELECT * FROM movies WHERE id=?').get(mid));
        if(!m||!m.published)fail(404,'Vídeo não encontrado.');
        if(!verifyVideoToken(secret,u.searchParams.get('token'),mid,session?.user_id||0)||!(await entitlement(db,m,session)).allowed)fail(403,'Acesso ao vídeo negado.');
        if(isB2Video(m.video_file)){
          if(!media)fail(503,'Armazenamento indisponível.');
          // Short lived B2 URL. This check occurs on each request to this endpoint.
          res.writeHead(302,{'Location':await media.download(videoKey(m.video_file),300),'Cache-Control':'private, no-store'});return res.end();
        }
        const folder=path.join(BASE,'storage','videos');const filename=path.basename(m.video_file);
        return videoFile(res,path.join(folder,filename),req);
      }
      if(method==='GET'&&match(/^\/api\/hls\/(\d+)\/(master\.m3u8|(?:240p|360p)\/(?:index\.m3u8|seg_\d{3}\.ts))$/)){
        const [,strId,relative]=match(/^\/api\/hls\/(\d+)\/(master\.m3u8|(?:240p|360p)\/(?:index\.m3u8|seg_\d{3}\.ts))$/);
        const mid=Number(strId),m=(await db.prepare('SELECT * FROM movies WHERE id=?').get(mid));
        if(!m||!m.published)fail(404,'Vídeo não encontrado.');
        const token=u.searchParams.get('token');
        if(!verifyVideoToken(secret,token,mid,session?.user_id||0)||!(await entitlement(db,m,session)).allowed)fail(403,'Acesso ao HLS negado.');
        const folder=path.join(BASE,'storage','hls',path.basename(m.video_file,'.mp4'));
        const target=path.resolve(folder,relative);
        if(!target.startsWith(folder+path.sep))fail(403,'Caminho inválido.');
        if(!fs.existsSync(target))fail(404,'Segmento HLS indisponível.');
        if(target.endsWith('.m3u8')){
          const playlist=fs.readFileSync(target,'utf8').split('\n').map(line=>line && !line.startsWith('#')?line+`?token=${encodeURIComponent(token)}`:line).join('\n');
          res.writeHead(200,{'Content-Type':'application/vnd.apple.mpegurl','Cache-Control':'private, no-store'});return res.end(playlist);
        }
        res.writeHead(200,{'Content-Type':'video/mp2t','Cache-Control':'private, no-store'});return fs.createReadStream(target).pipe(res);
      }
      if(pathname.startsWith('/api/admin/')){
        requireAdmin(session);
        if(method==='GET'&&pathname==='/api/admin/stats'){
          const num=async(sql)=>(await db.prepare(sql).get()).n;
          return json(200,{users:await num('SELECT COUNT(*) n FROM users'),movies:await num('SELECT COUNT(*) n FROM movies'),
            activeSubscriptions:(await db.prepare("SELECT COUNT(*) n FROM subscriptions WHERE status='active' AND expires_at>?").get(now())).n,
            rentals:await num('SELECT COUNT(*) n FROM rentals'),payments:await num('SELECT COUNT(*) n FROM payments'),
            revenueCents:await num("SELECT COALESCE(SUM(amount_cents),0) n FROM payments WHERE status='approved'"),
            usersList:(await db.prepare('SELECT id,email,display_name,role,created_at FROM users ORDER BY id DESC LIMIT 60').all()),
            paymentsList:(await db.prepare('SELECT id,kind,amount_cents,status,created_at FROM payments ORDER BY id DESC LIMIT 60').all())});
        }
        if(method==='GET'&&pathname==='/api/admin/series'){
          const rows=(await db.prepare(`SELECT s.*,COUNT(e.id) episode_count FROM series s LEFT JOIN episodes e ON e.series_id=s.id GROUP BY s.id ORDER BY s.id DESC`).all());
          return json(200,{series:rows});
        }
        if(method==='POST'&&pathname==='/api/admin/series'){
          const data=await getBody(req),title=String(data.title||'').trim(),synopsis=String(data.synopsis||'').trim();
          if(title.length<3||title.length>100||synopsis.length>1000)fail(400,'Título ou sinopse inválidos.');
          const result=(await db.prepare('INSERT INTO series(title,synopsis,published) VALUES(?,?,1)').run(title,synopsis));
          return json(201,{id:Number(result.lastInsertRowid)});
        }
        if(method==='POST'&&match(/^\/api\/admin\/series\/(\d+)\/episodes$/)){
          const sid=Number(match(/^\/api\/admin\/series\/(\d+)\/episodes$/)[1]);
          if(!(await db.prepare('SELECT id FROM series WHERE id=?').get(sid)))fail(404,'Série não encontrada.');
          const data=await getBody(req),mid=Number(data.movieId),season=Number(data.season),number=Number(data.number);
          const m=(await db.prepare('SELECT id,title,video_file FROM movies WHERE id=?').get(mid));
          if(!m||!Number.isInteger(season)||season<1||season>99||!Number.isInteger(number)||number<1||number>999)fail(400,'Episódio inválido.');
          try{const result=(await db.prepare('INSERT INTO episodes(series_id,season,number,title,video_file,movie_id) VALUES(?,?,?,?,?,?)').run(sid,season,number,m.title,m.video_file,m.id));
          return json(201,{id:Number(result.lastInsertRowid)});}catch(e){if(e.code==='23505')fail(409,'Já existe episódio com esta temporada e número.');throw e;}
        }
        if(method==='PATCH'&&match(/^\/api\/admin\/series\/(\d+)$/)){
          const sid=Number(match(/^\/api\/admin\/series\/(\d+)$/)[1]);
          const data=await getBody(req),entry=(await db.prepare('SELECT id FROM series WHERE id=?').get(sid));
          if(!entry)fail(404,'Série não encontrada.');
          if(typeof data.published!=='boolean')fail(400,'Estado de publicação inválido.');
          (await db.prepare('UPDATE series SET published=? WHERE id=?').run(data.published?1:0,sid));return json(200,{ok:true});
        }
        if(method==='GET'&&pathname==='/api/admin/movies')return json(200,{movies:(await movieRows(db,{includeUnpublished:true})).map(serializeMovie)});
        if(method==='POST'&&pathname==='/api/admin/movies'){
          const data=await getBody(req),title=String(data.title||'').trim(),slug=String(data.slug||'').trim().toLowerCase();
          if(title.length<2||title.length>100||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))fail(400,'Título ou slug inválido.');
          if(!['free','subscription','rental','both'].includes(data.accessType))fail(400,'Tipo de acesso inválido.');
          const videoFile=String(data.videoFile||'cafe-das-estrelas.mp4').trim();
          if(isB2Video(videoFile)){
            if(!media)fail(503,'Backblaze B2 indisponível.');
            await media.verify({proof:data.videoUploadToken,kind:'video',owner:session.user_id,path:videoFile});
          } else {
            if(process.env.NODE_ENV==='production')fail(400,'Envie um MP4 para o B2.');
            if(!/^[a-zA-Z0-9-]+\.mp4$/.test(videoFile)||!fs.existsSync(path.join(BASE,'storage','videos',videoFile)))fail(400,'Vídeo local inválido.');
          }
          const poster=String(data.poster||'/assets/posters/01.svg');
          if(isB2Poster(poster)){
            if(!media)fail(503,'Backblaze B2 indisponível.');
            await media.verify({proof:data.posterUploadToken,kind:'poster',owner:session.user_id,path:poster});
          }else if(!/^\/(assets\/posters\/|uploads\/)[a-zA-Z0-9._-]+\.(svg|png|jpg|jpeg|webp)$/.test(poster))fail(400,'Capa inválida.');
          if(data.genres!==undefined&&(!Array.isArray(data.genres)||data.genres.length>8||data.genres.some(x=>typeof x!=='string'||x.trim().length<2||x.trim().length>50)))fail(400,'Gêneros inválidos.');
          const result=(await db.prepare(`INSERT INTO movies(slug,title,synopsis,year,duration_sec,age_rating,director,cast_text,access_type,rental_cents,rental_start_days,rental_watch_hours,poster,banner,video_file,published,featured,demo,created_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(slug,title,String(data.synopsis||''),Number(data.year)||2026,Math.max(1,Number(data.durationSec)||300),Number(data.ageRating)||0,String(data.director||''),String(data.castText||''),data.accessType,Math.max(0,Number(data.rentalCents)||0),Number(data.rentalStartDays)||30,Number(data.rentalWatchHours)||48,poster,poster,videoFile,1,0,0,now()));
          for(const genre of (data.genres||[])){
            const name=genre.trim();(await db.prepare('INSERT OR IGNORE INTO genres(name) VALUES(?)').run(name));
            const gid=(await db.prepare('SELECT id FROM genres WHERE name=?').get(name)).id;
            (await db.prepare('INSERT OR IGNORE INTO movie_genres(movie_id,genre_id) VALUES(?,?)').run(result.lastInsertRowid,gid));
          }
          return json(201,{id:Number(result.lastInsertRowid)});
        }
        if(method==='PATCH'&&match(/^\/api\/admin\/movies\/(\d+)$/)){
          const mid=Number(match(/^\/api\/admin\/movies\/(\d+)$/)[1]),m=(await db.prepare('SELECT * FROM movies WHERE id=?').get(mid));if(!m)fail(404,'Filme não encontrado.');
          const data=await getBody(req),patch={};
          for(const [client,col] of [['title','title'],['synopsis','synopsis'],['director','director'],['castText','cast_text'],['year','year'],['ageRating','age_rating'],['durationSec','duration_sec'],['rentalStartDays','rental_start_days'],['rentalWatchHours','rental_watch_hours'],['published','published'],['featured','featured'],['rentalCents','rental_cents'],['accessType','access_type']])if(data[client]!==undefined)patch[col]=data[client];
          if(patch.access_type&&!['free','subscription','rental','both'].includes(patch.access_type))fail(400,'Tipo inválido.');
          if(patch.title!==undefined&&(typeof patch.title!=='string'||patch.title.length<2))fail(400,'Título inválido.');
          for(const c of ['year','age_rating','duration_sec','rental_start_days','rental_watch_hours','rental_cents'])if(patch[c]!==undefined){patch[c]=Number(patch[c]);if(!Number.isInteger(patch[c])||patch[c]<0||patch[c]>1e9)fail(400,'Número inválido.');}
          if(data.genres!==undefined&&(!Array.isArray(data.genres)||data.genres.length>8||data.genres.some(x=>typeof x!=='string'||x.trim().length<2||x.trim().length>50)))fail(400,'Gêneros inválidos.');
          for(const c of ['synopsis','director','cast_text'])if(patch[c]!==undefined&&(typeof patch[c]!=='string'||patch[c].length>3000))fail(400,'Texto inválido.');
          for(const c of ['published','featured'])if(patch[c]!==undefined)patch[c]=patch[c]?1:0;
          if(!Object.keys(patch).length&&data.genres===undefined)fail(400,'Nada para atualizar.');
          await db.exec('BEGIN IMMEDIATE');try{
            const columns=Object.keys(patch);if(columns.length)(await db.prepare(`UPDATE movies SET ${columns.map(c=>c+'=?').join(', ')} WHERE id=?`).run(...columns.map(c=>patch[c]),mid));
            if(data.genres!==undefined){
              (await db.prepare('DELETE FROM movie_genres WHERE movie_id=?').run(mid));
              for(const genre of data.genres){const name=genre.trim();(await db.prepare('INSERT OR IGNORE INTO genres(name) VALUES(?)').run(name));
                const gid=(await db.prepare('SELECT id FROM genres WHERE name=?').get(name)).id;
                (await db.prepare('INSERT OR IGNORE INTO movie_genres(movie_id,genre_id) VALUES(?,?)').run(mid,gid));}
            }
            await db.exec('COMMIT');
          }catch(e){await db.exec('ROLLBACK');throw e;}
          return json(200,{ok:true});
        }
        if(method==='PATCH'&&match(/^\/api\/admin\/plans\/(\d+)$/)){
          const id=Number(match(/^\/api\/admin\/plans\/(\d+)$/)[1]),data=await getBody(req);
          const price=Number(data.priceCents);if(!Number.isInteger(price)||price<0||price>1e8)fail(400,'Preço inválido.');
          (await db.prepare('UPDATE subscription_plans SET price_cents=? WHERE id=?').run(price,id));return json(200,{ok:true});
        }
        if(method==='POST'&&pathname==='/api/admin/upload'){
          const kind=u.searchParams.get('kind');const format=req.headers['content-type']||'';
          const allowed=kind==='poster'?{'image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp'}:kind==='video'?{'video/mp4':'.mp4'}:{};
          const ext=allowed[format];if(!ext)fail(415,'Formato não permitido (PNG/JPEG/WEBP ou MP4).');
          const max=kind==='video'?120*1024*1024:5*1024*1024;const incoming=Number(req.headers['content-length']||0);if(incoming>max)fail(413,'Arquivo muito grande.');
          const dir=kind==='video'?path.join(BASE,'storage','videos'):path.join(publicDir,'uploads');fs.mkdirSync(dir,{recursive:true});
          const basename=crypto.randomUUID()+ext,target=path.join(dir,basename);const out=fs.createWriteStream(target,{flags:'wx'});
          let size=0;try{for await(const piece of req){size+=piece.length;if(size>max)fail(413,'Arquivo muito grande.');if(!out.write(piece))await new Promise(r=>out.once('drain',r));}await new Promise(r=>out.end(r));}
          catch(e){out.destroy();try{fs.unlinkSync(target);}catch{}throw e;}
          if(!size){fs.unlinkSync(target);fail(400,'Arquivo vazio.');}
          const prefix=Buffer.alloc(Math.min(size,32));const fd=fs.openSync(target,'r');try{fs.readSync(fd,prefix,0,prefix.length,0);}finally{fs.closeSync(fd);}
          const png=prefix.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'));
          const jpg=prefix[0]===0xff&&prefix[1]===0xd8&&prefix[2]===0xff;
          const webp=prefix.toString('ascii',0,4)==='RIFF'&&prefix.toString('ascii',8,12)==='WEBP';
          const mp4=prefix.toString('ascii',4,8)==='ftyp';
          const valid=kind==='video'?mp4:format==='image/png'?png:format==='image/jpeg'?jpg:webp;
          if(!valid){fs.unlinkSync(target);fail(415,'O conteúdo do arquivo não corresponde ao formato informado.');}
          return json(201,{path:kind==='video'?basename:`/uploads/${basename}`,size});
        }
      }
      if(pathname.startsWith('/api/'))return json(404,{error:'Rota não encontrada.'});
      if(method!=='GET'&&method!=='HEAD')return json(405,{error:'Método não permitido.'});
      return staticFile(res,pathname,publicDir);
    } catch(error) {
      if(error.code==='23505' && !error.status){error.status=409;error.message='Registro já existe.';}
      if(!res.headersSent)respond(res,error.status||500,{error:error.status?error.message:'Erro interno no servidor.'});
      if(!error.status)console.error('[Retro Play]',error);
    }
    } finally {client.release();}
  });
  return {server,pool,close:async()=>{server.closeAllConnections?.();server.close();await pool.end();}};
}
