import {z} from 'zod';
import {useSyncExternalStore} from 'react';
export const preferencesSchema=z.strictObject({theme:z.enum(['dark','light','system']),density:z.enum(['comfortable','compact']),animation:z.enum(['system','reduced','full']),autoPlay:z.boolean(),muted:z.boolean(),volume:z.number().min(0).max(1),showUnavailable:z.boolean(),defaultTextModel:z.string().max(256),defaultVideoModel:z.string().max(256),defaultDuration:z.number().positive().nullable(),defaultRatio:z.string().max(32)});
export type Preferences=z.infer<typeof preferencesSchema>;
export const defaultPreferences:Preferences={theme:'dark',density:'comfortable',animation:'system',autoPlay:false,muted:true,volume:1,showUnavailable:true,defaultTextModel:'',defaultVideoModel:'',defaultDuration:null,defaultRatio:''};
let current:Preferences={...defaultPreferences};try{const stored=localStorage.getItem('aiwork-studio:preferences');if(stored)current=preferencesSchema.parse(JSON.parse(stored));else if(localStorage.getItem('aiwork-studio:theme')==='light')current.theme='light';}catch{/* Invalid or unavailable preference storage does not erase projects. */}
const listeners=new Set<()=>void>();
export const getPreferences=()=>current;
export const subscribePreferences=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};};
export const usePreferences=()=>useSyncExternalStore(subscribePreferences,getPreferences);
const subscribeSystemTheme=(listener:()=>void)=>{const media=matchMedia('(prefers-color-scheme: dark)');media.addEventListener('change',listener);return()=>media.removeEventListener('change',listener);};
export const useSystemDark=()=>useSyncExternalStore(subscribeSystemTheme,()=>matchMedia('(prefers-color-scheme: dark)').matches);
export function savePreferences(patch:Partial<Preferences>){const next=preferencesSchema.parse({...current,...patch});current=next;let persisted=true;try{localStorage.setItem('aiwork-studio:preferences',JSON.stringify(next));localStorage.setItem('aiwork-studio:theme',next.theme);}catch{persisted=false;}for(const listener of listeners)listener();return {persisted};}
export function applyPreferencesToDocument(preferences:Preferences){const systemDark=matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.dataset.theme=preferences.theme==='system'?systemDark?'dark':'light':preferences.theme;document.documentElement.dataset.density=preferences.density;document.documentElement.dataset.motion=preferences.animation==='reduced'||preferences.animation==='system'&&matchMedia('(prefers-reduced-motion: reduce)').matches?'reduced':'full';}
