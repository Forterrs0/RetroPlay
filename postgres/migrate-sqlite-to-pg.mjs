import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');
if (existsSync(envPath)) process.loadEnvFile(envPath);
const source = path.resolve(root, process.env.RETRO_DB_PATH || './data/retro-play.sqlite');
if (!existsSync(source)) throw Error(`SQLite não encontrado: ${source}. Configure RETRO_DB_PATH.`);
if (!process.env.DATABASE_URL) throw Error('Defina DATABASE_URL no .env para conectar ao PostgreSQL.');
if (process.env.RETRO_PG_CONFIRM !== 'MIGRAR') throw Error('Por segurança, execute com RETRO_PG_CONFIRM=MIGRAR para autorizar o envio dos dados.');

const tables = [
 'users','profiles','sessions','subscription_plans','movies','genres','movie_genres',
 'series','episodes','payments','subscriptions','rentals','favorites','watch_progress',
 'watch_history','reviews','achievements','user_achievements','banners','video_assets'
];
const identity = ['users','profiles','subscription_plans','movies','genres','series','episodes','payments','subscriptions','rentals','watch_history','achievements','banners','video_assets'];
const ssl = process.env.PGSSL === 'require' ? {rejectUnauthorized:true} : undefined;
const pool = new Pool({connectionString:process.env.DATABASE_URL, ssl, connectionTimeoutMillis:10000});
const client = await pool.connect();
let sqlite;
try {
  // Open backup through SQLite's own backup API; don't copy an active WAL database byte-for-byte.
  // Do not use openDb here (it seeds/modifies); migration must only read the existing file.
  sqlite = new DatabaseSync(source, {readOnly:true});
  const existing = new Set(sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x=>x.name));
  await client.query(readFileSync(path.join(root,'postgres','001_schema.sql'),'utf8'));
  await client.query('BEGIN');
  // This tool is intentionally for a fresh PostgreSQL database. It never clears existing records.
  for (const table of tables) {
    const {rows} = await client.query(`SELECT COUNT(*)::integer AS n FROM "${table}"`);
    if (rows[0].n !== 0) throw Error(`Tabela ${table} contém registros. Use banco PostgreSQL vazio; nada foi substituído.`);
  }
  let total = 0;
  for (const table of tables) {
    if (!existing.has(table)) continue;
    const records = sqlite.prepare(`SELECT * FROM "${table}"`).all();
    if (!records.length) continue;
    const cols = Object.keys(records[0]);
    const identifiers = cols.map(c=>'"'+c+'"').join(',');
    const sql = `INSERT INTO "${table}" (${identifiers}) VALUES (${cols.map((_,i)=>'$'+(i+1)).join(',')})`;
    for (const row of records) await client.query(sql, cols.map(c=>row[c]));
    total += records.length;
    console.log(`${table}: ${records.length} registros`);
  }
  for (const table of identity) {
    await client.query(`SELECT setval(pg_get_serial_sequence('"${table}"','id'), COALESCE((SELECT MAX(id) FROM "${table}"), 1), (SELECT COUNT(*)>0 FROM "${table}"))`);
  }
  // Consistency check before committing.
  for (const table of tables) {
    if (!existing.has(table)) continue;
    const expected = sqlite.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get().n;
    const actual = Number((await client.query(`SELECT COUNT(*) AS n FROM "${table}"`)).rows[0].n);
    if (expected !== actual) throw Error(`Falha conferindo ${table}: SQLite=${expected}, PG=${actual}`);
  }
  await client.query('COMMIT');
  console.log(`MIGRAÇÃO CONCLUÍDA: ${total} registros copiados e conferidos.`);
  console.log('IMPORTANTE: o site ainda utiliza SQLite; não altere a execução até adaptar as rotas à API assíncrona do PostgreSQL.');
} catch(error) {
  try { await client.query('ROLLBACK'); } catch {}
  console.error('MIGRAÇÃO CANCELADA:',error.message);
  process.exitCode=1;
} finally {
  sqlite?.close(); client.release(); await pool.end();
}
