# 共享接口与测试夹具约定

状态：实施计划附件，不是已存在的TypeScript文件。所有函数体由对应任务实现。类型约束不依赖React；UI组件另用ReactElement。

## 类型最小结构

```ts
type ValidationIssue = { code: string; path: string; message: string };
type ValidationResult<T> = { ok: true; value: T } | { ok: false; issues: ValidationIssue[] };
type SaveResult = { status: "saved"; revision: number } |
  { status: "conflict"; currentRevision: number } | { status: "failed"; code: string };
type Viewport = { x: number; y: number; scale: number }; // scale在0.25–2.0内
type RunBinding = { connectionId: string; authBindingId: string; originSnapshot: string };
type ExecutionState = "draft" | "preflight_blocked" | "awaiting_confirmation" |
  "persisted" | "uploading" | "submitting" | "submit_unknown" | "accepted" |
  "running" | "succeeded" | "failed_confirmed";
type QueryState = "idle" | "polling" | "paused_by_user" | "interrupted" | "auth_required";
type DeliveryState = "not_ready" | "fetching" | "available_for_preview" |
  "cached_local" | "browser_download_triggered" | "download_failed";
type BillingState = "not_provided" | "reserved" | "pending_reconciliation" | "settled" | "released";
type Project = { id:string; schemaVersion:number; title:string; description:string; revision:number;
  createdAt:number; updatedAt:number; archived:boolean; trashedAt:number|null };
type Edge = { id:string; sourceId:string; targetId:string; port:"text"|"image"|"video"; order:number };
type Graph = { projectId:string; revision:number; nodes:CanvasNode[]; edges:Edge[]; viewport:Viewport };
type CanvasNode = { id:string; type:"text"|"asset"|"video-generation"|"result"|"group";
  title:string; x:number; y:number; locked:boolean; data:NodeData };
type NodeData =
  { kind:"text"; text:string; referenceTokens:ReferenceToken[] } |
  { kind:"asset"; assetId:string } |
  { kind:"video-generation"; draft:VideoSpec; inputBindings:InputBinding[]; stale:boolean } |
  { kind:"result"; assetId:string; runId:string } |
  { kind:"group"; childIds:string[]; collapsed:boolean };
type ReferenceToken = { assetId?:string; alias:string; mediaType:"image"|"video"|"audio"; role:string;
  description:string; available:boolean; unbound:boolean };
type InputBinding = { nodeId:string; assetId?:string; runId?:string; order:number; role:string };
type VideoSpec = { modelId:string; durationSeconds?:number; ratio?:string; resolution?:string };
type Asset = { id:string; sha256:string; mediaType:"image"|"video"|"audio"|"text"; mimeType:string;
  bytes:number; blobKey:string; title:string; durationSeconds?:number; width?:number; height?:number;
  sourceRunId?:string; createdAt:number };
type Run = RunBinding & { id:string; projectId:string; nodeId:string; graphRevision:number;
  idempotencyKey:string; inputSnapshot:unknown; finalBody?:string; finalBodyHash?:string;
  executionState:ExecutionState; queryState:QueryState; deliveryState:DeliveryState; billingState:BillingState;
  taskId?:string; coreRequestId?:string; resultAssetId?:string; createdAt:number; updatedAt:number };
type CoreTaskView = { taskId:string; requestId?:string; status:"queued"|"processing"|"completed"|"failed"|"unknown";
  contentPath?:string; errorCode?:string; workContext?:{workId:string;baseVersionId:string} };
type ConnectionProfile = { id:string; name:string; proxyBase:string; originSnapshot:string; contractVersion:string };
type CapabilityProfile = { contractVersion:string; verification:"unknown"|"reviewed"|"live_verified";
  textModels:string[]; videoModels:string[]; videoAliases:string[]; videoSpecs:VideoSpec[];
  workContext:boolean; continuation:boolean; imageGeneration:boolean; audioGeneration:boolean;
  cancelVideo:boolean; backup:boolean };
type CommandEnvelope = { id:string; projectId:string; baseRevision:number; leaseEpoch:number;
  origin:"ui"|"mcp"; operations:GraphOperation[] };
type GraphOperation = { id:string; type:"add_node"|"update_node"|"remove_node"|"add_edge"|"remove_edge"|
  "move_node"|"group"|"ungroup"|"select_result"; payload:Record<string,unknown> };
type CommandReceipt = { id:string; status:"applied"|"replayed"|"conflict"|"rejected"; revision?:number;
  errorCode?:string };
type PromptCompileInput = { userRequest:string; sceneId:string;
  requestedSpec:{durationSeconds?:number;ratio?:string}; audioPlan:string;
  lockedConstraints:LockedConstraint[]; references:ReferenceToken[] };
type LockedConstraint = { id:string; field:string; originalValue:string; acceptedValue?:string; locked:boolean };
type ConstraintResolution = { conflicts:{field:string;originalValue:string;formValue:string}[];
  readyForAI:boolean; resolved:PromptCompileInput };
type Shot = { id:string; durationSeconds:number; prompt:string; startState:string; endState:string };
type PromptCompileResult = { finalPrompt:string; shotPlan:Shot[]; improvements:string[]; warnings:string[];
  suggestedSpec:{durationSeconds?:number;ratio?:string} };
type PromptResultVersion = PromptCompileResult & { id:string; sourceRevision:number;
  origin:"local"|"ai"|"manual"; validationState:"unchecked"|"needs_review"|"valid";
  promptRunId?:string; createdAt:number };
type PromptDraft = PromptCompileInput & { id:string; revision:number; type:"video"|"image";
  sourceProjectId?:string; sourceNodeId?:string; sourceRevision?:number; ruleVersion:string;
  resultVersions:PromptResultVersion[] };
type PromptRun = RunBinding & { id:string; draftId:string; draftRevision:number; mode:"ai";
  textModelId:string; idempotencyKey:string; requestSnapshot:string; coreRequestId?:string;
  executionState:"persisted"|"sending"|"succeeded"|"failed_confirmed"|"response_unknown"|"waiting_stopped";
  billingState:BillingState; startedAt:number; finishedAt?:number };
type Proposal = { id:string; projectId:string; baseRevision:number; sessionId:string;
  operations:GraphOperation[]; status:"proposed"|"applied"|"rejected"|"conflict" };
type AgentGrant = { projectId:string; scope:"selection"|"nodes"|"project"; nodeIds:string[];
  access:"read"|"propose"; expiresAt:number; epoch:number };
type AgentSession = { id:string; projectId:string; allowedOrigin:string; grant:AgentGrant; connected:boolean };
type ToolResult = { status:"ok"|"awaiting_browser_confirmation"|"rejected"; errorCode?:string; data?:unknown };
```

