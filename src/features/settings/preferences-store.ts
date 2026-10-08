import {z} from 'zod';
import {useSyncExternalStore} from 'react';
export const preferencesSchema=z.strictObject({lastVisitedPage:z.enum(['/projects','/canvas','/assets','/prompts','/prompt-generator','/tasks','/activity','/settings/connections','/settings/models','/settings/appearance','/settings/storage','/help','/trash','/recovery']).default('/projects'),projectSort:z.enum(['updated','title']).default('updated'),projectList:z.boolean().default(false),theme:z.enum(['dark','light','system']),density:z.enum(['comfortable','compact']),animation:z.enum(['system','reduced','full']),autoPlay:z.boolean(),muted:z.boolean(),volume:z.number().min(0).max(1),showUnavailable:z.boolean(),defaultTextModel:z.string().max(256),defaultVideoModel:z.string().max(256),defaultDuration:z.number().positive().nullable(),defaultRatio:z.string().max(32)});
export type Preferences=z.infer<typeof preferencesSchema>;
export const defaultPreferences:Preferences={lastVisitedPage:'/projects',projectSort:'updated',projectList:false,theme:'dark',density:'comfortable',animation:'system',autoPlay:false,muted:true,volume:1,showUnavailable:true,defaultTextModel:'',defaultVideoModel:'',defaultDuration:null,defaultRatio:''};
let current:Preferences={...defaultPreferences};
const listeners=new Set<()=>void>();
export const getPreferences=()=>current;
export const subscribePreferences=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};};
export const usePreferences=()=>useSyncExternalStore(subscribePreferences,getPreferences);
const subscribeSystemTheme=(listener:()=>void)=>{const media=matchMedia('(prefers-color-scheme: dark)');media.addEventListener('change',listener);return()=>media.removeEventListener('change',listener);};
export const useSystemDark=()=>useSyncExternalStore(subscribeSystemTheme,()=>matchMedia('(prefers-color-scheme: dark)').matches);
// Legacy pure consumers retain an in-memory adapter; the account UI saves through the server document.
export function savePreferences(patch:Partial<Preferences>){current=preferencesSchema.parse({...current,...patch});for(const listener of listeners)listener();return {persisted:false};}
export function resetPreferences(){current={...defaultPreferences};for(const listener of listeners)listener();}
export function adoptUserPreferences(preferences:Omit<Preferences,'lastVisitedPage'|'defaultTextModel'|'defaultVideoModel'>,lastVisitedPage:Preferences['lastVisitedPage']){current=preferencesSchema.parse({...defaultPreferences,...preferences,lastVisitedPage});for(const listener of listeners)listener();}

export function applyPreferencesToDocument(preferences:Preferences){const systemDark=matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.dataset.theme=preferences.theme==='system'?systemDark?'dark':'light':preferences.theme;document.documentElement.dataset.density=preferences.density;document.documentElement.dataset.motion=preferences.animation==='reduced'||preferences.animation==='system'&&matchMedia('(prefers-reduced-motion: reduce)').matches?'reduced':'full';}
