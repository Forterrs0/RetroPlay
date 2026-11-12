import pg from 'pg';
import fs from 'node:fs';import path from 'node:path';import readline from 'node:readline/promises';
import {stdin as input,stdout as output} from 'node:process';
import {hashPassword,now} from '../server/auth.mjs';
const root=path.resolve(import.meta.dirname,'..');
if(fs.existsSync(path.join(root,'.env')))process.loadEnvFile(path.join(root,'.env'));
if(!process.env.DATABASE_URL)throw Error('DATABASE_URL não configurada');
const rl=readline.createInterface({input,output});
const email=(await rl.question('E-mail do administrador: ')).trim().toLowerCase();
const name=(await rl.question('Nome: ')).trim();
const password=(await rl.question('Senha (mínimo 10 caracteres; a digitação será visível): '));
rl.close();
if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||name.length<2||password.length<10)throw Error('Dados inválidos');
const client=new pg.Client({connectionString:process.env.DATABASE_URL});
await client.connect();
try{
  const existing=await client.query('SELECT id FROM users WHERE email=$1',[email]);
  if(existing.rowCount)throw Error('Já existe uma conta com esse e-mail. Não será promovida automaticamente.');
  await client.query('BEGIN');
  const result=await client.query('INSERT INTO users(email,password_hash,display_name,role,created_at) VALUES($1,$2,$3,$4,$5) RETURNING id',[email,hashPassword(password),name,'admin',now()]);
  await client.query('INSERT INTO profiles(user_id,name,avatar,created_at) VALUES($1,$2,$3,$4)',[result.rows[0].id,name.split(' ')[0],'🌸',now()]);
  await client.query('COMMIT');console.log('Administrador criado com sucesso.');
}catch(e){await client.query('ROLLBACK');throw e;}finally{await client.end();}
