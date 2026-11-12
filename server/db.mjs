import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const timestamp = () => new Date().toISOString();

export function openDb(filename) {
  fs.mkdirSync(path.dirname(filename), {recursive:true});
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')),
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    profile_id INTEGER REFERENCES profiles(id) ON DELETE SET NULL,
    csrf_token TEXT NOT NULL, expires_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS profiles (
    id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL, avatar TEXT NOT NULL DEFAULT '🌷', is_kid INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS subscription_plans (
    id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
    price_cents INTEGER NOT NULL, duration_days INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
    plan_id INTEGER NOT NULL REFERENCES subscription_plans(id),
    payment_id INTEGER REFERENCES payments(id), status TEXT NOT NULL,
    starts_at TEXT NOT NULL, expires_at TEXT NOT NULL, auto_renew INTEGER NOT NULL DEFAULT 0,
    cancel_requested_at TEXT
  );
  CREATE TABLE IF NOT EXISTS movies (
    id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
    synopsis TEXT NOT NULL, year INTEGER NOT NULL, duration_sec INTEGER NOT NULL DEFAULT 300,
    age_rating INTEGER NOT NULL DEFAULT 0, director TEXT NOT NULL DEFAULT '', cast_text TEXT NOT NULL DEFAULT '',
    access_type TEXT NOT NULL CHECK(access_type IN ('free','subscription','rental','both')),
    rental_cents INTEGER NOT NULL DEFAULT 790,
    rental_start_days INTEGER NOT NULL DEFAULT 30, rental_watch_hours INTEGER NOT NULL DEFAULT 48,
    poster TEXT NOT NULL, banner TEXT NOT NULL, video_file TEXT NOT NULL,
    published INTEGER NOT NULL DEFAULT 1, featured INTEGER NOT NULL DEFAULT 0,
    demo INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS genres (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE);
  CREATE TABLE IF NOT EXISTS movie_genres (
    movie_id INTEGER REFERENCES movies(id) ON DELETE CASCADE,
    genre_id INTEGER REFERENCES genres(id) ON DELETE CASCADE, PRIMARY KEY(movie_id,genre_id)
  );
  CREATE TABLE IF NOT EXISTS series (
    id INTEGER PRIMARY KEY, title TEXT NOT NULL, synopsis TEXT NOT NULL DEFAULT '', published INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS episodes (
    id INTEGER PRIMARY KEY, series_id INTEGER REFERENCES series(id) ON DELETE CASCADE,
    season INTEGER NOT NULL, number INTEGER NOT NULL, title TEXT NOT NULL,
    video_file TEXT, UNIQUE(series_id,season,number)
  );
  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
    kind TEXT NOT NULL CHECK(kind IN ('rental','subscription')),
    product_id INTEGER NOT NULL, amount_cents INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
    provider TEXT NOT NULL DEFAULT 'internal_sandbox', external_reference TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS rentals (
    id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
    movie_id INTEGER NOT NULL REFERENCES movies(id), payment_id INTEGER NOT NULL UNIQUE REFERENCES payments(id),
    purchased_at TEXT NOT NULL, start_by TEXT NOT NULL, started_at TEXT, expires_at TEXT
  );
  CREATE TABLE IF NOT EXISTS favorites (
    profile_id INTEGER REFERENCES profiles(id) ON DELETE CASCADE,
    movie_id INTEGER REFERENCES movies(id) ON DELETE CASCADE,
    PRIMARY KEY(profile_id,movie_id)
  );
  CREATE TABLE IF NOT EXISTS watch_progress (
    profile_id INTEGER REFERENCES profiles(id) ON DELETE CASCADE,
    movie_id INTEGER REFERENCES movies(id) ON DELETE CASCADE,
    position_sec REAL NOT NULL, updated_at TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(profile_id,movie_id)
  );
  CREATE TABLE IF NOT EXISTS watch_history (
    id INTEGER PRIMARY KEY, profile_id INTEGER REFERENCES profiles(id) ON DELETE CASCADE,
    movie_id INTEGER REFERENCES movies(id) ON DELETE CASCADE, watched_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS reviews (
    profile_id INTEGER REFERENCES profiles(id) ON DELETE CASCADE,
    movie_id INTEGER REFERENCES movies(id) ON DELETE CASCADE,
    stars INTEGER NOT NULL CHECK(stars BETWEEN 1 AND 5), body TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL, PRIMARY KEY(profile_id,movie_id)
  );
  CREATE TABLE IF NOT EXISTS achievements (
    id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, title TEXT NOT NULL, icon TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS user_achievements (
    profile_id INTEGER REFERENCES profiles(id) ON DELETE CASCADE,
    achievement_id INTEGER REFERENCES achievements(id) ON DELETE CASCADE,
    awarded_at TEXT NOT NULL, PRIMARY KEY(profile_id,achievement_id)
  );
  CREATE TABLE IF NOT EXISTS banners (
    id INTEGER PRIMARY KEY, movie_id INTEGER REFERENCES movies(id), active INTEGER DEFAULT 1, position INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS video_assets (
    id INTEGER PRIMARY KEY, movie_id INTEGER REFERENCES movies(id), format TEXT NOT NULL,
    path TEXT NOT NULL, resolution TEXT, status TEXT NOT NULL DEFAULT 'ready'
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_series_title ON series(title);
  CREATE INDEX IF NOT EXISTS idx_movies_year ON movies(year);
  CREATE INDEX IF NOT EXISTS idx_movies_access ON movies(access_type,published);
  CREATE INDEX IF NOT EXISTS idx_profiles_owner ON profiles(user_id);
  CREATE INDEX IF NOT EXISTS idx_payments_owner ON payments(user_id,status);
  CREATE INDEX IF NOT EXISTS idx_rentals_owner ON rentals(user_id,movie_id);
  CREATE INDEX IF NOT EXISTS idx_progress_profile ON watch_progress(profile_id,updated_at);
  CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
  `);
  if(!db.prepare('PRAGMA table_info(episodes)').all().some(c=>c.name==='movie_id')) db.exec('ALTER TABLE episodes ADD COLUMN movie_id INTEGER REFERENCES movies(id)');
  if(!db.prepare('PRAGMA table_info(subscriptions)').all().some(c=>c.name==='cancel_requested_at'))
    db.exec('ALTER TABLE subscriptions ADD COLUMN cancel_requested_at TEXT');
  seed(db);
  return db;
}

function seed(db) {
  const plans = [['mensal','Retro Play Mensal',1990,30],['anual','Retro Play Anual',14990,365]];
  for (const p of plans) db.prepare('INSERT OR IGNORE INTO subscription_plans(code,name,price_cents,duration_days) VALUES(?,?,?,?)').run(...p);
  const genres = ['Clássicos','Ficção científica','Drama','Romance','Suspense','Aventura','Comédia','Animação','Fantasia'];
  for (const genre of genres) db.prepare('INSERT OR IGNORE INTO genres(name) VALUES (?)').run(genre);
  for (const a of [['primeiro','Primeira sessão','🎟️'],['cinefilo','Cinco sessões','🍿'],['classicos','Explorador dos clássicos','📼']])
    db.prepare('INSERT OR IGNORE INTO achievements(code,title,icon) VALUES (?,?,?)').run(...a);
  const movies = [
    {slug:'cafe-das-estrelas',title:'Café das Estrelas',synopsis:'Num café além do tempo, duas pessoas se encontram entre constelações e memórias. Uma pequena viagem visual para celebrar as histórias que ficam.',year:1987, age:0, director:'Retro Play Studio', access:'free', price:0, featured:1, art:'01', video:'cafe-das-estrelas.mp4',genres:['Ficção científica','Romance']},
    {slug:'cartas-ao-verao',title:'Cartas ao Verão',synopsis:'Entre cartões-postais, música e encontros, uma lembrança de verão ganha uma segunda chance.',year:1994, age:0, director:'Retro Play Studio', access:'subscription', price:790,art:'02', video:'cartas-ao-verao.mp4',genres:['Romance','Drama']},
    {slug:'a-ultima-sessao',title:'A Última Sessão',synopsis:'Quando as luzes do velho cinema se apagam, os mistérios de outra época começam a ganhar vida.',year:1978, age:12, director:'Retro Play Studio', access:'rental', price:790,art:'03', video:'a-ultima-sessao.mp4',genres:['Suspense','Clássicos']},
    {slug:'domingo-em-technicolor',title:'Domingo em Technicolor',synopsis:'Um passeio pela cidade que transforma uma tarde comum em uma celebração do inesperado.',year:2003, age:0, director:'Retro Play Studio', access:'both', price:590,art:'04',video:'domingo-em-technicolor.mp4',genres:['Comédia','Aventura']},
    {slug:'o-colecionador-de-sonhos',title:'O Colecionador de Sonhos',synopsis:'Um arquivo de sonhos esquecidos revela delicadas histórias de outras décadas.',year:1965, age:0,director:'Retro Play Studio',access:'free',price:0,art:'05',video:'cafe-das-estrelas.mp4',genres:['Fantasia','Clássicos']},
    {slug:'vinil-e-estrelas',title:'Vinil & Estrelas',synopsis:'Uma fita, uma canção e uma amizade atravessam o tempo numa aventura leve e nostálgica.',year:1982,age:0,director:'Retro Play Studio',access:'subscription',price:590,art:'06',video:'cartas-ao-verao.mp4',genres:['Drama','Aventura']},
    {slug:'jardim-de-lua',title:'Jardim de Lua',synopsis:'Um pequeno universo animado de flores, sonhos e descobertas à luz da lua.',year:2014,age:0,director:'Retro Play Studio',access:'free',price:0,art:'07',video:'domingo-em-technicolor.mp4',genres:['Animação','Fantasia']},
    {slug:'estacao-amanha',title:'Estação Amanhã',synopsis:'Uma estação de trem fora dos mapas conecta passado, presente e futuro.',year:2024,age:10,director:'Retro Play Studio',access:'rental',price:990,art:'08',video:'a-ultima-sessao.mp4',genres:['Ficção científica','Aventura']}
  ];
  const insert = db.prepare(`INSERT OR IGNORE INTO movies(slug,title,synopsis,year,age_rating,director,access_type,rental_cents,poster,banner,video_file,published,featured,demo,created_at,duration_sec)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const movieGenre = db.prepare('INSERT OR IGNORE INTO movie_genres(movie_id,genre_id) VALUES(?,?)');
  for (const m of movies) {
    insert.run(m.slug,m.title,m.synopsis,m.year,m.age,m.director,m.access,m.price,`/assets/posters/${m.art}.svg`,`/assets/posters/${m.art}.svg`,m.video,1,m.featured||0,1,timestamp(),8);
    const id = db.prepare('SELECT id FROM movies WHERE slug=?').get(m.slug).id;
    for (const g of m.genres) movieGenre.run(id,db.prepare('SELECT id FROM genres WHERE name=?').get(g).id);
  }
  const anthologies=[
    ['Fitas da Nostalgia','Antologia de curtas demonstrativos que celebra lembranças, mistérios e encontros no cinema.', ['cafe-das-estrelas','cartas-ao-verao','a-ultima-sessao','domingo-em-technicolor']],
    ['Pequenas Viagens','Uma seleção episódica de histórias fictícias para explorar épocas e mundos diferentes.', ['o-colecionador-de-sonhos','vinil-e-estrelas','jardim-de-lua','estacao-amanha']]
  ];
  for(const [title,synopsis,slugs] of anthologies){
    db.prepare('INSERT OR IGNORE INTO series(title,synopsis,published) VALUES(?,?,1)').run(title,synopsis);
    const sid=db.prepare('SELECT id FROM series WHERE title=?').get(title).id;
    for(let i=0;i<slugs.length;i++){
      const movie=db.prepare('SELECT id,title,video_file FROM movies WHERE slug=?').get(slugs[i]);
      db.prepare('INSERT OR IGNORE INTO episodes(series_id,season,number,title,video_file,movie_id) VALUES(?,1,?,?,?,?)').run(sid,i+1,movie.title,movie.video_file,movie.id);
      db.prepare('UPDATE episodes SET movie_id=? WHERE series_id=? AND season=1 AND number=? AND movie_id IS NULL').run(movie.id,sid,i+1);
    }
  }
}

export function movieRows(db, {search='',genre='',decade='',access='',sort='recent',includeUnpublished=false}={}) {
  const where = [includeUnpublished ? '1=1' : 'm.published=1'];
  const args = [];
  if (search) { where.push('(LOWER(m.title) LIKE ? OR LOWER(m.synopsis) LIKE ? OR LOWER(m.director) LIKE ? OR LOWER(m.cast_text) LIKE ? OR LOWER(g.name) LIKE ?)');
    for(let i=0;i<5;i++) args.push('%'+search.toLowerCase()+'%'); }
  if (genre) { where.push('EXISTS(SELECT 1 FROM movie_genres mg2 JOIN genres g2 ON g2.id=mg2.genre_id WHERE mg2.movie_id=m.id AND g2.name=?)');args.push(genre); }
  if (decade) { const d=Number(decade);if(Number.isInteger(d)&&d>=1900&&d<=2030){where.push('m.year BETWEEN ? AND ?');args.push(d,d+9);} }
  if (access && ['free','subscription','rental','both'].includes(access)) {where.push('m.access_type=?'); args.push(access);}
  const order = sort==='oldest'?'m.year ASC':sort==='title'?'m.title COLLATE NOCASE ASC':sort==='popular'?'views DESC':'m.year DESC';
  return db.prepare(`SELECT m.*, GROUP_CONCAT(DISTINCT g.name) genres,
    (SELECT ROUND(AVG(stars),1) FROM reviews r WHERE r.movie_id=m.id) rating,
    (SELECT COUNT(*) FROM watch_history w WHERE w.movie_id=m.id) views
    FROM movies m LEFT JOIN movie_genres mg ON mg.movie_id=m.id
    LEFT JOIN genres g ON g.id=mg.genre_id
    WHERE ${where.join(' AND ')} GROUP BY m.id ORDER BY ${order}, m.id LIMIT 100`).all(...args)
   .map(m=>({...m, genres:m.genres?.split(',')||[], published:!!m.published, featured:!!m.featured, demo:!!m.demo}));
}
