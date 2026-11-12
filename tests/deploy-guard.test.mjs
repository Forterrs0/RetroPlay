import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../server/app-pg.mjs',import.meta.url),'utf8');
const start=readFileSync(new URL('../server/server.mjs',import.meta.url),'utf8');
test('Produção desativa aprovação sandbox e upload local',()=>{
 assert.match(app,/NODE_ENV==='production'[\s\S]*pathname==='\/api\/payments'/);
 assert.match(app,/NODE_ENV==='production' && pathname==='\/api\/admin\/upload'/);
});
test('Início remoto exige PostgreSQL, cookie seguro e segredo',()=>{
 assert.match(start,/NODE_ENV==='production'/);
 assert.match(start,/RETRO_DB_ENGINE=postgres/);
 assert.match(start,/COOKIE_SECURE/);
 assert.match(start,/RETRO_SECRET/);
});
