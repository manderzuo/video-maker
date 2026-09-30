import type {Asset} from '../../../domain/asset';
import type {Run} from '../../../domain/run';
export function ResultNode({assetId,runId,asset,run}:{assetId:string;runId:string;asset?:Asset;run?:Run}){const valid=asset?.sourceRunId===runId&&run?.resultAssetId===assetId;return <div><p>{asset?.title??'固定结果'}</p><p>素材 {assetId}</p><p>任务 {runId}</p><small>{valid?'固定历史结果 · 只读':'原任务或素材待恢复，不替换绑定。'}</small></div>;}
