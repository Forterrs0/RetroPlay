/**
 * Migração de dados do SQLite local para um PostgreSQL VAZIO.
 * Executar: npm install && npm run db:migrate
 * Nunca modifica o SQLite de origem. Rollback automático no PostgreSQL em caso de falha.
 */
import {DatabaseSync} from 'node:sqlite';
import {Client} from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(fs.existsSync(path.join(ROOT,'.env')))process.loadEnvFile(path.join(ROOT,'.env'));
const source=path.resolve(ROOT,process.env.RETRO_SQLITE_SOURCE||process.env.RETRO_DB_PATH||'data/retro-play.sqlite');
const connectionString=process.env.DATABASE_URL;
if(!connectionString)throw new Error('Configure DATABASE_URL no .env (nunca no frontend).');
if(!fs.existsSync(source))throw new Error(`Banco SQLite não encontrado: ${source}. Localize o arquivo usado na versão antiga.`);
const allowed=['localhost','127.0.0.1'];
const url=new URL(connectionString);
if(!['postgres:','postgresql:'].includes(url.protocol))throw new Error('DATABASE_URL deve usar PostgreSQL.');
if(!process.env.RETRO_CONFIRM_MIGRATION || process.env.RETRO_CONFIRM_MIGRATION!=='SIM')throw new Error('Defina RETRO_CONFIRM_MIGRATION=SIM após verificar a URL de destino e fazer backup.');

// Respeitar a ordem das dependências para preservar todos os IDs e relacionamentos.
// Sessões não são copiadas: usuários entram novamente no novo servidor.
const tables=['users','profiles','subscription_plans','movies','genres','movie_genres','series','episodes','payments','subscriptions','rentals','favorites','watch_progress','watch_history','reviews','achievements','user_achievements','banners','video_assets'];
const sqlite=new DatabaseSync(source,{readOnly:true});
const pg=new Client({connectionString,ssl:process.env.PGSSL==='require'?{rejectUnauthorized:true}:undefined});
try{
  await pg.connect();
  await pg.query('BEGIN');
  // Bloqueia nova migração concorrente para o mesmo banco.
  await pg.query('SELECT pg_advisory_xact_lock(77200241)');
  const ddl=fs.readFileSync(path.join(ROOT,'db/postgres/001_schema.sql'),'utf8').replace(/^BEGIN;|COMMIT;$/gm,'');
  await pg.query(ddl);
  const existing=await pg.query('SELECT COUNT(*)::integer AS n FROM users');
  const existingMovies=await pg.query('SELECT COUNT(*)::integer AS n FROM movies');
  if(existing.rows[0].n||existingMovies.rows[0].n)throw new Error('Destino não está vazio. Migração cancelada para evitar sobrescrever contas ou filmes.');
  const summary={};
  for(const table of tables){
    // nomes de tabelas são constantes controladas pelo código, não input do usuário
    const rows=sqlite.prepare(`SELECT * FROM "${table}"`).all();
    summary[table]=rows.length;
    if(!rows.length)continue;
    const cols=Object.keys(rows[0]);
    // Verificar que as colunas existem no schema de destino.
    const target=await pg.query('SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=$1',[table]);
    const defined=new Set(target.rows.map(r=>r.column_name));
    for(const col of cols)if(!defined.has(col))throw new Error(`Coluna ${table}.${col} não existe no PostgreSQL`);
    const quoted=cols.map(c=>'"'+c+'"').join(',');
    const placeholders=cols.map((_,i)=>`$${i+1}`).join(',');
    const sql=`INSERT INTO "${table}" (${quoted}) VALUES (${placeholders})`;
    for(const row of rows){await pg.query(sql,cols.map(c=>row[c]));}
  }
  // Atualizar sequência de IDs depois de inserir valores explícitos.
  for(const table of tables){
    if(!['movie_genres','favorites','watch_progress','reviews','user_achievements'].includes(table)){
      const r=await pg.query('SELECT pg_get_serial_sequence($1,$2) AS seq',[table,'id']);
      if(r.rows[0]?.seq)await pg.query(`SELECT setval($1::regclass, COALESCE((SELECT MAX(id) FROM "${table}"), 1), (SELECT COUNT(*) > 0 FROM "${table}"))`,[r.rows[0].seq]);
    }
  }
  await pg.query('COMMIT');
  console.log('Migração concluída. Contagens:',JSON.stringify(summary,null,2));
  console.log('Senhas e perfis preservados. Sessões descartadas por segurança.');
  console.log('ATENÇÃO: a aplicação ainda usa SQLite; mudar o backend será a próxima etapa.');
}catch(e){try{await pg.query('ROLLBACK');}catch{}console.error('Migração cancelada:',e.message);process.exitCode=1;}
finally{sqlite.close();await pg.end().catch(()=>{});}
