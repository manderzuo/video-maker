import type {CoreClient} from './http-client';
import {capabilitySchema,type CapabilityProfile} from '../../domain/connection';
// Runtime connection selection and its ordinary Key remain in this tab's memory.
let current:{client:CoreClient;capability:CapabilityProfile}|undefined;
const listeners=new Set<()=>void>();
const notify=()=>{for(const listener of listeners)listener();};
export function subscribeActiveCore(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
export function setActiveCore(client:CoreClient,capability:CapabilityProfile){const checked=capabilitySchema.parse(structuredClone(capability));if(checked.contractVersion!==client.profile.contractVersion)throw Error('connection_contract_mismatch');current={client,capability:checked};notify();}
export function clearActiveCore(){current=undefined;notify();}
export function getActiveCore(){return current?{client:current.client,capability:structuredClone(current.capability)}:undefined;}
