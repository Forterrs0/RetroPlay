import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';
import {createApp} from '../server/app.mjs';

const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('Frontend: cadastro, login, logout e alternância claro/noturno via eventos da interface',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'retro-ui-events-'));
  const {server,db}=createApp({dbPath:path.join(dir,'db.sqlite')});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  try{
    const base=`http://127.0.0.1:${server.address().port}`,events={},root={innerHTML:''},store=new Map();
    let cookie='';
    const document={
      getElementById:(id)=>id==='app'?root:null,
      addEventListener:(event,callback)=>events[event]=callback,
      querySelector:()=>null,
      createElement:()=>({remove(){},textContent:''}),
      body:{append(){},classList:{remove(){},toggle(){}}},
      documentElement:{dataset:{}},title:''
    };
    class FormDataMock{constructor(form){this.values=form.values}get(key){return this.values[key]??null}}
    async function proxiedFetch(url,options={}){
      const headers={...options.headers};if(cookie)headers.cookie=cookie;
      const response=await fetch(base+url,{...options,headers});
      const updatedCookie=response.headers.get('set-cookie');if(updatedCookie)cookie=updatedCookie.split(';')[0];
      return response;
    }
    const context={document,window:{scrollTo(){}},location:{protocol:'http:'},fetch:proxiedFetch,
      FormData:FormDataMock,URLSearchParams,Intl,Date,Math,Number,String,Array,JSON,
      setTimeout:(fn,ms)=>{const t=setTimeout(fn,ms);t.unref();return t;},clearTimeout,
      console,localStorage:{getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value)}};
    vm.runInNewContext(fs.readFileSync(path.join(project,'public','app.js'),'utf8'),context);
    for(let i=0;i<100&&!root.innerHTML.includes('theme-toggle');i++)await new Promise(r=>setTimeout(r,15));
    assert.match(root.innerHTML,/data-mode="register"/);
    assert.match(root.innerHTML,/theme-toggle/);
    const click=async dataset=>{const button={dataset,closest(){return this}};await events.click({target:button,preventDefault(){}});};
    const submit=async(values,type='auth')=>{const form={dataset:{form:type},values,closest(){return this},querySelector(){return {disabled:false,isConnected:false};}};
      await events.submit({target:form,preventDefault(){}});};
    await click({action:'auth',mode:'register'});
    assert.match(root.innerHTML,/Crie sua conta/);
    assert.match(root.innerHTML,/authConfirmPass/);
    await submit({name:'Pessoa Interface',email:'teste-ui@example.com',password:'senha-segura-2026',confirmPassword:'senha-segura-2026'});
    assert.match(root.innerHTML,/avatar-button/);
    assert.match(cookie,/retro_session=/);
    await click({action:'theme'});
    assert.equal(document.documentElement.dataset.theme,'dark');
    assert.equal(store.get('retro-theme'),'dark');
    await click({action:'logout'});
    assert.match(root.innerHTML,/data-mode="login"/);
    await click({action:'auth',mode:'login'});
    await submit({email:'teste-ui@example.com',password:'senha-segura-2026'});
    assert.match(root.innerHTML,/avatar-button/);
    assert.equal(document.documentElement.dataset.theme,'dark');
    await click({action:'theme'});
    assert.equal(document.documentElement.dataset.theme,'light');
  }finally{await new Promise(resolve=>server.close(resolve));db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
