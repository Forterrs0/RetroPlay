import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeSql} from '../server/pg-sql.mjs';
test('PostgreSQL: placeholders e conflito idempotente',()=>{
 assert.equal(normalizeSql('SELECT * FROM users WHERE email=? AND id=?'), 'SELECT * FROM users WHERE email=$1 AND id=$2');
 assert.equal(normalizeSql('INSERT OR IGNORE INTO genres(name) VALUES(?)'), 'INSERT INTO genres(name) VALUES($1) ON CONFLICT DO NOTHING');
});
test('PostgreSQL: citações não são placeholders',()=>{
 assert.equal(normalizeSql("SELECT '?' AS literal, title FROM movies WHERE id=?"),"SELECT '?' AS literal, title FROM movies WHERE id=$1");
 assert.match(normalizeSql('SELECT GROUP_CONCAT(DISTINCT g.name) FROM genres g'),/STRING_AGG/);
});
