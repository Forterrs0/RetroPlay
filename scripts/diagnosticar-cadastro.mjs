import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {once} from 'node:events';
import {createApp} from '../server/app.mjs';
const problems=[];
console.log('\nDIAGNOSTICO DE CADASTRO — RETRO PLAY\n');
console.log('Node.js:',process.version);
const [major,minor]=process.versions.node.split('.').map(Number);
if(major<22||(major===22&&minor<13))problems.push('Atualize o Node.js para 22.13 ou superior.');
const databaseDir=path.join(os.tmpdir(),'retro-diagnostico-'+crypto.randomUUID());
fs.mkdirSync(databaseDir,{recursive:true});
const {server,db}=createApp({dbPath:path.join(databaseDir,'cadastro.sqlite')});
try{
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const base='http://127.0.0.1:'+server.address().port;
  const email='teste-'+crypto.randomUUID()+'@exemplo.invalid';
  const register=await fetch(base+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Teste de Cadastro',email,password:'senha-de-teste-12345'})});
  const body=await register.json();
  if(register.status!==200)throw new Error(`Cadastro de teste falhou (${register.status}): ${body.error}`);
  const cookie=register.headers.get('set-cookie')?.split(';')[0];
  const boot=await fetch(base+'/api/bootstrap',{headers:{cookie}}).then(r=>r.json());
  if(boot.user?.email!==email)throw new Error('Cadastro criado, mas a sessão não foi recuperada.');
  console.log('[OK] Criar usuário e recuperar sessão: passou.');
}catch(error){console.error('[FALHA]',error.message);problems.push('Cadastro interno não funcionou: '+error.message)}
finally{await new Promise(resolve=>server.close(resolve));db.close();fs.rmSync(databaseDir,{recursive:true,force:true});}
try{
 const response=await fetch('http://127.0.0.1:4173/api/health',{signal:AbortSignal.timeout(2000)});
 const health=await response.json();
 if(response.ok&&health.ok&&health.version==='3.0.0')console.log('[OK] Servidor principal V3 está acessível.');
 else problems.push(`A porta 4173 está em uso por uma versão diferente (${health.version||'desconhecida'}). Feche a versão antiga e execute o inicializador V3.`);
}catch{problems.push('O servidor principal não está ligado na porta 4173. Execute INICIAR_RETRO_PLAY.bat e mantenha a janela aberta.');}
console.log('\nRESULTADO:',problems.length?'Encontrados problemas.':'Teste de cadastro e servidor principal passaram.');
for(const problem of problems)console.log('- '+problem);
console.log('\nSe o site ainda não cadastrar, anote o erro que aparece no formulário ou envie captura de tela.');
