import fs from 'node:fs';
const issues=[];
const env=process.env;
if(env.RETRO_DB_ENGINE!=='postgres')issues.push('RETRO_DB_ENGINE deve ser postgres');
if(env.COOKIE_SECURE!=='true')issues.push('COOKIE_SECURE deve ser true');
if(!env.RETRO_SECRET||env.RETRO_SECRET.length<64)issues.push('RETRO_SECRET deve ter >=64 caracteres');
if(env.RETRO_PUBLIC_STAGING!=='YES')issues.push('RETRO_PUBLIC_STAGING precisa ser YES');
if(!env.DATABASE_URL)issues.push('DATABASE_URL ausente');
else {try{const u=new URL(env.DATABASE_URL);if(!['postgres:','postgresql:'].includes(u.protocol)||!u.hostname||!u.username||!u.password)issues.push('DATABASE_URL incompleta ou inválida');}catch{issues.push('DATABASE_URL malformada');}}
if(!fs.existsSync('public/index.html'))issues.push('Execute este comando na raiz do projeto');
if(issues.length){console.error('Configuração incompleta:\n- '+issues.join('\n- '));process.exitCode=1;}
else console.log('Configuração básica pronta para staging; não comprova funcionamento do PostgreSQL.');
