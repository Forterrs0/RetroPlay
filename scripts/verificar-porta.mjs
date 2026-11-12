const url='http://127.0.0.1:4173/api/health';
try{
 const res=await fetch(url,{signal:AbortSignal.timeout(1200)});
 const data=await res.json().catch(()=>({}));
 console.error(`[Retro Play] Já existe servidor na porta 4173 (versão ${data.version||'desconhecida'}).`);
 process.exitCode=1;
}catch(error){
 // Verifica também se há outro serviço que não reconhece /api/health.
 if(error.cause?.code==='ECONNREFUSED'||error.name==='TimeoutError'||error.name==='AbortError')process.exitCode=0;
 else { console.error('[Retro Play] Não foi possível confirmar se a porta está livre:',error.message);process.exitCode=1; }
}
