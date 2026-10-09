import {createHash} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import type {Pool} from 'pg';
import {transaction} from './transaction.js';
async function migrationScripts(directory:string){
 const names=(await readdir(directory)).filter(name=>/^\d{3}-[a-z0-9-]+\.sql$/.test(name)).sort();if(!names.length)throw new Error('MIGRATIONS_MISSING');
 return Promise.all(names.map(async name=>{const sql=await readFile(join(directory,name),'utf8');return {name,sql,sha256:createHash('sha256').update(sql).digest('hex')};}));
}
export async function verifyDatabaseMigrations(pool:Pool,directory:string){
 const scripts=await migrationScripts(directory),applied=await pool.query<{name:string;sha256:string}>('SELECT name,sha256 FROM studio_schema_migrations ORDER BY name');
 if(applied.rows.length!==scripts.length||scripts.some((script,index)=>script.name!==applied.rows[index].name||script.sha256!==applied.rows[index].sha256))throw new Error('DATABASE_MIGRATIONS_REQUIRED');
}
export async function migrateDatabase(pool:Pool,directory:string){
 const scripts=await migrationScripts(directory),names=scripts.map(script=>script.name);
 return transaction(pool,async db=>{
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended('aiwork-studio-schema',0))");await db.query('CREATE TABLE IF NOT EXISTS studio_schema_migrations(name text PRIMARY KEY,sha256 text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
  const applied=await db.query<{name:string;sha256:string}>('SELECT name,sha256 FROM studio_schema_migrations ORDER BY name'),known=new Map(applied.rows.map(row=>[row.name,row.sha256]));if(applied.rows.some(row=>!names.includes(row.name)))throw new Error('MIGRATION_FROM_NEWER_RELEASE');
  const changed:string[]=[];for(const script of scripts){const old=known.get(script.name);if(old){if(old!==script.sha256)throw new Error('MIGRATION_CHANGED');continue;}await db.query(script.sql);await db.query('INSERT INTO studio_schema_migrations(name,sha256) VALUES($1,$2)',[script.name,script.sha256]);changed.push(script.name);}return changed;
 });
}
