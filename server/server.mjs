import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const envFile=path.join(base,'.env');
if(fs.existsSync(envFile))process.loadEnvFile(envFile);

function databasePath(){
  if(process.env.RETRO_DB_PATH)return path.resolve(base,process.env.RETRO_DB_PATH);
  const local=path.join(base,'data','retro-play.sqlite');
  const targetDir=path.dirname(local);
  try{
    fs.mkdirSync(targetDir,{recursive:true});
    fs.accessSync(targetDir,fs.constants.W_OK);
    if(fs.existsSync(local))fs.accessSync(local,fs.constants.W_OK);
    return local;
  }catch(error){
    // Evita falha de cadastro quando a pasta de instalação está protegida.
    const appdata=process.env.LOCALAPPDATA||path.join(os.homedir(),'AppData','Local');
    const dir=path.join(appdata,'RetroPlay');
    fs.mkdirSync(dir,{recursive:true});
    console.log('[Retro Play] Pasta do projeto sem permissão de escrita. Banco salvo em:',dir);
    return path.join(dir,'retro-play.sqlite');
  }
}

// O banco persistente sempre fica em uma pasta que o usuário pode gravar.
process.env.RETRO_DB_PATH=databasePath();
const postgresEnabled=process.env.RETRO_DB_ENGINE==='postgres';
if(process.env.NODE_ENV==='production'){
  if(!postgresEnabled) throw new Error('Implantação online requer RETRO_DB_ENGINE=postgres.');
  if(process.env.COOKIE_SECURE!=='true') throw new Error('Em HTTPS, defina COOKIE_SECURE=true.');
  if(!process.env.RETRO_SECRET || process.env.RETRO_SECRET.length<64 || /SUBSTITUA|SEGREDO|CHANGE_ME/i.test(process.env.RETRO_SECRET))
    throw new Error('Defina RETRO_SECRET com pelo menos 64 caracteres aleatórios.');
  if(process.env.RETRO_PUBLIC_STAGING!=='YES') throw new Error('Publicação não autorizada: defina RETRO_PUBLIC_STAGING=YES apenas em ambiente de teste.');
}

if(postgresEnabled&&!process.env.DATABASE_URL)throw new Error('DATABASE_URL não definida para PostgreSQL.');
const {createApp}=await import(postgresEnabled?'./app-pg.mjs':'./app.mjs');
const port=Number(process.env.PORT||4173),host=process.env.HOST||'127.0.0.1';
const app=createApp();
if(postgresEnabled){
  try {await app.pool.query('SELECT 1');console.log('[Retro Play] PostgreSQL conectado.');}
  catch(error){console.error('[Retro Play] PostgreSQL não disponível:',error.message);await app.pool.end();process.exit(1);}
}
const {server}=app;
server.on('error',error=>{
  console.error('[Retro Play] Falha ao iniciar servidor:',error.message);
  if(error.code==='EADDRINUSE')console.error('Feche a versão anterior do Retro Play que utiliza a mesma porta.');
  process.exitCode=1;
});
server.listen(port,host,()=>{
  console.log(`Retro Play disponível em http://${host}:${port}`);
  console.log(postgresEnabled?'Banco de dados: PostgreSQL (Supabase)':'Banco de dados: SQLite '+process.env.RETRO_DB_PATH);
});