以上是最小结构，敏感字段不允许“灵活扩展”。`unknown`只出现在不可执行的输入快照/校验边界，使用前必须schema检查。回执不能自带新授权。所有接口公开输入/结果都用判别联合或具体Schema，不以any跳过。

## 各任务补充输入输出类型

| 类型 | 决定的结构 / 规则 |
|---|---|
| SourceManifest | target.relativePath、target.resolvedPathEvidence；sources[]含repository、commit、license、reuseDisposition；恰好五个来源 |
| VisualManifest | pages[]、criticalStates[]；capturePath是实际图文件，reviewDecision不能默认approved |
| StudioDb | 本产品IndexedDB连接；tables: projects/graphs/assets/blobs/runs/promptDrafts/promptRuns/prompts/connections/proposals/receipts/leases/diagnostics |
| LeaseResult / ClaimResult | ok:boolean，epoch?:number，expiresAt?:number，errorCode?:string；失效epoch写失败 |
| ImportReport | successes、failures逐项；errorCode?:string；不超过50文件 |
| MediaMetadata | mimeType、bytes、width?、height?、durationSeconds?；不可读字段缺省不猜测 |
| DeleteTarget / DeletionConfirmation | kind(project/node/asset)、id、mode；确认绑定影响hash和已显示数量 |
| DeletionImpact / DeleteResult | blockers:string[]、sharedAssets、activeRuns、deletable；结果逐项success/error |
| RelinkResult | same_hash_restored/new_asset_requires_confirmation/error，assetId? |
| NewProjectInput | title、description可选，来源模板可选；不包含credentials/runs执行授权 |
| SelectionQuery / ViewAction | 已有节点ID或边界；zoom/pan/fit明确动作；无网络 |
| PositionPatch | nodeId、x、y；不能夹带参数/输入顺序修改 |
| PromptLibraryEntry | id/title/body/tags/variables/source/license/revision/starred/trashed |
| PromptPanelProps | draftId、source(projectId/nodeId/revision可选) |
| ApplyPromptInput | draftId、resultVersionId、targetProjectId、targetNodeId?、baseRevision、mode(insert/apply)、commandId |
| FlowDraftInput | resultVersionId、targetProjectId、baseRevision、capabilityVersion、显式参考；无视频批准 |
| CoreModel / DeploymentContract | 真实目录id；契约包含版本、路由、允许枚举、输入限制、验证来源；不从名称推断视频/文字能力 |
| CoreClient / CredentialSession | 按注册ConnectionProfile操作固定路由；秘钥通过withCredential短期注入；不能暴露给UI状态序列化 |
| AssetUploadInput / CoreAssetRef | 本地asset/blob/mime/name、RunBinding；结果coreAssetId/expiresAt/同绑定 |
| PreparedVideoRequest | runId、binding、finalBody原字符串、bodyHash、idempotencyKey、assetMappings |
| RunDraftInput / RunPlan | project/node/revision、spec、显式输入、caps；plan含阻塞项/输入摘要/下游依赖 |
| ConfirmDecision / ApprovedRun | 用户确认planHash、节点数、输入快照；批准记录关联run，不当远端身份 |
| RecoveryDecision / RecoveryResult | query/replay_original/manual_only；原bytes/原键仅契约验证后重放 |
| PreflightResult | ready/blocked、issues[]、plan?；预检零网络 |
| QueueApproval | queueId、planHashes、revision、explicitDecision；未见的上游结果不能提前批准 |
| PollResult | httpStatus?、retryAfter?、errorCode?、task?；不将network_error当生成终态 |
| ApprovedPromptInput | draftId/revision、requestSnapshot、binding、textModelId、idempotencyKey、approvalId |
| PromptParseResult | parsed/result 或 invalid/rawForLocalReview/issues；不得执行输出或自动请求修复 |
| VideoWork / WorkRevisionInput | workId、versions[]、baseVersionId；action revise/continue、prompt、显式spec覆盖、RunBinding |
| MediaIntent | preview/download/cache；MediaDeliveryResult含blobKey/objectUrl?和交付状态，不包含Key URL |
| DownloadTriggerResult | triggered/failed；没有“已写入Downloads”状态 |
| TaskFilter / TaskListItem | 类型(video/prompt)、project、独立四维状态与非秘密来源 |
| ResultSelectionInput | projectId/nodeId/runId/assetId/baseRevision/commandId |
| ExportOptions / ExportResult | structure/full、explicitMissingAssetsPolicy；blob/fileName/report；无执行授权 |
| ImportInspection / ImportPlan | ok/errorCode、manifest、缺失/未知项、尺寸预算、ID映射；新project默认；非法内容不执行 |
| StorageSummary / CleanupReport | estimateBytes?、actualKnownBytes、source、deletedRebuildableItems；未知不伪造0 |
| RecoveryIssue / RecoveryAction | code、run/project refs、binding；仅安全下一步query/export/reload/provide_auth/manual |
| DiagnosticFilter | projectId?、kind?、timeRange?；输出固定字段白名单 |
| AgentConnectInput | 回环地址、独立session token、origin、projectId；无Core Key |
| FeatureAvailability | visible、executable、reason、evidenceVersion；两者可不同 |
| CompatibilityDecision | writable/readonly/unsupported、reason；新版本数据不能默默降schema |
| CrashPoint / CrashScenarioResult | 有限已命名崩溃点；真实模拟请求计数、持久run快照、重开后计数 |
| LiveApproval | endpoint、bindingLabel、allowedTextSubmissions、allowedVideoSubmissions、expiresAt、可验证费用约束；不保存Key |

