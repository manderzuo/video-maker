import {startCompanion} from './server';
const origin=process.env.STUDIO_ORIGIN,port=Number(process.env.STUDIO_AGENT_PORT??'4181');
if(!origin||!Number.isSafeInteger(port)||port<1||port>65535)throw Error('Set STUDIO_ORIGIN to the exact Studio browser origin and STUDIO_AGENT_PORT to a valid loopback port.');
const relay=await startCompanion({allowedOrigins:[origin],port});
// Explicit local launch displays the independent temporary pairing token once.
process.stdout.write('AI WORK Studio companion '+relay.url+'\nOrigin: '+origin+'\nTemporary pairing token: '+relay.token+'\nNo model host adapter is configured. No generation backend.\n');
for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{void relay.close().then(()=>process.exit(0));});
