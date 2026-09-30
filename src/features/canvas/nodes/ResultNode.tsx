import type {Asset} from '../../../domain/asset';
import type {Run} from '../../../domain/run';
import {AssetNode} from './AssetNode';
import {WorkBranchDialog} from '../WorkBranchDialog';
export function ResultNode({assetId,runId,asset,run}:{assetId:string;runId:string;asset?:Asset;run?:Run}){const valid=asset?.sourceRunId===runId&&run?.resultAssetId===assetId;return <div><AssetNode assetId={assetId} asset={asset}/><p>任务 {runId}</p><small>{valid?'固定历史结果 · 只读':'原任务或素材待恢复，不替换绑定。'}</small><WorkBranchDialog run={run} asset={asset}/></div>;}
