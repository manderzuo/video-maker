export type ResourceMaps={project?:Map<string,string>;node?:Map<string,string>;asset?:Map<string,string>;run?:Map<string,string>;draft?:Map<string,string>;entry?:Map<string,string>;version?:Map<string,string>};
// Field-aware remapping preserves text, model names and external provider IDs.
export function remapResources(value:unknown,maps:ResourceMaps,key=''):unknown{
 if(typeof value==='string'){
  const map=['projectId','sourceProjectId','originalProjectId'].includes(key)?maps.project:
   ['nodeId','sourceNodeId','sourceId','targetId','childIds','missingInputNodeIds'].includes(key)?maps.node:
   ['assetId','sourceAssetId','resultAssetId','assetIds'].includes(key)?maps.asset:
   ['runId','sourceRunId','promptRunId'].includes(key)?maps.run:key==='draftId'?maps.draft:key==='entryId'?maps.entry:['resultVersionId','restoredFromVersionId'].includes(key)?maps.version:undefined;
  return map?.get(value)??value;
 }
 if(Array.isArray(value))return value.map(item=>remapResources(item,maps,key));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([name,item])=>[name,remapResources(item,maps,name)]));
 return value;
}
