import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { VideoSpec } from '../../domain/common';
import { canvasVideoSpecs } from '../../domain/canvas-video-spec';
import type { GraphOperation } from '../../application/commands/registry';
import { addNavigationGuard, LocalLink } from '../../app/routes';
import { workspaceMessage, type WorkspaceClient } from '../../infrastructure/api/workspace-client';
import { createCloudCanvasModel } from '../workspace/cloud-canvas-model';
import { CloudVideoInputEditor } from '../workspace/CloudVideoInputEditor';
import { CloudVideoRunPanel } from '../workspace/CloudVideoRunPanel';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
export function MobileVideoPage({ client, projectId, nodeId }: {
    client: WorkspaceClient;
    projectId: string;
    nodeId?: string;
}) {
    const [model] = useState(() => createCloudCanvasModel(projectId, client, { autosaveMs: 1500 })), state = useSyncExternalStore(model.subscribe, model.getState), graph = state.graph;
    const [specs, setSpecs] = useState<VideoSpec[]>([]), [selected, setSelected] = useState(nodeId ?? ''), [error, setError] = useState(''), [preflight, setPreflight] = useState<{
        id: string;
        nodeIds: string[];
    }>();
    const inputDirty = useRef(false), composing = useRef(false), [unsubmitted, setUnsubmitted] = useState(false), [discard, setDiscard] = useState(false), [inputEpoch, setInputEpoch] = useState(0);
    useEffect(() => { void model.load(); return () => model.dispose(); }, [model]);
    useEffect(() => { let active = true; void client.videoCapability().then(cap => { if (active)
        setSpecs(canvasVideoSpecs(cap.videoSpecs)); }).catch(failure => { if (active)
        setError(workspaceMessage(failure)); }); return () => { active = false; }; }, [client]);
    useEffect(() => { if (nodeId)
        setSelected(nodeId); }, [nodeId]);
    useEffect(() => addNavigationGuard(() => { if (model.getState().status === 'saved' && !inputDirty.current)
        return true; setError(inputDirty.current ? '提示词正文尚未保存，请先保存文字并连接。' : '视频草稿尚未保存，请保存或重试后再离开。'); return false; }), [model]);
    useEffect(() => { const beforeUnload = (event: BeforeUnloadEvent) => { if (inputDirty.current || model.getState().status !== 'saved') {
        event.preventDefault();
        event.returnValue = '';
    } }; window.addEventListener('beforeunload', beforeUnload); return () => window.removeEventListener('beforeunload', beforeUnload); }, [model]);
    const nodes = graph?.nodes.filter(node => node.type === 'video-generation') ?? [], node = nodes.find(value => value.id === selected) ?? (!nodeId ? nodes[0] : undefined), canEdit = !!graph && state.status !== 'loading' && state.status !== 'saving';
    function stage(operations: GraphOperation[]) { try {
        model.stage(operations);
        setError('');
        return true;
    }
    catch (failure) {
        setError(workspaceMessage(failure));
        return false;
    } }
    function stageInputs(operations: GraphOperation[]) { if (composing.current) {
        setError('请完成当前中文输入后再保存。');
        return false;
    } const applied = stage(operations); if (applied) {
        inputDirty.current = false;
        setUnsubmitted(false);
    } return applied; }
    function trackInput(event: React.FormEvent<HTMLDivElement>) { const container = event.currentTarget, textarea = container.querySelector<HTMLTextAreaElement>('[data-interaction-id="cloud:video:new-text"]'), pick = container.querySelector<HTMLSelectElement>('[data-interaction-id="cloud:video:pick-text"]'); inputDirty.current = !!textarea?.value.trim() || !!pick?.value; setUnsubmitted(inputDirty.current); }
    function create() { if (!graph || !specs.length) {
        setError('请先在 API 设置中完成连接与视频规格核验。');
        return;
    } const id = crypto.randomUUID(); if (stage([{ id: crypto.randomUUID(), type: 'add_node', payload: { node: { id, type: 'video-generation', title: '视频草稿', x: Math.max(0, ...graph.nodes.map(value => value.x)) + 400, y: 40, locked: false, data: { kind: 'video-generation', draft: { ...specs[0] }, inputBindings: [], stale: true } } } }]))
        setSelected(id); }
    function setSpec(field: keyof VideoSpec, value: string) { if (!node || node.locked)
        return; const draft = node.data.draft, candidates = specs.filter(spec => spec[field] === (field === 'durationSeconds' ? Number(value) : value) && (field === 'modelId' || spec.modelId === draft.modelId)); const next = candidates.find(spec => Object.entries(draft).every(([key, old]) => key === field || spec[key as keyof VideoSpec] === old)) ?? candidates[0]; if (!next) {
        setError('此规格组合尚未核验，原草稿保持原值。');
        return;
    } stage([{ id: crypto.randomUUID(), type: 'update_node', payload: { nodeId: node.id, patch: { data: { ...node.data, draft: { ...next }, stale: true } } } }]); }
    const options = (field: keyof VideoSpec) => [...new Set(specs.filter(spec => field === 'modelId' || spec.modelId === node?.data.draft.modelId).map(spec => spec[field]).filter(value => value !== undefined))];
    return <section className="card"><h1>视频创作</h1><div className="actions"><Button disabled={!canEdit || !specs.length || unsubmitted} onClick={create}>新建视频草稿</Button><Button disabled={state.status !== 'saved' || unsubmitted} onClick={() => void model.load()}>重新读取视频草稿</Button><LocalLink className="button" href={'/m/projects/' + projectId + '/results'}>查看视频结果</LocalLink><LocalLink className="button" href={'/m/projects/' + projectId + '/canvas'}>查看画布</LocalLink></div>{error ? <p role="alert">{error}</p> : null}{state.error ? <p role="alert">{workspaceMessage(state.error)}</p> : null}<p role="status">{state.status === 'saved' ? '视频草稿已保存' : state.status === 'saving' ? '正在保存视频草稿…' : state.status === 'loading' ? '正在加载视频草稿…' : state.status === 'failed' ? '保存未完成，输入保留，请重试' : '视频草稿等待保存'}</p>{state.status === 'failed' || state.status === 'dirty' ? <Button onClick={() => void model.save()}>重试保存视频草稿</Button> : null}
 {nodes.length ? <label>选择视频草稿<select aria-label="选择视频草稿" value={node?.id ?? selected} disabled={!canEdit || unsubmitted} onChange={event => setSelected(event.target.value)}>{!node ? <option value={selected}>指定草稿不可用，请重新选择</option> : null}{nodes.map(value => <option key={value.id} value={value.id}>{value.title}</option>)}</select></label> : <p>尚无视频草稿，可新建或从写作结果创建视频流程。</p>}
 {node && graph ? <><div className="form-stack">{([['modelId', '视频模型'], ['durationSeconds', '视频时长（秒）'], ['ratio', '视频画幅'], ['resolution', '视频清晰度']] as const).map(([field, label]) => { const choices = options(field), value = node.data.draft[field]; return <label key={field}>{label}<select aria-label={label} value={value ?? ''} disabled={!canEdit || node.locked} onChange={event => setSpec(field, event.target.value)}>{value === undefined ? <option value="">未指定</option> : !choices.includes(value) ? <option value={value}>原值 {value}</option> : null}{choices.map(choice => <option key={choice} value={choice}>{field === 'resolution' ? String(choice).toUpperCase() : choice}</option>)}</select></label>; })}</div><div onChange={trackInput} onCompositionStart={() => { composing.current = true; model.setComposing(true); }} onCompositionEnd={() => { composing.current = false; model.setComposing(false); }}><CloudVideoInputEditor key={node.id + ":" + inputEpoch} graph={graph} nodeId={node.id} canEdit={canEdit && !node.locked} stage={stageInputs}/></div><Button variant="primary" disabled={state.status !== 'saved' || node.locked || unsubmitted} onClick={() => setPreflight({ id: crypto.randomUUID(), nodeIds: [node.id] })}>生成视频</Button><CloudVideoRunPanel client={client} graph={graph} saved={state.status === 'saved'} preflightRequest={preflight} onError={setError} onResultInserted={() => void model.load()}/></> : null}
 <LocalLink href="/m/settings/connections">API 设置</LocalLink>{state.status === "failed" || state.status === "dirty" || unsubmitted ? <Button disabled={state.status === "saving"} onClick={() => setDiscard(true)}>放弃本页修改并重新读取</Button> : null}<Dialog open={discard} title="放弃视频草稿修改" onClose={() => setDiscard(false)} footer={<><Button onClick={() => setDiscard(false)}>保留修改</Button><Button variant="danger" onClick={() => { inputDirty.current = false; composing.current = false; model.setComposing(false); setUnsubmitted(false); setInputEpoch(value => value + 1); setDiscard(false); setError(""); void model.load(true); }}>确认放弃并重新读取</Button></>}><p>将放弃本页尚未保存的正文和视频规格，读取云端最新版本。已保存的内容保留。</p></Dialog></section>;
}
