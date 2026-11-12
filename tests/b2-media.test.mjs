import test from 'node:test';
import assert from 'node:assert/strict';
import {validateUpload,isB2Video,isB2Poster,videoKey,posterKey,b2Origin,b2Ready} from '../server/b2-media.mjs';
const u='12345678-1234-1234-1234-1234567890ab';
test('Backblaze paths are strict and never accept traversal',()=>{
 assert.equal(isB2Video(`b2:videos/${u}.mp4`),true);
 assert.equal(videoKey(`b2:videos/${u}.mp4`),`videos/${u}.mp4`);
 assert.equal(isB2Video('b2:videos/../../private.mp4'),false);
 assert.equal(isB2Poster(`/api/media/poster/${u}.png`),true);
 assert.equal(posterKey(`/api/media/poster/${u}.png`),`posters/${u}.png`);
 assert.equal(isB2Poster('/api/media/poster/../../.env'),false);
});
test('B2 media upload rejects unsupported types and invalid sizes',()=>{
 assert.equal(validateUpload('poster','image/png',42).folder,'posters');
 assert.equal(validateUpload('video','video/mp4',42).folder,'videos');
 assert.throws(()=>validateUpload('video','text/html',42));
 assert.throws(()=>validateUpload('poster','image/svg+xml',42));
 assert.throws(()=>validateUpload('video','video/mp4',0));
 assert.throws(()=>validateUpload('video','video/mp4',2*1024*1024*1024));
});
test('B2 origin uses HTTPS and requires all server credentials',()=>{
 const env={B2_BUCKET:'x',B2_REGION:'us-east-005',B2_ENDPOINT:'https://s3.us-east-005.backblazeb2.com',B2_KEY_ID:'key',B2_APPLICATION_KEY:'secret'};
 assert.equal(b2Ready(env),true);
 assert.equal(b2Origin(env),'https://s3.us-east-005.backblazeb2.com');
 assert.equal(b2Origin({...env,B2_ENDPOINT:'http://example.com'}),'');
});
