import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { addNavigationGuard, LocalLink } from '../../app/routes';
import { sessionStore } from '../../infrastructure/api/session';
import { workspaceMessage, type WorkspaceClient } from '../../infrastructure/api/workspace-client';
import { type Graph, type CanvasNode, type Viewport } from '../../domain/graph';
import { localText } from '../../domain/common';
import { nodeBounds, nodeRect, nodeSize, visibleNodes, worldPosition, projectedNode } from '../canvas/geometry';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { createMobileGesture } from './mobile-canvas-gestures';
import { initialMobileViewport, mobileViewportSchema } from './mobile-canvas-viewport';
import { MobileNodeMedia } from './MobileNodeMedia';
export function MobileCanvasPage({ client, projectId }: {
    client: WorkspaceClient;
    projectId: string;
}) {
    const [graph, setGraph] = useState<Graph>(), [view, setView] = useState<Viewport>({ x: 0, y: 0, scale: 1 }), [error, setError] = useState(''), [list, setList] = useState(false), [minimap, setMinimap] = useState(true), [editor, setEditor] = useState<{
        node: Extract<CanvasNode, {
            type: 'text';
        }>;
        text: string;
        revision: number;
    }>(), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
    const [extent, setExtent] = useState({ width: 0, height: 0 }), [viewReady, setViewReady] = useState(false), remembered = useRef<Viewport | undefined>(undefined);
    const [selectedId, setSelectedId] = useState<string>(), [preview, setPreview] = useState(false);
    const [mediaRetries, setMediaRetries] = useState<Record<string, number>>({});
    const alive = useRef(true), stage = useRef<HTMLDivElement>(null), gesture = useRef(createMobileGesture()), viewRef = useRef(view), tap = useRef<{
        x: number;
        y: number;
        nodeId?: string;
        moved: boolean;
    } | undefined>(undefined), working = useRef(false), pending = useRef<{
        revision: number;
        key: string;
        nodeId: string;
        text: string;
        data: Extract<CanvasNode, {
            type: 'text';
        }>['data'];
    } | undefined>(undefined), mapDragging = useRef<number | undefined>(undefined);
    viewRef.current = view;
    const [context] = useState(() => { const identity = sessionStore.getState(); return identity.status === 'authenticated' ? identity.session.contextId : 'anonymous'; }), storageKey = 'aiwork:mobile-view:' + context + ':' + projectId;
    useEffect(() => { alive.current = true; void client.readGraph(projectId).then(value => { if (!alive.current)
        return; setGraph(value); setSelectedId(undefined); setPreview(false); remembered.current = undefined; try {
        const raw = sessionStorage.getItem(storageKey);
        if (raw) {
            const parsed = mobileViewportSchema.safeParse(JSON.parse(raw));
            if (parsed.success)
                remembered.current = parsed.data;
        }
    }
    catch { /* Local view is optional. */ } setViewReady(false); }).catch(failure => { if (alive.current)
        setError(workspaceMessage(failure)); }); return () => { alive.current = false; gesture.current.cancel(); }; }, [client, projectId, storageKey]);
    useEffect(() => {
        const element = stage.current;
        if (!element) return;
        const measure = () => setExtent(current => { const width = element.clientWidth, height = element.clientHeight; return width === current.width && height === current.height ? current : { width, height }; });
        measure();
        const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
        observer?.observe(element);
        window.addEventListener('resize', measure);
        return () => { observer?.disconnect(); window.removeEventListener('resize', measure); gesture.current.cancel(); tap.current = undefined; };
    }, [list]);
    useEffect(() => {
        if (!graph || viewReady || !stage.current) return;
        const next = initialMobileViewport(visibleNodes(graph).map(node => nodeRect(node, graph)), stage.current.clientWidth, stage.current.clientHeight, remembered.current);
        if (next) { viewRef.current = next; setView(next); setViewReady(true); }
    }, [graph, list, extent, viewReady]);
    useEffect(() => { if (!graph || !viewReady)
        return; try {
        sessionStorage.setItem(storageKey, JSON.stringify(view));
    }
    catch { /* Storage is optional. */ } }, [storageKey, view, graph, viewReady]);
    const dirty = !!editor && editor.text !== editor.node.data.text;
    useEffect(() => { const remove = addNavigationGuard(() => { if (!dirty && !pending.current && !working.current)
        return true; setError('节点正文尚未保存，请保存或明确放弃后离开。'); return false; }); const unload = (event: BeforeUnloadEvent) => { if (dirty || pending.current || working.current) {
        event.preventDefault();
        event.returnValue = '';
    } }; window.addEventListener('beforeunload', unload); return () => { remove(); window.removeEventListener('beforeunload', unload); }; }, [dirty]);
    useEffect(() => { const cancel = () => { gesture.current.cancel(); tap.current = undefined; }; window.addEventListener('resize', cancel); return () => window.removeEventListener('resize', cancel); }, []);
    const point = (event: ReactPointerEvent) => { const box = stage.current!.getBoundingClientRect(); return { x: event.clientX - box.left, y: event.clientY - box.top }; };
    function start(event: ReactPointerEvent<HTMLDivElement>) { if (!graph || !viewReady || event.button !== 0 && event.pointerType !== 'touch')
        return; const p = point(event), target = (event.target as HTMLElement).closest<HTMLElement>('[data-mobile-node-id]'); if (!tap.current)
        tap.current = { ...p, nodeId: target?.dataset.mobileNodeId, moved: false };
    else
        tap.current.moved = true; gesture.current.down(event.pointerId, p, viewRef.current); event.currentTarget.setPointerCapture(event.pointerId); }
    function move(event: ReactPointerEvent<HTMLDivElement>) { const p = point(event), next = gesture.current.move(event.pointerId, p); if (next) {
        if (tap.current && Math.hypot(p.x - tap.current.x, p.y - tap.current.y) > 8)
            tap.current.moved = true;
        setView(next);
    } }
    function selectNode(id?: string) { setSelectedId(id); setPreview(false); setError(''); setMessage(''); }
    function editNode(id: string) { const node = graph?.nodes.find(value => value.id === id); selectNode(id); pending.current = undefined; if (node?.type === 'text')
        setEditor({ node, text: node.data.text, revision: graph!.revision }); }
    function end(event: ReactPointerEvent<HTMLDivElement>) { gesture.current.up(event.pointerId); if (event.type === 'pointerup' && tap.current && !tap.current.moved)
        selectNode(tap.current.nodeId); tap.current = undefined; if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId); }
    async function save() { if (!editor || working.current || editor.node.locked)
        return; if (!localText.safeParse(editor.text).success) {
        setError('正文超过64KiB，请缩短后保存，输入已保留。');
        return;
    } working.current = true; setBusy(true); setError(''); const request = pending.current ?? { revision: editor.revision, key: crypto.randomUUID(), nodeId: editor.node.id, text: editor.text, data: { ...editor.node.data, text: editor.text } }; pending.current = request; try {
        const result = await client.command(projectId, request.revision, { type: 'operations', operations: [{ id: request.key, type: 'update_node', payload: { nodeId: request.nodeId, patch: { data: request.data } } }] }, request.key);
        if (alive.current) {
            setGraph(result.graph);
            setEditor(undefined);
            setMessage('正文已保存');
            pending.current = undefined;
        }
    }
    catch (failure) {
        if (alive.current)
            setError(workspaceMessage(failure) + '；输入已保留，可用同一请求重试。');
    }
    finally {
        working.current = false;
        if (alive.current)
            setBusy(false);
    } }
    const nodes = graph ? visibleNodes(graph) : [], selected = nodes.find(node => node.id === selectedId), selectedAsset = selected?.type === 'asset' || selected?.type === 'result' ? selected.data.assetId : undefined;
    const bounds = graph && nodes.length ? nodeBounds(nodes, graph) : { left: 0, top: 0, right: 1000, bottom: 600 }, mapWidth = 160, mapHeight = 100, mapScale = Math.min(mapWidth / Math.max(1, bounds.right - bounds.left), mapHeight / Math.max(1, bounds.bottom - bounds.top));
    const wires = graph?.edges.flatMap(edge => { const originalSource = graph.nodes.find(node => node.id === edge.sourceId), originalTarget = graph.nodes.find(node => node.id === edge.targetId); if (!originalSource || !originalTarget)
        return []; const source = projectedNode(originalSource, graph), target = projectedNode(originalTarget, graph); if (source.id === target.id)
        return []; const from = worldPosition(source, graph), to = worldPosition(target, graph), fromSize = nodeSize(source, graph), toSize = nodeSize(target, graph), x1 = from.x + fromSize.width, y1 = from.y + fromSize.height / 2, x2 = to.x, y2 = to.y + toSize.height / 2, bend = Math.max(60, Math.abs(x2 - x1) / 2); return [{ id: edge.id, path: `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}` }]; }) ?? [];
    function mapMove(event: ReactPointerEvent<SVGSVGElement>) { if (mapDragging.current !== event.pointerId)
        return; const box = event.currentTarget.getBoundingClientRect(), x = bounds.left + (event.clientX - box.left) / mapScale, y = bounds.top + (event.clientY - box.top) / mapScale; if (stage.current)
        setView(current => ({ ...current, x: stage.current!.clientWidth / 2 - x * current.scale, y: stage.current!.clientHeight / 2 - y * current.scale })); }
    return <section className="card"><h1>手机画布</h1><div className="actions"><LocalLink className="button" href={'/m/projects/' + projectId + '/video'}>视频创作</LocalLink><Button onClick={() => setList(value => !value)}>节点列表</Button><Button disabled={!graph} onClick={() => { remembered.current = undefined; gesture.current.cancel(); tap.current = undefined; setList(false); setViewReady(false); }}>适应画布</Button><Button onClick={() => setMinimap(value => !value)}>{minimap ? '收起小地图' : '显示小地图'}</Button></div>{error ? <p role="alert">{error}</p> : null}{message ? <p role="status">{message}</p> : null}<p className="muted">单指平移，双指缩放；轻点节点选中，再编辑正文或查看素材。</p>
 {selected ? <section className="mobile-node-selection" aria-label="已选中节点"><strong>已选中：{selected.title}</strong><div className="actions">
    {selected.type === 'text' ? <Button onClick={() => editNode(selected.id)}>编辑正文</Button> : null}
    {selectedAsset ? <Button onClick={() => setPreview(true)}>查看素材</Button> : null}
    {selected.type === 'video-generation' ? <LocalLink className="button" href={'/m/projects/' + projectId + '/video?node=' + encodeURIComponent(selected.id)}>编辑视频草稿</LocalLink> : null}
    {selected.type === 'result' ? <LocalLink className="button" href={'/m/projects/' + projectId + '/results'}>查看视频结果</LocalLink> : null}
    {selected.type === 'group' ? <span>分组包含 {selected.data.childIds.length} 个节点</span> : null}
    <Button onClick={() => selectNode()}>取消选中</Button></div></section> : null}
 {list ? <div className="mobile-node-list">{nodes.map(node => <Button key={node.id} aria-pressed={node.id === selectedId} onClick={() => node.type === 'text' ? editNode(node.id) : selectNode(node.id)}>{(node.type === 'text' ? '编辑' : '选中') + node.title}</Button>)}</div> : <div ref={stage} className="mobile-canvas-stage" onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={event => { gesture.current.cancel(); end(event); }}><div className="mobile-canvas-world" style={{ transform: `translate(${view.x}px,${view.y}px) scale(${view.scale})` }}><svg className="mobile-canvas-wires" width="1" height="1" aria-hidden="true">{wires.map(wire => <path key={wire.id} className="mobile-canvas-wire" d={wire.path} fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke"/>)}</svg>{graph ? nodes.map(node => { const p = worldPosition(node, graph), size = nodeSize(node, graph); return <div key={node.id} className="mobile-node-card" data-mobile-node-id={node.id} role="button" tabIndex={0} aria-label={'选中' + node.title} aria-pressed={node.id === selectedId} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectNode(node.id); } }} style={{ left: p.x, top: p.y, width: size.width, height: size.height }}><strong>{node.title}</strong>{node.type === 'asset' || node.type === 'result' ? <MobileNodeMedia key={node.data.assetId + ":" + (mediaRetries[node.data.assetId] ?? 0)} client={client} assetId={node.data.assetId}/> : <p>{node.type === 'text' ? node.data.text : node.type === 'video-generation' ? '视频草稿' : '节点分组'}</p>}</div>; }) : <p>正在加载画布…</p>}</div>{minimap ? <svg className="mobile-minimap" aria-label="手机画布小地图" width={mapWidth} height={mapHeight} onPointerDown={event => { event.stopPropagation(); mapDragging.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId); mapMove(event); }} onPointerMove={event => { event.stopPropagation(); mapMove(event); }} onPointerUp={event => { event.stopPropagation(); mapDragging.current = undefined; if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={event => { event.stopPropagation(); mapDragging.current = undefined; }}>{graph ? nodes.map(node => { const p = worldPosition(node, graph), size = nodeSize(node, graph); return <rect key={node.id} x={(p.x - bounds.left) * mapScale} y={(p.y - bounds.top) * mapScale} width={size.width * mapScale} height={size.height * mapScale} fill="var(--accent)" opacity=".55"/>; }) : null}<rect x={(-view.x / view.scale - bounds.left) * mapScale} y={(-view.y / view.scale - bounds.top) * mapScale} width={(stage.current?.clientWidth ?? 390) / view.scale * mapScale} height={(stage.current?.clientHeight ?? 400) / view.scale * mapScale} fill="none" stroke="var(--text)"/></svg> : null}</div>}
 <Dialog open={preview && !!selectedAsset} title="节点素材预览" onClose={() => setPreview(false)}>{preview && selectedAsset ? <MobileNodeMedia key={selectedAsset} client={client} assetId={selectedAsset} interactive onRetry={() => setMediaRetries(current => ({ ...current, [selectedAsset]: (current[selectedAsset] ?? 0) + 1 }))}/> : null}</Dialog>
 <Dialog open={!!editor} title="编辑节点正文" dismissible={!busy} onClose={() => { if (dirty || pending.current)
        setError('请先保存或点击放弃编辑。');
    else
        setEditor(undefined); }} footer={<><Button disabled={busy} onClick={() => { pending.current = undefined; setEditor(undefined); setError(''); }}>放弃编辑</Button><Button variant="primary" busy={busy} disabled={editor?.node.locked} onClick={() => void save()}>保存节点正文</Button></>}>{editor ? <><label>节点正文<textarea aria-label="节点正文" value={editor.text} readOnly={editor.node.locked || !!pending.current} onChange={event => setEditor({ ...editor, text: event.target.value })}/></label>{error ? <p role="alert">{error}</p> : null}{pending.current ? <p>本次请求已固定；重试会提交同一正文。</p> : null}</> : null}</Dialog></section>;
}
