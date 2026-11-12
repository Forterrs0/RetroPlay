// Backblaze B2 private media. No AWS credentials are ever returned to clients.
import crypto from 'node:crypto';
const kinds={
  poster:{types:['image/png','image/jpeg','image/webp'],max:5*1024*1024,folder:'posters'},
  video:{types:['video/mp4'],max:1024*1024*1024,folder:'videos'}
};
export function b2Ready(env=process.env){return ['B2_BUCKET','B2_REGION','B2_ENDPOINT','B2_KEY_ID','B2_APPLICATION_KEY'].every(x=>!!env[x]);}
export function b2Origin(env=process.env){if(!b2Ready(env))return '';try {const url=new URL(env.B2_ENDPOINT);if(url.protocol!=='https:')return '';return url.origin;} catch{return '';}}
export function validateUpload(kind,contentType,size){
  const cfg=kinds[kind];if(!cfg||!cfg.types.includes(contentType))throw Object.assign(new Error('Formato de arquivo não permitido.'),{status:415});
  if(!Number.isSafeInteger(size)||size<1||size>cfg.max)throw Object.assign(new Error(`Arquivo inválido ou excede ${Math.ceil(cfg.max/1048576)} MB.`),{status:413});
  return cfg;
}
export function isB2Video(file){return /^b2:videos\/[a-f0-9-]{36}\.mp4$/.test(file||'');}
export function isB2Poster(file){return /^\/api\/media\/poster\/[a-f0-9-]{36}\.(png|jpg|webp)$/.test(file||'');}
export function videoKey(file){return isB2Video(file)?file.slice(3):null;}
export function posterKey(file){return isB2Poster(file)?'posters/'+file.slice('/api/media/poster/'.length):null;}
function mac(secret,body){return crypto.createHmac('sha256',secret).update(body).digest('base64url');}
function makeProof(secret,claim){const body=Buffer.from(JSON.stringify(claim)).toString('base64url');return `${body}.${mac(secret,body)}`;}
function checkProof(secret,proof,owner){
  try {const [body,sig,...extra]=String(proof).split('.');if(extra.length||!body||!sig)return null;
    const expected=mac(secret,body),a=Buffer.from(sig),b=Buffer.from(expected);
    if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return null;
    const claim=JSON.parse(Buffer.from(body,'base64url').toString('utf8'));
    if(claim.owner!==owner||claim.exp<Date.now()||!['poster','video'].includes(claim.kind))return null;
    return claim;
  }catch{return null;}
}
export function createB2Media(env=process.env){
  if(!b2Ready(env))throw new Error('Variáveis B2_* ausentes no servidor.');
  const {B2_BUCKET:Bucket,B2_REGION:region,B2_ENDPOINT:endpoint,B2_KEY_ID:accessKeyId,B2_APPLICATION_KEY:secretAccessKey}=env;
  const secret=env.RETRO_SECRET;
  if(!secret)throw new Error('RETRO_SECRET obrigatório para uploads B2.');
  let sdk;
  async function api(){if(!sdk){
    const [{S3Client,PutObjectCommand,GetObjectCommand,HeadObjectCommand}, {getSignedUrl}]=await Promise.all([
      import('@aws-sdk/client-s3'),import('@aws-sdk/s3-request-presigner')]);
    sdk={client:new S3Client({region,endpoint,forcePathStyle:true,credentials:{accessKeyId,secretAccessKey}}),PutObjectCommand,GetObjectCommand,HeadObjectCommand,getSignedUrl};
  }return sdk;}
  async function prepare({kind,contentType,size,owner}){
    const cfg=validateUpload(kind,contentType,size);
    const ext=contentType==='image/png'?'.png':contentType==='image/jpeg'?'.jpg':contentType==='image/webp'?'.webp':'.mp4';
    const key=`${cfg.folder}/${crypto.randomUUID()}${ext}`;
    const {client,PutObjectCommand,getSignedUrl}=await api();
    const uploadUrl=await getSignedUrl(client,new PutObjectCommand({Bucket,Key:key,ContentType:contentType}),{expiresIn:1200});
    const proof=makeProof(secret,{kind,key,size,contentType,owner,exp:Date.now()+30*60*1000});
    const filePath=kind==='video'?`b2:${key}`:`/api/media/poster/${key.slice('posters/'.length)}`;
    return {uploadUrl,proof,path:filePath,headers:{'Content-Type':contentType},expiresIn:1200};
  }
  async function verify({proof,kind,owner,path}){
    const claim=checkProof(secret,proof,owner);
    if(!claim||claim.kind!==kind)throw Object.assign(new Error('Comprovante de upload inválido ou expirado.'),{status:403});
    const expected=kind==='video'?`b2:${claim.key}`:`/api/media/poster/${claim.key.slice('posters/'.length)}`;
    if(path!==expected)throw Object.assign(new Error('Arquivo não corresponde ao upload autorizado.'),{status:403});
    const {client,HeadObjectCommand,GetObjectCommand}=await api();
    let head;try {head=await client.send(new HeadObjectCommand({Bucket,Key:claim.key}));}
    catch {throw Object.assign(new Error('Upload não encontrado no bucket.'),{status:400});}
    if(Number(head.ContentLength)!==claim.size||head.ContentType?.split(';')[0]!==claim.contentType)
      throw Object.assign(new Error('Tamanho ou tipo do arquivo enviado não confere.'),{status:400});
    // Check magic bytes; do not trust an editable Content-Type header alone.
    const response=await client.send(new GetObjectCommand({Bucket,Key:claim.key,Range:'bytes=0-15'}));
    const start=Buffer.from(await response.Body.transformToByteArray());
    const valid=claim.contentType==='video/mp4'?start.toString('ascii',4,8)==='ftyp':
      claim.contentType==='image/png'?start.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')):
      claim.contentType==='image/jpeg'?start[0]===0xff&&start[1]===0xd8&&start[2]===0xff:
      start.toString('ascii',0,4)==='RIFF'&&start.toString('ascii',8,12)==='WEBP';
    if(!valid)throw Object.assign(new Error('Conteúdo não corresponde ao tipo de arquivo.'),{status:415});
    return claim.key;
  }
  async function download(key,seconds=600){
    const {client,GetObjectCommand,getSignedUrl}=await api();
    return getSignedUrl(client,new GetObjectCommand({Bucket,Key:key}),{expiresIn:seconds});
  }
  return {prepare,verify,download};
}
