import crypto from 'node:crypto';

export const now = () => new Date().toISOString();
export const later = (ms) => new Date(Date.now()+ms).toISOString();
export const randomId = () => crypto.randomBytes(24).toString('hex');
export const hashPassword = (password) => {
  const salt=crypto.randomBytes(16).toString('hex');
  const hash=crypto.scryptSync(password,salt,64).toString('hex');
  return `scrypt:${salt}:${hash}`;
};
export const checkPassword = (password,stored) => {
  try {const [,salt,digest]=stored.split(':');if(!salt||!digest)return false;
    return crypto.timingSafeEqual(crypto.scryptSync(password,salt,64),Buffer.from(digest,'hex'));
  } catch {return false;}
};
export function signedVideoToken(secret,movieId,userId) {
  const payload=Buffer.from(`${movieId}|${userId||0}|${Math.floor(Date.now()/1000)+600}`).toString('base64url');
  const signature=crypto.createHmac('sha256',secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}
export function verifyVideoToken(secret,token,movieId,userId) {
  if(!token || typeof token!=='string') return false;
  const [payload,sig] = token.split('.');if(!payload||!sig)return false;
  const valid=crypto.createHmac('sha256',secret).update(payload).digest();
  const provided=Buffer.from(sig,'base64url');
  if(provided.length!==valid.length||!crypto.timingSafeEqual(provided,valid))return false;
  const [mid,uid,exp]=Buffer.from(payload,'base64url').toString().split('|');
  return Number(mid)===Number(movieId) && Number(uid)===Number(userId||0) && Number(exp)>Date.now()/1000;
}
export async function currentSession(db,cookies) {
  const tok=cookies.match(/(?:^|;\s*)retro_session=([a-f0-9]{48})(?:;|$)/)?.[1];
  if(!tok)return null;
  const session=(await db.prepare(`SELECT s.id,s.profile_id,s.csrf_token,s.expires_at,u.id user_id,u.email,u.display_name,u.role
    FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=?`).get(tok));
  if(!session||session.expires_at<=now())return null;
  if(session.profile_id){const profile=(await db.prepare('SELECT * FROM profiles WHERE id=? AND user_id=?').get(session.profile_id,session.user_id));if(!profile)session.profile_id=null;}
  return session;
}
