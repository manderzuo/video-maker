import {expect,it} from 'vitest';
import pg from 'pg';

// Deliberately fixed to the dedicated tmpfs test DB; never consumes DATABASE_URL.
// All data is transaction-local TEMP data. This is not account-route isolation proof.
it('PostgreSQL driver connects to the isolated DB and rolls back a parameterized TEMP transaction',async()=>{
 const client=new pg.Client({host:'127.0.0.1',port:55432,database:'aiwork_studio_test',user:'aiwork_test',password:'aiwork_local_test_only',connectionTimeoutMillis:3000,query_timeout:5000,statement_timeout:5000});
 await client.connect();
 try{
  const identity=await client.query<{database:string;username:string;version:number}>('SELECT current_database() AS database, current_user AS username, current_setting(\'server_version_num\')::int AS version');
  expect(identity.rows[0]).toMatchObject({database:'aiwork_studio_test',username:'aiwork_test'});
  expect(identity.rows[0]?.version).toBeGreaterThanOrEqual(160000);
  await client.query('BEGIN');
  await client.query('CREATE TEMP TABLE aiwork_driver_smoke (owner_id text NOT NULL, normalized_username text NOT NULL UNIQUE, payload text NOT NULL) ON COMMIT DROP');
  await client.query('INSERT INTO aiwork_driver_smoke VALUES ($1,$2,$3),($4,$5,$6)',['FAKE_A','fake_a',"Fake A text with quote ' and 中文",'FAKE_B','fake_b','Fake B data']);
  const own=await client.query<{owner_id:string;payload:string}>('SELECT owner_id,payload FROM aiwork_driver_smoke WHERE owner_id=$1',['FAKE_A']);
  expect(own.rows).toEqual([{owner_id:'FAKE_A',payload:"Fake A text with quote ' and 中文"}]);
  await client.query('SAVEPOINT uniqueness_check');
  await expect(client.query('INSERT INTO aiwork_driver_smoke VALUES ($1,$2,$3)',['FAKE_C','fake_a','duplicate'])).rejects.toMatchObject({code:'23505'});
  await client.query('ROLLBACK TO SAVEPOINT uniqueness_check');
  const count=await client.query<{count:number}>('SELECT count(*)::int AS count FROM aiwork_driver_smoke');
  expect(count.rows[0]?.count).toBe(2);
  await client.query('ROLLBACK');
  const leftover=await client.query<{relation:string|null}>("SELECT to_regclass('pg_temp.aiwork_driver_smoke')::text AS relation");
  expect(leftover.rows[0]?.relation).toBeNull();
 }finally{
  await client.query('ROLLBACK').catch(()=>undefined);
  await client.end();
 }
});
