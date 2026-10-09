import {expect, it, vi} from 'vitest';
import {inspectVideoTextInputs, resolveFlowSpec} from '../../src/features/workspace/cloud-video-input';
import {createCloudCanvasModel} from '../../src/features/workspace/cloud-canvas-model';
import type {Graph} from '../../src/domain/graph';
import type {WorkspaceClient} from '../../src/infrastructure/api/workspace-client';

const base = {projectId: '11111111-1111-4111-8111-111111111111', revision: 1, viewport: {x: 0, y: 0, scale: 1}};
const text = (id: string, textBody: string) => ({id, type: 'text' as const, title: '文字' + id, x: 0, y: 0, locked: false, data: {kind: 'text' as const, text: textBody, referenceTokens: []}});
const video = (id: string) => ({id, type: 'video-generation' as const, title: '视频' + id, x: 400, y: 0, locked: false, data: {kind: 'video-generation' as const, draft: {modelId: 'seedance'}, inputBindings: [], stale: true}});

it('reads only the text edges that point at the target video', () => {
 const otherVideo = video('video-other');
 const graph = {...base, nodes: [text('t1', '正文一'), text('t2', '旁边文字'), video('v1'), otherVideo], edges: [{id: 'e1', sourceId: 't1', targetId: 'v1', port: 'text' as const, order: 0}, {id: 'e2', sourceId: 't2', targetId: 'video-other', port: 'text' as const, order: 0}]} as Graph;
 const checked = inspectVideoTextInputs(graph, 'v1');
 expect(checked.sources.map((s) => s.nodeId)).toEqual(['t1']);
 expect(checked.missing).toBe(false);
});

it('reports missing when the text is empty and ignores relation edges', () => {
 const graph = {...base, nodes: [text('t1', '   '), video('v1')], edges: [{id: 'e1', sourceId: 't1', targetId: 'v1', port: 'text' as const, order: 0}, {id: 'e2', sourceId: 't1', targetId: 'v1', port: 'video' as const, order: 1, relation: 'result' as const}]} as Graph;
 // relation 边不计入；唯一非关系输入为空则判缺失
 const checked = inspectVideoTextInputs(graph, 'v1');
 expect(checked.sources).toHaveLength(1);
 expect(checked.missing).toBe(true);
});

it('keeps multiple targets independent', () => {
 const graph = {...base, nodes: [text('shared', '共享正文'), video('v1'), video('v2')], edges: [{id: 'e1', sourceId: 'shared', targetId: 'v1', port: 'text' as const, order: 0}]} as Graph;
 expect(inspectVideoTextInputs(graph, 'v1').missing).toBe(false);
 expect(inspectVideoTextInputs(graph, 'v2').missing).toBe(true);
 expect(inspectVideoTextInputs(graph, 'v2').sources).toEqual([]);
});

it('does not silently copy a neighboring draft or the catalog first item when the writing request differs', () => {
 // 已有草稿 5秒/16:9，目录首项 5秒/16:9，写作请求 15秒/9:16：必须要求用户明确选择，不能直接就绪
 const capability = {model: 'seedance', videoSpecs: [{modelId: 'seedance', durationSeconds: 5, ratio: '16:9', resolution: '480p'}, {modelId: 'seedance', durationSeconds: 15, ratio: '9:16', resolution: '720p'}]};
 const resolved = resolveFlowSpec({requested: {durationSeconds: 15, ratio: '9:16'}, suggested: {}, capability});
 expect(resolved.kind).toBe('ready');
 if (resolved.kind !== 'ready') throw new Error('expected ready');
 expect(resolved.spec).toMatchObject({durationSeconds: 15, ratio: '9:16'});
 // 若目录首项与请求不一致且无匹配：不回退首项，要求选择
 const mismatch = resolveFlowSpec({requested: {durationSeconds: 15, ratio: '9:16'}, suggested: {}, capability: {model: 'seedance', videoSpecs: [{modelId: 'seedance', durationSeconds: 5, ratio: '16:9'}]}});
 expect(mismatch.kind).toBe('need_selection');
 if (mismatch.kind !== 'need_selection') throw new Error('expected need_selection');
 expect(mismatch.options).toHaveLength(1);
 expect(mismatch.reason).toContain('15');
});

it('requires an explicit choice when capability cannot be read instead of guessing seedance defaults', () => {
 const resolved = resolveFlowSpec({requested: {durationSeconds: 15, ratio: '9:16'}, suggested: {}, capability: undefined});
 expect(resolved.kind).toBe('capability_unavailable');
});

it('retains staged operations when the cloud save conflicts and requires explicit discard before reload', async () => {
 const project = {id: '11111111-1111-4111-8111-111111111111', schemaVersion: 1 as const, title: '云端', description: '', tags: [], revision: 0, createdAt: 1, updatedAt: 1, archived: false, trashedAt: null};
 const graph = {projectId: project.id, revision: 0, nodes: [], edges: [], viewport: {x: 0, y: 0, scale: 1}};
 const snapshot = {project, graph, history: {undoDepth: 0, redoDepth: 0}};
 const api = {readWorkspace: vi.fn(async () => structuredClone(snapshot)), command: vi.fn<WorkspaceClient['command']>(async () => {throw Object.assign(new Error('conflict'), {code: 'REVISION_CONFLICT'});})};
 const model = createCloudCanvasModel(project.id, api);
 await model.load();
 // 保存冲突后状态为failed、pending保留：调用方据此判断应用失败并保留输入
 const node = {id: 'node', type: 'text' as const, title: '文字', x: 0, y: 0, locked: false, data: {kind: 'text' as const, text: '不丢失的输入', referenceTokens: []}};
 model.stage([{id: 'op', type: 'add_node' as const, payload: {node}}]);
 await model.save();
 expect(model.getState()).toMatchObject({status: 'failed', pending: [{type: 'add_node'}]});
 model.dispose();
});
