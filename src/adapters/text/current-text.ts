import {getActiveCore,subscribeActiveCore} from '../core/current-connection';
import type {CoreClient} from '../core/http-client';
import {capabilitySchema,type CapabilityProfile} from '../../domain/connection';
import {forgetSessionCredential} from '../../security/credential-session';
let current:{client:CoreClient;capability:CapabilityProfile}|undefined;
const listeners=new Set<()=>void>();
export function subscribeTextConnection(listener:()=>void){listeners.add(listener);const core=subscribeActiveCore(listener);return()=>{listeners.delete(listener);core();};}
export function setActiveText(client:CoreClient,capability:CapabilityProfile){const checked=capabilitySchema.parse(structuredClone(capability));if(client.binding.kind!=='text-api'||checked.contractVersion!==client.profile.contractVersion||checked.videoModels.length||checked.videoSpecs.length)throw Error('text_connection_invalid');if(current)forgetSessionCredential(current.client.binding.id);current={client,capability:checked};for(const listener of listeners)listener();}
export function clearActiveText(){if(current)forgetSessionCredential(current.client.binding.id);current=undefined;for(const listener of listeners)listener();}
export function getIndependentText(){return current?{client:current.client,capability:structuredClone(current.capability)}:undefined;}
export function getPromptTextConnection(){return getIndependentText()??getActiveCore();}
export function canDeclareTextModel(id:string){return !!id.trim()&&id===id.trim()&&!/(seedance|video|image|gpt-image|dall-e|sora|veo|kling|wan[._-]|audio|tts|whisper|embedding|rerank)/i.test(id);}
