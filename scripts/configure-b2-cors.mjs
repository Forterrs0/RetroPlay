// One-time configuration. Usage: node --env-file=.env scripts/configure-b2-cors.mjs
// Explicitly restrict B2 browser access to your own Render domain.
import {S3Client,PutBucketCorsCommand,GetBucketCorsCommand} from '@aws-sdk/client-s3';
const e=process.env;
if(!e.RETRO_PUBLIC_ORIGIN)throw new Error('Defina RETRO_PUBLIC_ORIGIN=https://SEU-SITE.onrender.com no .env');
const origin=new URL(e.RETRO_PUBLIC_ORIGIN);
if(origin.origin!==e.RETRO_PUBLIC_ORIGIN || (origin.protocol!=='https:' && origin.hostname!=='127.0.0.1' && origin.hostname!=='localhost'))
  throw new Error('RETRO_PUBLIC_ORIGIN deve ser uma origem HTTPS exata, sem / no final.');
for(const k of ['B2_BUCKET','B2_REGION','B2_ENDPOINT','B2_KEY_ID','B2_APPLICATION_KEY'])if(!e[k])throw new Error(`Falta ${k}`);
const client=new S3Client({region:e.B2_REGION,endpoint:e.B2_ENDPOINT,forcePathStyle:true,
 credentials:{accessKeyId:e.B2_KEY_ID,secretAccessKey:e.B2_APPLICATION_KEY}});
try{
 const config={Bucket:e.B2_BUCKET,CORSConfiguration:{CORSRules:[{
   AllowedOrigins:[origin.origin],AllowedMethods:['PUT','GET','HEAD'],AllowedHeaders:['content-type','range','x-amz-*'],
   ExposeHeaders:['etag','content-length','content-range','accept-ranges'],MaxAgeSeconds:3600
 }]}};
 if(e.CONFIRM_B2_CORS!=='YES'){
   console.log('Prévia: bucket',e.B2_BUCKET,'origem',origin.origin,'métodos PUT, GET, HEAD');
   console.log('Para aplicar, defina CONFIRM_B2_CORS=YES no terminal atual. Isso substitui as regras CORS existentes.');
 } else {
   await client.send(new PutBucketCorsCommand(config));
   const output=await client.send(new GetBucketCorsCommand({Bucket:e.B2_BUCKET}));
   console.log('CORS salvo:',JSON.stringify(output.CORSRules));
 }
}finally{client.destroy();}
