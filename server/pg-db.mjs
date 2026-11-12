import {normalizeSql} from './pg-sql.mjs';
import pg from 'pg';
const {Pool,types}=pg;
// IDs/COUNT from BIGINT must behave as JS numbers (use IDs below 2^53).
types.setTypeParser(20, v=>Number(v));

export function createPgPool(url){
  if(!/^postgres(?:ql)?:\/\//.test(url||''))throw new Error('DATABASE_URL PostgreSQL inválida');
  return new Pool({connectionString:url,max:10,connectionTimeoutMillis:10000,idleTimeoutMillis:30000});
}

export function pgDb(client){
  return {
    prepare(sql){
      const isInsert=/^\s*INSERT\s/i.test(sql);
      const returning=/^\s*INSERT\s+(?:OR\s+IGNORE\s+)?INTO\s+(users|profiles|payments|subscriptions|rentals|movies|series|episodes|watch_history|banners|video_assets)\s*\(/i.test(sql);
      const query=normalizeSql(sql)+(returning?' RETURNING id':'');
      const execute=(args)=>client.query(query,args);
      return {
        async get(...args){return (await execute(args)).rows[0]||null;},
        async all(...args){return (await execute(args)).rows;},
        async run(...args){const r=await execute(args);return {changes:r.rowCount,lastInsertRowid:r.rows[0]?.id??0};}
      };
    },
    async exec(sql){await client.query(sql==='BEGIN IMMEDIATE'?'BEGIN':sql);},
  };
}

export async function movieRows(db, {search='',genre='',decade='',access='',sort='recent',includeUnpublished=false}={}) {
  const where = [includeUnpublished ? '1=1' : 'm.published=1'];
  const args = [];
  if (search) { where.push('(LOWER(m.title) LIKE ? OR LOWER(m.synopsis) LIKE ? OR LOWER(m.director) LIKE ? OR LOWER(m.cast_text) LIKE ? OR LOWER(g.name) LIKE ?)');
    for(let i=0;i<5;i++) args.push('%'+search.toLowerCase()+'%'); }
  if (genre) { where.push('EXISTS(SELECT 1 FROM movie_genres mg2 JOIN genres g2 ON g2.id=mg2.genre_id WHERE mg2.movie_id=m.id AND g2.name=?)');args.push(genre); }
  if (decade) { const d=Number(decade);if(Number.isInteger(d)&&d>=1900&&d<=2030){where.push('m.year BETWEEN ? AND ?');args.push(d,d+9);} }
  if (access && ['free','subscription','rental','both'].includes(access)) {where.push('m.access_type=?'); args.push(access);}
  const order = sort==='oldest'?'m.year ASC':sort==='title'?'LOWER(m.title) ASC':sort==='popular'?'views DESC':'m.year DESC';
  return (await db.prepare(`SELECT m.*, STRING_AGG(DISTINCT g.name, ',') genres,
    (SELECT ROUND(AVG(stars),1) FROM reviews r WHERE r.movie_id=m.id) rating,
    (SELECT COUNT(*) FROM watch_history w WHERE w.movie_id=m.id) views
    FROM movies m LEFT JOIN movie_genres mg ON mg.movie_id=m.id
    LEFT JOIN genres g ON g.id=mg.genre_id
    WHERE ${where.join(' AND ')} GROUP BY m.id ORDER BY ${order}, m.id LIMIT 100`).all(...args))
   .map(m=>({...m, genres:m.genres?.split(',')||[], published:!!m.published, featured:!!m.featured, demo:!!m.demo}));
}
