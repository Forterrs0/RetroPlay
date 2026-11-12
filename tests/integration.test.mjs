import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {createApp} from '../server/app.mjs';
import {hashPassword} from '../server/auth.mjs';

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'retro-play-tests-'));
const {server,db}=createApp({dbPath:path.join(temp,'test.sqlite'),secret:'testing-secret-do-not-use-in-production'});
server.listen(0,'127.0.0.1');
await once(server,'listening');
const base=`http://127.0.0.1:${server.address().port}`;
async function call(url,{method='GET',body,session,raw=false,headers={}}={}){
  const h={...headers};if(session?.cookie)h.cookie=session.cookie;if(session?.csrf&&method!=='GET')h['x-csrf-token']=session.csrf;
  if(body!==undefined){h['content-type']='application/json';body=JSON.stringify(body);}
  const r=await fetch(base+url,{method,body,headers:h});
  if(raw)return r;
  let j;try{j=await r.json();}catch{j={};}
  return {status:r.status,json:j,headers:r.headers};
}
async function register(email,name='Pessoa Teste'){
  const result=await call('/api/auth/register',{method:'POST',body:{name,email,password:'senha-segura-12345'}});
  assert.equal(result.status,200,JSON.stringify(result.json));
  const cookie=result.headers.get('set-cookie').split(';')[0];
  const bootstrap=await call('/api/bootstrap',{headers:{cookie}});
  return {cookie,csrf:bootstrap.json.csrf};
}
async function payment(session,kind,productId,approve=true){
  const first=await call('/api/payments',{session,method:'POST',body:{kind,productId}});
  assert.equal(first.status,201,JSON.stringify(first.json));
  const second=await call(`/api/sandbox/payments/${first.json.payment.id}/${approve?'approve':'decline'}`,{session,method:'POST',body:{}});
  assert.equal(second.status,200,JSON.stringify(second.json));
  return first.json.payment;
}

