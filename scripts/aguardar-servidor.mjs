const url='http://127.0.0.1:4173/api/health';
let ready=false;
for(let i=0;i<50;i++){
 try{
  const response=await fetch(url,{signal:AbortSignal.timeout(1000)});
  const health=await response.json();
  if(health.ok&&health.version==='3.0.0'){
   ready=true;break;
  }
  console.error(`[Retro Play] Outro servidor respondeu: versão ${health.version||'desconhecida'}.`);
  break;
 }catch{/* ainda iniciando */}
 await new Promise(resolve=>setTimeout(resolve,300));
}
if(ready)console.log('[Retro Play] Servidor V3 online.');
else{console.error('[Retro Play] Servidor não inicializou em 15 segundos. Confira a janela do servidor.');process.exitCode=1;}
