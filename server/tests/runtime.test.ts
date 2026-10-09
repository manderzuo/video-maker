import {mkdtemp,writeFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {it,expect} from 'vitest';
import {runtimeConfigSchema,parseRuntimeSecrets} from '../src/runtime-config.js';
import {migrateDatabase,verifyDatabaseMigrations} from '../src/db/migrate.js';
import {fixture} from './account-fixture.js';
import {buildStudioApp} from '../src/app.js';
const config={origin:'https://studio.gemstory.cn',host:'127.0.0.1',port:4188,database:{host:'127.0.0.1',port:5432,name:'aiwork_studio',user:'aiwork_studio'},secretsFile:join(tmpdir(),'test-secrets.json'),assets:{root:join(tmpdir(),'aiwork-private-test'),maxAssetBytes:209715200,userQuotaBytes:1073741824,maxThumbnailBytes:2097152},videoContracts:[]};
it('trusts forwarded client addresses only from the configured loopback proxy',async()=>{
 const env=await fixture(),app=await buildStudioApp({pool:env.pool,origin:'https://studio.test',loopbackProxy:true});app.get('/runtime-ip',request=>({ip:request.ip}));env.app.get('/runtime-ip',request=>({ip:request.ip}));
 try{expect((await app.inject({url:'/runtime-ip',remoteAddress:'127.0.0.1',headers:{'x-forwarded-for':'198.51.100.42'}})).json().ip).toBe('198.51.100.42');expect((await app.inject({url:'/runtime-ip',remoteAddress:'203.0.113.9',headers:{'x-forwarded-for':'198.51.100.42'}})).json().ip).toBe('203.0.113.9');expect((await env.app.inject({url:'/runtime-ip',remoteAddress:'127.0.0.1',headers:{'x-forwarded-for':'198.51.100.42'}})).json().ip).toBe('127.0.0.1');}finally{await app.close();await env.close();}
});
it('requires an exact HTTPS origin, loopback service/database and explicit private capacity',()=>{expect(runtimeConfigSchema.parse(config)).toMatchObject({host:'127.0.0.1'});for(const patch of [{origin:'http://studio.gemstory.cn'},{origin:'https://studio.gemstory.cn/path'},{host:'0.0.0.0'},{database:{...config.database,host:'example.test'}},{assets:{...config.assets,userQuotaBytes:1}}])expect(runtimeConfigSchema.safeParse({...config,...patch}).success).toBe(false);});
it('requires versioned encryption roots and never accepts a missing or short root',()=>{const value={databasePassword:'FAKE_DB_PASSWORD',activeVersion:'root-1',keys:{'root-1':Buffer.alloc(32,4).toString('base64')}};expect(parseRuntimeSecrets(value).keys.get('root-1')).toHaveLength(32);expect(()=>parseRuntimeSecrets({...value,keys:{'root-1':'short'}})).toThrow();expect(()=>parseRuntimeSecrets({...value,activeVersion:'missing'})).toThrow();});
it('refuses mock video contracts in production configuration',()=>{const contract={version:'fake',verification:'reviewed',evidence:[{kind:'mock',reference:'test only'}],routes:{models:true,videoSubmit:true,videoQuery:true,videoContent:true,chat:false,assets:false,workContext:false,continuation:false,backup:false},textModels:[],videoModels:['seedance'],videoAliases:[],videoSpecs:[],limits:{}};expect(runtimeConfigSchema.safeParse({...config,videoContracts:[{apiBase:'https://api.gemstory.cn',contract}]}).success).toBe(false);});
it('applies schema-only SQL exactly once and refuses changed migrations',async()=>{
 const env=await fixture(),schema='runtime_test_'+randomUUID().replaceAll('-',''),pool=new pg.Pool({host:'127.0.0.1',port:55432,database:'aiwork_studio_test',user:'aiwork_test',password:'aiwork_local_test_only',options:'-c search_path='+schema}),root=await mkdtemp(join(tmpdir(),'aiwork-runtime-test-'));
 try{await env.pool.query('CREATE SCHEMA "'+schema+'"');await writeFile(join(root,'001-empty.sql'),'CREATE TABLE empty_workspace(id uuid PRIMARY KEY);');expect(await migrateDatabase(pool,root)).toEqual(['001-empty.sql']);expect(await migrateDatabase(pool,root)).toEqual([]);await verifyDatabaseMigrations(pool,root);expect((await pool.query('SELECT count(*) AS n FROM empty_workspace')).rows[0].n).toBe('0');await writeFile(join(root,'001-empty.sql'),'DROP TABLE empty_workspace;');await expect(verifyDatabaseMigrations(pool,root)).rejects.toThrow('DATABASE_MIGRATIONS_REQUIRED');await expect(migrateDatabase(pool,root)).rejects.toThrow('MIGRATION_CHANGED');expect((await pool.query('SELECT count(*) AS n FROM empty_workspace')).rows[0].n).toBe('0');}
 finally{await pool.end();await env.pool.query('DROP SCHEMA "'+schema+'" CASCADE');await env.close();if(root.startsWith(join(tmpdir(),'aiwork-runtime-test-')))await rm(root,{recursive:true,force:true});}
});
it('rolls back the entire migration transaction on an invalid script',async()=>{
 const env=await fixture(),schema='runtime_test_'+randomUUID().replaceAll('-',''),pool=new pg.Pool({host:'127.0.0.1',port:55432,database:'aiwork_studio_test',user:'aiwork_test',password:'aiwork_local_test_only',options:'-c search_path='+schema}),root=await mkdtemp(join(tmpdir(),'aiwork-runtime-test-'));
 try{await env.pool.query('CREATE SCHEMA "'+schema+'"');await mkdir(root,{recursive:true});await writeFile(join(root,'001-create.sql'),'CREATE TABLE early_workspace(id uuid PRIMARY KEY);');await writeFile(join(root,'002-invalid.sql'),'THIS IS INVALID SQL;');await expect(migrateDatabase(pool,root)).rejects.toThrow();expect((await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema=$1",[schema])).rows).toEqual([]);}
 finally{await pool.end();await env.pool.query('DROP SCHEMA "'+schema+'" CASCADE');await env.close();if(root.startsWith(join(tmpdir(),'aiwork-runtime-test-')))await rm(root,{recursive:true,force:true});}
});