test('Fluxos integrados do Retro Play',async t=>{
  let userA,userB,admin,paymentId,tokenUrl;
  await t.test('Catálogo público, busca e interface disponíveis',async()=>{
    let r=await call('/api/health');assert.equal(r.json.mode,'sandbox');
    r=await call('/api/bootstrap');assert.equal(r.json.movies.length,8);assert.equal(r.json.plans.length,2);
    r=await call('/api/movies?q=Estrelas');assert(r.json.movies.length>=2);
    r=await call('/api/movies?genre=Suspense');assert(r.json.movies.every(m=>m.genres.includes('Suspense')));
    r=await call('/api/movies?decade=1980');assert(r.json.movies.every(m=>m.year>=1980&&m.year<1990));
    r=await call('/styles.css',{raw:true});assert.equal(r.status,200);const css=await r.text();assert(css.includes('#f9e8e7'));assert(css.includes('html[data-theme="dark"]'));
    r=await call('/app.js',{raw:true});assert.equal(r.status,200);assert((await r.text()).includes('data-action="theme"'));
  });
  await t.test('Séries e temporadas demonstrativas',async()=>{
    const listing=await call('/api/series');assert.equal(listing.status,200);assert.equal(listing.json.series.length,2);
    let r=await call('/api/series/1');assert.equal(r.status,200);assert.equal(r.json.episodes.length,4);
    assert.equal(r.json.episodes[0].access.allowed,true);
    assert.equal(r.json.episodes[1].access.allowed,false);
    r=await call('/api/series/999');assert.equal(r.status,404);
  });
  await t.test('Vídeos não são públicos e assinatura está bloqueada',async()=>{
    let r=await call('/storage/videos/cafe-das-estrelas.mp4');assert.equal(r.status,404);
    r=await call('/api/movies/2/play',{method:'POST',body:{}});assert.equal(r.status,403);
    r=await call('/api/movies/1/play',{method:'POST',body:{}});assert.equal(r.status,200);
    const stream=await call(r.json.videoUrl,{raw:true,headers:{range:'bytes=0-64'}});
    assert.equal(stream.status,206);assert.equal((await stream.arrayBuffer()).byteLength,65);
  });
  await t.test('Cadastro, perfil e proteção CSRF',async()=>{
    userA=await register('cliente-a@example.com');
    let r=await call('/api/me',{session:userA});assert.equal(r.status,200);assert.equal(r.json.profile.name,'Pessoa');
    r=await call('/api/favorites',{method:'POST',headers:{cookie:userA.cookie},body:{movieId:1}});
    assert.equal(r.status,403);
    r=await call('/api/favorites',{method:'POST',session:userA,body:{movieId:1}});assert.equal(r.json.favorite,true);
    r=await call('/api/me',{session:userA});assert(r.json.favorites.includes(1));
    r=await call('/api/profiles',{method:'POST',session:userA,body:{name:'Pequeno',avatar:'🍿',isKid:true}});assert.equal(r.status,201);
    const kidId=r.json.id;
    await call('/api/profiles/select',{method:'POST',session:userA,body:{profileId:kidId}});
    db.prepare('UPDATE movies SET age_rating=16 WHERE id=1').run();
    r=await call('/api/movies/1/play',{method:'POST',session:userA,body:{}});assert.equal(r.status,403);
    db.prepare('UPDATE movies SET age_rating=0 WHERE id=1').run();
    r=await call('/api/me',{session:userA});assert(!r.json.favorites.includes(1),'Perfis mantêm listas separadas');
  });
  await t.test('Avaliação não duplica e progresso é individual',async()=>{
    let r=await call('/api/reviews',{method:'POST',session:userA,body:{movieId:1,stars:4,body:'Bom'}});assert.equal(r.status,200);
    r=await call('/api/reviews',{method:'POST',session:userA,body:{movieId:1,stars:5,body:'Ótimo'}});assert.equal(r.status,200);
    r=await call('/api/movies/1');assert.equal(r.json.reviews.length,1);assert.equal(r.json.reviews[0].stars,5);
    r=await call('/api/progress',{method:'POST',session:userA,body:{movieId:1,positionSec:3}});assert.equal(r.status,200);
    r=await call('/api/me',{session:userA});assert.equal(r.json.progress[0].position_sec,3);
  });
  await t.test('Pagamento somente após confirmação, assinatura libera e HLS requer autorização',async()=>{
    let r=await call('/api/movies/2/play',{method:'POST',session:userA,body:{}});assert.equal(r.status,403);
    const created=await call('/api/payments',{method:'POST',session:userA,body:{kind:'subscription',productId:1,amountCents:1}});
    assert.equal(created.status,201);assert.equal(created.json.payment.amountCents,1990,'Preço definido no backend');
    paymentId=created.json.payment.id;
    r=await call('/api/movies/2/play',{method:'POST',session:userA,body:{}});assert.equal(r.status,403,'Pagamento pendente não libera');
    r=await call(`/api/sandbox/payments/${paymentId}/approve`,{method:'POST',session:userA,body:{}});assert.equal(r.status,200);
    r=await call(`/api/sandbox/payments/${paymentId}/approve`,{method:'POST',session:userA,body:{}});assert.equal(r.status,409,'Não aprova duas vezes');
    r=await call('/api/movies/2/play',{method:'POST',session:userA,body:{}});assert.equal(r.status,200);tokenUrl=r.json.videoUrl;
    let video=await call(tokenUrl,{raw:true,session:userA});assert.equal(video.status,200);
    video=await call(tokenUrl,{raw:true});assert.equal(video.status,403,'Link vinculado à conta');
    const hls=await call(r.json.hlsUrl,{raw:true,session:userA});assert.equal(hls.status,200);const master=await hls.text();assert(master.includes('#EXT-X-STREAM-INF'));
    const quality=master.split('\n').find(line=>line.startsWith('240p/'));
    const playlist=await call('/api/hls/2/'+quality,{raw:true,session:userA});assert.equal(playlist.status,200);
    const segment=(await playlist.text()).split('\n').find(line=>line.startsWith('seg_'));
    const segmentUrl='/api/hls/2/240p/'+segment;
    const bytes=await call(segmentUrl,{raw:true,session:userA});assert.equal(bytes.status,200);assert((await bytes.arrayBuffer()).byteLength>100);
    const denied=await call(segmentUrl,{raw:true});assert.equal(denied.status,403);
    const member=await call('/api/me',{session:userA});assert(member.json.subscription);
    const cancelled=await call(`/api/subscriptions/${member.json.subscription.id}/cancel`,{method:'POST',session:userA,body:{}});assert.equal(cancelled.status,200);
    r=await call('/api/movies/2/play',{method:'POST',session:userA,body:{}});assert.equal(r.status,200,'Mantém acesso até vencer');
  });
  await t.test('Aluguel funciona sem assinatura, sem pagamento recusado e expira',async()=>{
    userB=await register('cliente-b@example.com');
    await payment(userB,'rental',3,false);
    let r=await call('/api/movies/3/play',{method:'POST',session:userB,body:{}});assert.equal(r.status,403);
    await payment(userB,'rental',3,true);
    r=await call('/api/me',{session:userB});assert.equal(r.json.subscription,null);
    assert.equal(r.json.rentals.length,1);
    assert.equal(r.json.rentals[0].started_at,null);
    r=await call('/api/movies/3/play',{method:'POST',session:userB,body:{}});assert.equal(r.status,200);
    r=await call('/api/me',{session:userB});assert(r.json.rentals[0].expires_at,'Relógio começa na primeira reprodução');
    db.prepare("UPDATE rentals SET expires_at='2020-01-01T00:00:00.000Z' WHERE user_id=(SELECT id FROM users WHERE email=?)").run('cliente-b@example.com');
    r=await call('/api/movies/3/play',{method:'POST',session:userB,body:{}});assert.equal(r.status,403);
  });
  await t.test('Atualização de conta e alteração de senha realmente funcionam',async()=>{
    let r=await call('/api/account',{method:'PATCH',session:userA,body:{displayName:'Novo Nome Retro'}});
    assert.equal(r.status,200);
    r=await call('/api/bootstrap',{headers:{cookie:userA.cookie}});assert.equal(r.json.user.displayName,'Novo Nome Retro');
    r=await call('/api/account/password',{method:'POST',session:userA,body:{currentPassword:'errada',newPassword:'nova-senha-segura-123'}});
    assert.equal(r.status,403);
    r=await call('/api/account/password',{method:'POST',session:userA,body:{currentPassword:'senha-segura-12345',newPassword:'nova-senha-segura-123'}});
    assert.equal(r.status,200);
    r=await call('/api/auth/login',{method:'POST',body:{email:'cliente-a@example.com',password:'senha-segura-12345'}});assert.equal(r.status,401);
    r=await call('/api/auth/login',{method:'POST',body:{email:'cliente-a@example.com',password:'nova-senha-segura-123'}});assert.equal(r.status,200);
  });
  await t.test('Permissões administrativas e CRUD',async()=>{
    let r=await call('/api/admin/stats',{session:userA});assert.equal(r.status,403);
    const uid=db.prepare("INSERT INTO users(email,password_hash,display_name,role,created_at) VALUES(?,?,?,'admin',?)").run('admin@example.com',hashPassword('super-segura-12345'),'Administrador',new Date().toISOString()).lastInsertRowid;
    db.prepare('INSERT INTO profiles(user_id,name,avatar,created_at) VALUES(?,?,?,?)').run(uid,'Admin','⭐',new Date().toISOString());
    const login=await call('/api/auth/login',{method:'POST',body:{email:'admin@example.com',password:'super-segura-12345'}});
    assert.equal(login.status,200);admin={cookie:login.headers.get('set-cookie').split(';')[0],csrf:login.json.csrf};
    r=await call('/api/admin/stats',{session:admin});assert.equal(r.status,200);assert.equal(r.json.users,3);
    r=await call('/api/admin/movies',{session:admin});assert(r.json.movies.length===8);
    const bad=await fetch(base+'/api/admin/upload?kind=poster',{method:'POST',headers:{cookie:admin.cookie,'x-csrf-token':admin.csrf,'content-type':'image/png'},body:Buffer.from('isso nao eh um png')});
    assert.equal(bad.status,415,'Arquivos inválidos são rejeitados');
    const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WHfvtIAAAAASUVORK5CYII=','base64');
    const good=await fetch(base+'/api/admin/upload?kind=poster',{method:'POST',headers:{cookie:admin.cookie,'x-csrf-token':admin.csrf,'content-type':'image/png'},body:png});
    assert.equal(good.status,201);const imagePath=(await good.json()).path;
    const imageResult=await call(imagePath,{raw:true});assert.equal(imageResult.status,200);
    r=await call('/api/admin/movies',{method:'POST',session:admin,body:{slug:'novo-teste',title:'Novo Filme',synopsis:'Teste',year:2026,accessType:'free',videoFile:'cafe-das-estrelas.mp4',poster:'/assets/posters/01.svg'}});assert.equal(r.status,201);
    const mid=r.json.id;
    r=await call(`/api/admin/movies/${mid}`,{method:'PATCH',session:admin,body:{title:'Novo Filme Editado',director:'Retro Studio',genres:['Drama','Comédia'],rentalStartDays:20,rentalWatchHours:72}});
    assert.equal(r.status,200,JSON.stringify(r.json));
    r=await call(`/api/movies/${mid}`);assert.equal(r.json.movie.title,'Novo Filme Editado');assert(r.json.movie.genres.includes('Comédia'));
    r=await call(`/api/admin/movies/${mid}`,{method:'PATCH',session:admin,body:{published:false}});assert.equal(r.status,200);
    r=await call(`/api/movies/${mid}`);assert.equal(r.status,404);
    const series=await call('/api/admin/series',{session:admin});assert.equal(series.status,200);
    r=await call('/api/admin/series',{method:'POST',session:admin,body:{title:'Nova Série em Teste',synopsis:'Novos capítulos'}});
    assert.equal(r.status,201);const sid=r.json.id;
    r=await call(`/api/admin/series/${sid}/episodes`,{method:'POST',session:admin,body:{movieId:1,season:1,number:1}});
    assert.equal(r.status,201);
    r=await call('/api/series/'+sid);assert.equal(r.json.episodes.length,1);
    r=await call(`/api/admin/series/${sid}`,{method:'PATCH',session:admin,body:{published:false}});assert.equal(r.status,200);
    r=await call('/api/series/'+sid);assert.equal(r.status,404);
    // Teste de upload MP4: o filme recém-cadastrado precisa acessar o arquivo no armazenamento protegido.
    const mp4=fs.readFileSync(path.join(import.meta.dirname,'..','storage','videos','cafe-das-estrelas.mp4'));
    const upload=await fetch(base+'/api/admin/upload?kind=video',{method:'POST',headers:{cookie:admin.cookie,'x-csrf-token':admin.csrf,'content-type':'video/mp4'},body:mp4});
    assert.equal(upload.status,201);const videoName=(await upload.json()).path;
    try{
      r=await call('/api/admin/movies',{method:'POST',session:admin,body:{slug:'video-enviado',title:'Vídeo Enviado',synopsis:'Teste de upload',year:2026,accessType:'free',videoFile:videoName,poster:'/assets/posters/01.svg'}});
      assert.equal(r.status,201,JSON.stringify(r.json));
      const played=await call(`/api/movies/${r.json.id}/play`,{method:'POST',body:{}});assert.equal(played.status,200);
      const bytes=await call(played.json.videoUrl,{raw:true,headers:{range:'bytes=0-30'}});assert.equal(bytes.status,206);
    }finally{fs.rmSync(path.join(import.meta.dirname,'..','storage','videos',videoName),{force:true});}
    r=await call('/api/admin/plans/1',{method:'PATCH',session:admin,body:{priceCents:2290}});assert.equal(r.status,200);
    r=await call('/api/bootstrap');assert.equal(r.json.plans[0].price_cents,2290);
  });
  await t.test('Sessão encerrada perde acesso',async()=>{
    const r=await call('/api/auth/logout',{method:'POST',session:userA,body:{}});assert.equal(r.status,200);
    const check=await call('/api/me',{session:userA});assert.equal(check.status,401);
    const stream=await call(tokenUrl,{session:userA,raw:true});assert.equal(stream.status,403);
  });
});

test.after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();fs.rmSync(temp,{recursive:true,force:true});});
