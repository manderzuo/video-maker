import {referenceTokenSchema,type ReferenceToken} from '../graph';
export function normalizeReferenceAliases(references:ReferenceToken[]):ReferenceToken[]{
 const assets=new Set<string>();const aliases=new Set<string>();const counts={image:0,video:0,audio:0};const labels={image:'图片',video:'视频',audio:'音频'};
 return references.map(raw=>{const ref=referenceTokenSchema.parse(raw);if(aliases.has(ref.alias))throw new Error('reference_alias_duplicate');aliases.add(ref.alias);if(ref.assetId){if(assets.has(ref.assetId))throw new Error('reference_asset_duplicate');assets.add(ref.assetId);}return {...ref,originalAlias:ref.originalAlias??ref.alias,alias:`@${labels[ref.mediaType]}${++counts[ref.mediaType]}`,unbound:!ref.assetId||ref.unbound,available:!!ref.assetId&&ref.available&&!ref.unbound};});
}
export function rewriteReferenceAliases(text:string,before:ReferenceToken[],after:ReferenceToken[]):string{
 const mapping=new Map(before.map(ref=>[ref.alias,ref.assetId?after.find(next=>next.assetId===ref.assetId)?.alias:after.find(next=>!next.assetId&&(next.originalAlias??next.alias)===(ref.originalAlias??ref.alias))?.alias]));
 // One replacement pass: swapped aliases cannot replace one another a second time.
 return text.replace(/@(图片|视频|音频)\d+(?!\d)/g,alias=>mapping.has(alias)?mapping.get(alias)??`[未绑定引用：${alias.slice(1)}]`:alias);
}
