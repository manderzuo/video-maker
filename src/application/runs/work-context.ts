import type {Run} from '../../domain/run';
import type {Asset} from '../../domain/asset';
import type {CapabilityProfile} from '../../domain/connection';
import type {CoreClient} from '../../adapters/core/http-client';
import type {VideoWork} from '../../adapters/core/video-works';
import type {RunPlan} from './preflight';
export type WorkRevisionInput={action:'revise'|'continue';workId:string;baseVersionId:string;sourceRun:Run;sourceAsset:Asset;work:VideoWork;prompt:string;client:CoreClient;capability:CapabilityProfile};
export async function prepareWorkRevision(input:WorkRevisionInput):Promise<RunPlan>{
 const {capability,client,sourceRun:run,sourceAsset:asset,work}=input;
 if(capability.verification==='unknown'||capability.contractVersion!==client.profile.contractVersion||!capability.workContext)throw Error('work_context_unavailable');
 if(input.action==='continue'&&!capability.continuation)throw Error('continuation_disabled');
 if(run.connectionId!==client.profile.id||run.authBindingId!==client.binding.id||run.originSnapshot!==client.profile.originSnapshot)throw Error('original_authorization_required');
 if(asset.sourceRunId!==run.id||run.resultAssetId!==asset.id||asset.mediaType!=='video')throw Error('work_source_binding_mismatch');
 const parent=work.versions.find(v=>v.versionId===input.baseVersionId);
 if(work.workId!==input.workId||!parent||parent.workId!==input.workId||parent.operationRequestId!==run.coreRequestId||parent.state!=='completed')throw Error('work_parent_unavailable');
 // The fixed public GET omits sealed_snapshot. Local requestedSpec is not proof
 // of Core's inherited parent spec. Never manufacture an executable RunPlan.
 throw Error('work_parent_spec_unverified');
}
