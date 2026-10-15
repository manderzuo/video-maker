// Shared by release packaging and controlled runtime updates.
export function reviewedImageContract(contract,review){
 if(review.verification!=='reviewed'||review.contractVersion!=='gemstory-multi-image-reviewed-20261015'||review.modelFamily!=='seedance2-fast'||review.sourceCommit!=='8f9d06dae1807381307aef0b77cc33f47d6a3239'||review.nativeSourceCommit!=='f4c44fea3bd4b9b02a00543e9b8b405fd4a3602e'||review.route!=='/v1/assets'||review.scope!=='assets:write'||review.requestField!=='image_asset_ids'||review.assetBytes!==33554432||review.imageReferences!==9||review.videoReferences!==0)throw Error('image_reference_review_required');
 if(!contract||contract.verification==='unknown'||!contract.routes.videoSubmit||!contract.routes.videoQuery||!contract.routes.videoContent||JSON.stringify(contract.videoModels)!=='["seedance"]')throw Error('existing_video_contract_required');
 const next=structuredClone(contract);next.routes.assets=true;
 next.limits={...next.limits,assetBytes:review.assetBytes,imageReferences:review.imageReferences};
 next.verification='reviewed';next.version=review.contractVersion;
 const reference=`deploy/seedance-image-reference-review.json; Core@${review.sourceCommit}; AI Work@${review.nativeSourceCommit}; Seedance 2.0 Fast model limit ${review.imageReferences}; owned image_asset_ids ordered/digest checked; official model documentation and source reviewed, not a live multi-image generation receipt.`;
 if(!next.evidence.some(e=>e.kind==='deployment_review'&&e.reference===reference))next.evidence.push({kind:'deployment_review',reference});
 return next;
}
