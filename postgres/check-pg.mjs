import { Pool } from 'pg';
import fs from 'node:fs'; import path from 'node:path';
if(fs.existsSync('.env'))process.loadEnvFile('.env');
if(!process.env.DATABASE_URL)throw Error('DATABASE_URL ausente do .env');
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.PGSSL==='require'?{rejectUnauthorized:true}:undefined,connectionTimeoutMillis:10000});
try { const {rows}=await pool.query('SELECT current_database() AS name, current_user AS username, version() AS version'); console.log('Conexão PostgreSQL OK:', rows[0].name, rows[0].username); }
finally {await pool.end();}
