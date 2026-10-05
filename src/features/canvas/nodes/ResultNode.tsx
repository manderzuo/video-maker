import {videoNumber} from '../../tasks/video-number';
import type {Asset} from '../../../domain/asset';
import type {Run} from '../../../domain/run';
import {AssetNode} from './AssetNode';
import {WorkBranchDialog} from '../WorkBranchDialog';
import {RunMediaActions} from '../../review/RunMediaActions';
export function ResultNode({assetId,runId,asset,run}:{assetId:string;runId:string;asset?:Asset;run?:Run}){const valid=asset?.sourceRunId===runId&&run?.resultAssetId===assetId;return <div><AssetNode assetId={assetId} asset={asset}/><p title={'任务ID：'+runId}>{run?.id===runId?videoNumber(run):'视频记录待恢复'}</p><small>{valid?'固定历史结果 · 只读':'原任务或素材待恢复，不替换绑定。'}</small>{valid&&run?<RunMediaActions key={run.id} run={run}/>:null}<WorkBranchDialog run={run} asset={asset}/></div>;}