## 测试夹具责任

T03提供网络计数器、阻断所有未允许业务网路的setup、Vitest/Playwright环境和通用纯数据factory。T04使factory对齐正式类型，T05新增真实IndexedDB的`seedStudio(page, scenario)`，用实际schema和事务写入，不让mock仓库掩盖保存问题。

未来`tests/helpers/fixtures.ts`导出`f`：project、run、promptInput、draft、promptResult、caps、unknownCaps、workRevision、agentConnect、agentGrant、agentSession为类型factory；persist/readProject/Graph/Run/Draft、persistApprovedRun、persistActiveRun、projectCount、persistedText操作隔离测试DB；validFiles/zipWithEntry为小型原创测试素材；networkRequests/videoPosts/commandWrites读取真正请求计数，不是写死返回值；failFinalBodySave/failNextStatus/redirectNextDownload/disableCapability/agentOrigin/originalIdempotencyKey注入精确故障；threeShotGraph/addTextCommand创建固定场景。

`seedStudio`场景名：minimal-project、project-library、unverified-capability、asset-library、template-with-required-variable、prompt-draft、prompt-result-ready、runnable-video、invalid-ai-result、mixed-task-history、two-result-versions、storage-persistence-denied、submit-unknown、agent-readonly、editable-history、newer-project-schema。每个场景的project ID固定p1，不带真实Key。

`countPaidRequests(page): Promise<number>`统计本地Mock的聊天/视频提交，而不是页面点击数。
T45的`runCrashScenario(name)`使用实际浏览器/MockHTTP故障与持久DB，不能只构造期望JSON。
T48的`loadLiveApproval()`读取本地审批并检查截止时间，不用环境变量存在替代具体范围授权。

单测代码块为最小回归示例，完整实现还要覆盖该任务全部条目与交互台账。文件存在、report写true、类型检查通过都不能替代真实行为测试。
