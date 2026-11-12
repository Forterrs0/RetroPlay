import {openDb} from '../server/db.mjs';
import {hashPassword} from '../server/auth.mjs';
import fs from 'node:fs';import path from 'node:path';
if(fs.existsSync('.env'))process.loadEnvFile('.env');
import readline from 'node:readline/promises';
const db=openDb(path.resolve(process.env.RETRO_DB_PATH||'./data/retro-play.sqlite'));
const rl=readline.createInterface({input:process.stdin,output:process.stdout});
try {
  const email=(await rl.question('E-mail administrador: ')).trim().toLowerCase();
  const name=(await rl.question('Nome exibido: ')).trim();
  const password=(await rl.question('Senha (mínimo 10 caracteres): '));
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)||name.length<2||password.length<10)throw new Error('Dados inválidos.');
  if(db.prepare('SELECT id FROM users WHERE email=?').get(email))throw new Error('E-mail já cadastrado.');
  const id=db.prepare("INSERT INTO users(email,password_hash,display_name,role,created_at) VALUES(?,?,?,'admin',?)").run(email,hashPassword(password),name,new Date().toISOString()).lastInsertRowid;
  db.prepare('INSERT INTO profiles(user_id,name,avatar,created_at) VALUES(?,?,?,?)').run(id,name,'⭐',new Date().toISOString());
  console.log('Administrador criado.');
} catch(e){console.error(e.message);process.exitCode=1;} finally{rl.close();db.close();}
