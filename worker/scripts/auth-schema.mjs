import { DatabaseSync } from 'node:sqlite';
import { getMigrations } from 'better-auth/db/migration';
import { authOptions } from '../src/auth.js';
import { writeFileSync } from 'node:fs';
const db = new DatabaseSync(':memory:');
const migration = await getMigrations(authOptions({ DB: db, AUTH_BASE_URL: 'http://localhost:8787', AUTH_SECRET: 'schema-generation-only-not-a-runtime-secret' }));
writeFileSync(new URL('../migrations/0001-auth.sql', import.meta.url), (await migration.compileMigrations()).replaceAll('create table ', 'create table if not exists ').replaceAll('create index ', 'create index if not exists ').replaceAll('create unique index ', 'create unique index if not exists ') + '\n');
db.close();
