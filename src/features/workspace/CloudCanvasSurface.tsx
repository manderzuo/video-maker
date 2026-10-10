import {useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject} from 'react';
import type {CanvasNode, CanvasNodeSize, Graph, Viewport} from '../../domain/graph';
import type {Asset} from '../../domain/asset';
import type {CapabilityProfile} from '../../domain/connection';
import type {ResultSourceRun} from '../../domain/graph-validation';
import type {GraphOperation} from '../../application/commands/registry';
import {type WorkspaceClient} from '../../infrastructure/api/workspace-client';
import {isEditableTarget} from '../../ui/copy.zh-CN';
import {Button} from '../../ui/Button';
import {CloudAssetMedia} from './CloudAssetsPage';
import {nodeSize, visibleNodes, worldPosition} from '../canvas/geometry';
import {updateViewport} from '../canvas/viewport';
import {selectNodes} from '../canvas/selection';
import {
  CanvasEdges,
  ConnectionMenu,
  ConnectionPreview,
  NodePorts,
  useCanvasConnections,
} from '../canvas/CanvasConnections';
import {NodeResizeHandles} from '../canvas/NodeResizeHandles';
import {TextNode} from '../canvas/nodes/TextNode';
import {VideoNode} from '../canvas/nodes/VideoNode';
import {AssetNode} from '../canvas/nodes/AssetNode';
import {GroupNode} from '../canvas/nodes/GroupNode';
import type {NodeMenuHandle} from '../canvas/NodeMenu';
import {localText} from '../../domain/common';
import {sessionStore} from '../../infrastructure/api/session';

type Gesture =
  | {type: 'pan' | 'box'; startX: number; startY: number; lastX: number; lastY: number; view: Viewport; graph: Graph; shift: boolean}
  | {type: 'move'; startX: number; startY: number; lastX: number; lastY: number; view: Viewport; graph: Graph; ids: string[]};

export function CloudCanvasSurface({
  client,
  graph,
  selected,
  setSelected,
  canEdit,
  saved,
  assets,
  runs,
  capability,
  stageRef,
  tool,
  setTool,
  background,
  minimap,
  stageOps,
  commitOps,
  onViewport,
  onError,
  onSave,
  onSaveNodePrompt,
  onOpenNodeWriting,
  onUndo,
  onRedo,
  onFiles,
  fit,
  nodeMenu,onCreateFlow,onGenerate,onTextValidity,onResultAction,
}: {
  client: WorkspaceClient;
  graph: Graph;
  selected: string[];
  setSelected: (ids: string[]) => void;
  canEdit: boolean;
  saved: boolean;
  assets: Asset[];
  runs: ResultSourceRun[];
  capability: CapabilityProfile;
  stageRef: RefObject<HTMLDivElement | null>;
  tool: 'select' | 'pan';
  setTool: (tool: 'select' | 'pan') => void;
  background: string;
  minimap: boolean;
  stageOps: (operations: GraphOperation[]) => boolean;
  commitOps: (operations: GraphOperation[]) => Promise<boolean>;
  onViewport: (viewport: Viewport) => void;
  onError: (message: string) => void;
  onSave: () => void;
  onSaveNodePrompt: (nodeId: string) => void;
  onOpenNodeWriting: (nodeId: string, ai?:boolean) => void;
  onUndo: () => void;
  onRedo: () => void;
  onFiles: (files: File[]) => void;
  fit: (ids?: string[]) => void;
  nodeMenu: RefObject<NodeMenuHandle | null>;
  onResultAction: (node:Extract<CanvasNode,{type:'result'}>,action:'details'|'tail-frame'|'revision') => void;
  onCreateFlow: (nodeId:string) => void;
  onGenerate: (nodeId:string) => void;
  onTextValidity: (nodeId:string,valid:boolean) => void;
}) {
  const op = (type: GraphOperation['type'], payload: Record<string, unknown>): GraphOperation => ({
    id: crypto.randomUUID(),
    type,
    payload,
  });
  const gesture = useRef<Gesture | undefined>(undefined);
  const [box, setBox] = useState<{left: number; top: number; width: number; height: number}>();
  const [dragPreview, setDragPreview] = useState<Record<string, {dx: number; dy: number}>>({});
  const [resizing, setResizing] = useState<{nodeId: string; size: CanvasNodeSize} | null>(null);
  const view = graph.viewport;
  const identity=sessionStore.getState();
  const fontsKey=identity.status==='authenticated'?'aiwork:canvas-fonts:'+identity.session.user.id+':'+graph.projectId:undefined;
  const [fonts,setFonts]=useState<Record<string,number>>(()=>{try{return fontsKey?JSON.parse(localStorage.getItem(fontsKey)??'{}'):{};}catch{return {};}});
  const fontSize=(id:string)=>[12,14,16,20].includes(fonts[id])?fonts[id]:14;
  function changeFont(id:string,size:number){const next={...fonts,[id]:size};setFonts(next);try{if(fontsKey)localStorage.setItem(fontsKey,JSON.stringify(next));}catch{/* Presentation remains available in memory. */}}
  function updateData(nodeId:string,data:CanvasNode['data']){return stageOps([op('update_node',{nodeId,patch:{data}})]);}
  const references=assets.filter(asset=>!asset.trashedAt&&['image','video','audio'].includes(asset.mediaType)).map((asset,index)=>({assetId:asset.id,alias:'asset-'+(index+1),mediaType:asset.mediaType as 'image'|'video'|'audio',role:'reference',description:asset.title,available:true,unbound:false}));
  const canResize = canEdit && saved;
  const connections = useCanvasConnections({
    graph,
    selectedNodes: selected,
    view,
    assets,
    runs,
    capability,
    canWrite: canEdit,
    stage: stageRef,
    onCommand: commitOps,
    onError,
    onSelectNodes: setSelected,
  });

  function point(event: {clientX: number; clientY: number}) {
    const rect = stageRef.current!.getBoundingClientRect();
    return {x: event.clientX - rect.left, y: event.clientY - rect.top};
  }

  function deleteSelected() {
    if (!canEdit) return;
    if (connections.selectedEdgeId) {
      void connections.disconnect();
      return;
    }
    nodeMenu.current?.remove();
    return;
  }

  function keyboard(event: React.KeyboardEvent) {
    if (event.nativeEvent.isComposing || isEditableTarget(event.target) || document.querySelector('dialog[open]')) return;
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key.toLowerCase() === 's') {
      event.preventDefault();
      onSave();
      return;
    }
    if (event.key.toLowerCase() === 'v' && !mod) setTool('select');
    else if (event.key.toLowerCase() === 'h' && !mod) setTool('pan');
    else if (mod && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      setSelected(visibleNodes(graph).map((n) => n.id));
    } else if (mod && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) onRedo();
      else onUndo();
    } else if (mod && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      onRedo();
    } else if (mod && event.key.toLowerCase() === 'd') {
      event.preventDefault();
      if (selected.length && canEdit) nodeMenu.current?.duplicate();
    } else if (mod && event.key.toLowerCase() === 'c') {
      event.preventDefault();
      nodeMenu.current?.copy();
    } else if (mod && event.key.toLowerCase() === 'v' && !event.shiftKey) {
      if (nodeMenu.current?.paste()) event.preventDefault();
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      deleteSelected();
    } else if (event.key === 'Escape') {
      connections.cancel();
      connections.clearSelection();
      setSelected([]);
      setDragPreview({});
    }
  }

  function pointerStart(event: ReactPointerEvent<HTMLElement>, node?: CanvasNode) {
    if (graph && event.button === 1) {
      event.preventDefault();
      const p = point(event);
      gesture.current = {type:'pan',startX:p.x,startY:p.y,lastX:p.x,lastY:p.y,view,graph:structuredClone(graph),shift:false};
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    connections.clearSelection();
    if (connections.hasPending()) {
      connections.cancel();
      return;
    }
    if (!graph || event.button !== 0 || (event.target as HTMLElement).closest('button,input,textarea,select,a,video,audio')) return;
    let moveIds: string[] | undefined;
    if (node) {
      const already = selected.includes(node.id);
      if (event.shiftKey) {
        if (already) {
          // Shift 点击已选节点表示取消选择，不开始拖动。
          setSelected(selected.filter((id) => id !== node.id));
          return;
        }
        moveIds = [...selected, node.id];
        setSelected(moveIds);
      } else if (already) {
        // 点在已选节点上保留整组选择：连续拖动仍移动同一组，不暗中缩成单选。
        moveIds = selected;
      } else {
        moveIds = [node.id];
        setSelected(moveIds);
      }
      if (!canEdit || node.locked) return;
    } else if (tool !== 'pan') {
      if (!event.shiftKey) setSelected([]);
    }
    if (!canEdit && node) return;
    const p = point(event);
    if (tool === 'pan') {
      event.preventDefault();
      gesture.current = {type: 'pan', startX: p.x, startY: p.y, lastX: p.x, lastY: p.y, view, graph: structuredClone(graph), shift: event.shiftKey};
    } else if (node && canEdit && !node.locked) {
      gesture.current = {type: 'move', startX: p.x, startY: p.y, lastX: p.x, lastY: p.y, view, graph: structuredClone(graph), ids: moveIds ?? [node.id]};
    } else if (!node) {
      gesture.current = {type: 'box', startX: p.x, startY: p.y, lastX: p.x, lastY: p.y, view, graph: structuredClone(graph), shift: event.shiftKey};
    } else {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    stageRef.current?.focus({preventScroll: true});
  }

  function pointerMove(event: ReactPointerEvent<HTMLElement>) {
    const g = gesture.current;
    if (!g) return;
    const p = point(event);
    g.lastX = p.x;
    g.lastY = p.y;
    const dx = p.x - g.startX;
    const dy = p.y - g.startY;
    if (g.type === 'pan') {
      onViewport(updateViewport(g.view, {type: 'pan', dx, dy}));
    } else if (g.type === 'box') {
      setBox({left: Math.min(g.startX, p.x), top: Math.min(g.startY, p.y), width: Math.abs(dx), height: Math.abs(dy)});
    } else if (g.type === 'move') {
      const preview: Record<string, {dx: number; dy: number}> = {};
      for (const id of g.ids) preview[id] = {dx: dx / g.view.scale, dy: dy / g.view.scale};
      setDragPreview(preview);
    }
  }

  function pointerEnd(event: ReactPointerEvent<HTMLElement>) {
    const g = gesture.current;
    if (!g) return;
    gesture.current = undefined;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const dx = g.lastX - g.startX;
    const dy = g.lastY - g.startY;
    if (g.type === 'box') {
      setBox(undefined);
      setDragPreview({});
      const rect = {
        left: (Math.min(g.startX, g.lastX) - g.view.x) / g.view.scale,
        top: (Math.min(g.startY, g.lastY) - g.view.y) / g.view.scale,
        right: (Math.max(g.startX, g.lastX) - g.view.x) / g.view.scale,
        bottom: (Math.max(g.startY, g.lastY) - g.view.y) / g.view.scale,
      };
      const ids = selectNodes(g.graph, {type: 'rectangle', rect});
      setSelected(g.shift ? [...new Set([...selected, ...ids])] : ids);
    } else if (g.type === 'move') {
      setDragPreview({});
      if (!dx && !dy) return;
      const ops = g.ids
        .filter((id) => !g.graph.nodes.some((group) => group.type === 'group' && g.ids.includes(group.id) && group.data.childIds.includes(id)))
        .flatMap((id) => {
          const n = g.graph.nodes.find((n) => n.id === id);
          return n && !n.locked
            ? [{id: crypto.randomUUID(), type: 'move_node' as const, payload: {nodeId: id, x: n.x + dx / g.view.scale, y: n.y + dy / g.view.scale}}]
            : [];
        });
      if (ops.length) void commitOps(ops);
    } else {
      setDragPreview({});
    }
  }

  function startResize(nodeId: string) {
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!node || node.type === 'group' || node.locked || !canResize || resizing || document.querySelector('dialog[open]')) return undefined;
    connections.cancel();
    connections.clearSelection();
    return view.scale;
  }

  function finishResize(nodeId: string, size: CanvasNodeSize) {
    setResizing(null);
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const original = nodeSize(node, graph);
    if (size.width === original.width && size.height === original.height) return;
    void commitOps([{id: crypto.randomUUID(), type: 'update_node', payload: {nodeId, patch: {size}}}]);
  }

  function drop(event: React.DragEvent) {
    event.preventDefault();
    if (!canEdit) return;
    const files = Array.from(event.dataTransfer.files);
    if (files.length) onFiles(files);
  }

  function paste(event: React.ClipboardEvent) {
    if (isEditableTarget(event.target) && document.activeElement !== event.currentTarget) return;
    if (!canEdit) return;
    const files = Array.from(event.clipboardData.files);
    if (files.length) {
      event.preventDefault();
      onFiles(files);
      return;
    }
    const text = event.clipboardData.getData('text/plain');
    if (text.trim()) {
      event.preventDefault();
      const rect = stageRef.current?.getBoundingClientRect();
      const cx = rect ? (rect.width / 2 - view.x) / view.scale : 64;
      const cy = rect ? (rect.height / 2 - view.y) / view.scale : 64;
      const id = crypto.randomUUID();
      void commitOps([
        {
          id: crypto.randomUUID(),
          type: 'add_node',
          payload: {node: {id, type: 'text', title: text.trim().slice(0, 60) || '文字', x: cx, y: cy, locked: false, data: {kind: 'text', text, referenceTokens: []}}},
        },
      ]).then((ok) => {
        if (ok) setSelected([id]);
      });
    }
  }

  useEffect(() => {
    setDragPreview({});
    setResizing(null);
    setBox(undefined);
  }, [graph.revision]);

  return (
    <div
      ref={stageRef}
      className={'canvas-stage cloud-canvas-page-stage background-' + background + ' tool-' + tool}
      aria-label="云端画布"
      role="region"
      tabIndex={0}
      onContextMenu={event=>{event.preventDefault();const id=(event.target as HTMLElement).closest<HTMLElement>('[data-node-id]')?.dataset.nodeId;nodeMenu.current?.open(id?(selected.includes(id)?selected:[id]):selected);}}
      onPointerDown={(event) => void pointerStart(event)}
      onAuxClick={event=>{if(event.button===1)event.preventDefault();}}
      onPointerMove={pointerMove}
      onPointerUp={pointerEnd}
      onPointerCancel={() => {
        connections.cancel();
        gesture.current = undefined;
        setDragPreview({});
        setBox(undefined);
      }}
      onKeyDown={keyboard}
      onDrop={drop}
      onDragOver={(event) => event.preventDefault()}
      onPaste={paste}
      onWheel={(event) => {
        if (event.altKey) {
          event.preventDefault();
          onViewport({...view, scale: Math.max(0.25, Math.min(2, view.scale + (event.deltaY < 0 ? 0.1 : -0.1)))});
        }
      }}
    >
      <div className="canvas-world" style={{transform: `translate(${view.x}px,${view.y}px) scale(${view.scale})`, '--canvas-scale':view.scale} as CSSProperties}>
        <CanvasEdges graph={graph} connections={connections} />
        <ConnectionPreview graph={graph} connections={connections} />
        {visibleNodes(graph)
          .sort((a, b) => Number(b.type === 'group') - Number(a.type === 'group'))
          .map((node) => {
            const p = worldPosition(node, graph);
            const preview = resizing?.nodeId === node.id ? resizing.size : nodeSize(node, graph);
            const offset = dragPreview[node.id] ?? {dx: 0, dy: 0};
            const asset = node.type === 'asset' || node.type === 'result' ? assets.find((a) => a.id === node.data.assetId) : undefined;
            return (
              <article
                key={node.id}
                data-node-id={node.id}
                className={'canvas-node node-' + node.type + (selected.includes(node.id) ? ' selected' : '')}
                style={{left: p.x + offset.dx, top: p.y + offset.dy, width: preview.width, height: preview.height}}
              >
                <header
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    void pointerStart(event, node);
                  }}
                  onPointerMove={pointerMove}
                  onPointerUp={pointerEnd}
                >
                  {node.type === 'group' ? (
                    <>
                      <input
                        aria-label="分组标题"
                        data-interaction-id="cloud:canvas:group-title"
                        value={node.title}
                        disabled={!canEdit || node.locked}
                        onChange={(event) => {
                          if (event.target.value.trim())
                            stageOps([op('update_node', {nodeId: node.id, patch: {title: event.target.value}})]);
                        }}
                      />
                      <label>
                        镜头序号
                        <input
                          aria-label="镜头序号"
                          data-interaction-id="cloud:canvas:group-shot"
                          type="number"
                          min={1}
                          value={node.data.shotOrder ?? ''}
                          disabled={!canEdit || node.locked}
                          onChange={(event) => {
                            const shotOrder = Math.floor(Number(event.target.value));
                            if (Number.isSafeInteger(shotOrder) && shotOrder > 0)
                              void commitOps([{id: crypto.randomUUID(), type: 'update_node', payload: {nodeId: node.id, patch: {data: {...node.data, shotOrder}}}}]);
                          }}
                        />
                      </label>
                      <Button
                        data-interaction-id="cloud:canvas:ungroup"
                        disabled={!canEdit || node.locked}
                        onClick={() => void commitOps([op('ungroup', {nodeId: node.id})])}
                      >
                        解除分组
                      </Button>
                      <Button
                        data-interaction-id="cloud:canvas:collapse"
                        disabled={!canEdit || node.locked}
                        onClick={() => void commitOps([op('update_node', {nodeId: node.id, patch: {data: {...node.data, collapsed: !node.data.collapsed}}})])}
                      >
                        {node.data.collapsed ? '展开分组' : '折叠分组'}
                      </Button>
                      <Button
                        data-interaction-id="cloud:canvas:select"
                        onClick={() => setSelected(selected.includes(node.id) ? selected.filter((id) => id !== node.id) : [...selected, node.id])}
                      >
                        {selected.includes(node.id) ? '取消选中' : '选中节点'}
                      </Button>
                      <Button
                        data-interaction-id="cloud:canvas:lock"
                        disabled={!canEdit}
                        onClick={() => void commitOps([op('update_node', {nodeId: node.id, patch: {locked: !node.locked}})])}
                      >
                        {node.locked ? '解锁' : '锁定'}
                      </Button>
                    </>
                  ) : (
                    <>
                      {node.title}
                      {node.locked ? ' · 已锁定' : ''}
                    </>
                  )}
                </header>
                <NodePorts graph={graph} node={node} runs={runs} assets={assets} canWrite={canEdit} connections={connections} />
                {selected.includes(node.id) && canResize && !node.locked && node.type !== 'group' ? (
                  <NodeResizeHandles
                    title={node.title}
                    size={preview}
                    disabled={false}
                    onStart={() => startResize(node.id)}
                    onPreview={(size) => setResizing({nodeId: node.id, size})}
                    onFinish={(size) => finishResize(node.id, size)}
                    onCancel={() => setResizing(null)}
                  />
                ) : null}
                <div className="node-body">
                  {node.type !== 'group' ? (
                    <label>
                      节点标题
                      <input
                        aria-label="节点标题"
                        data-interaction-id="cloud:canvas:node-title"
                        value={node.title}
                        disabled={!canEdit || node.locked}
                        onChange={(event) => {
                          if (event.target.value.trim())
                            stageOps([op('update_node', {nodeId: node.id, patch: {title: event.target.value}})]);
                        }}
                      />
                    </label>
                  ) : null}
                  {node.type === 'text' ? <TextNode compact node={node} readonly={!canEdit||node.locked} interactionId="cloud:canvas:node-text" references={references} fontSize={fontSize(node.id)} onFontSize={size=>changeFont(node.id,size)} onDraft={data=>{const valid=localText.safeParse(data.text).success;onTextValidity(node.id,valid);if(valid)updateData(node.id,data);}} onChange={()=>{}} onSavePrompt={()=>onSaveNodePrompt(node.id)} onOptimize={()=>onOpenNodeWriting(node.id)} onAIOptimize={()=>onOpenNodeWriting(node.id,true)} canAI={capability.textModels.length>0} onCreateFlow={()=>onCreateFlow(node.id)}/>
                    : node.type==='video-generation'?<VideoNode compact node={node} graph={graph} assets={assets} capability={capability} readonly={!canEdit||node.locked} onChange={data=>updateData(node.id,data)} onCommand={ops=>void commitOps(ops)} onPreflight={()=>onGenerate(node.id)} onOptimize={()=>onOpenNodeWriting(node.id)} onAIOptimize={()=>onOpenNodeWriting(node.id,true)} canAI={capability.textModels.length>0}/>
                    : node.type==='asset'||node.type==='result'?<><AssetNode compact assetId={node.data.assetId} asset={asset} renderMedia={(media,thumbnail)=><CloudAssetMedia client={client} asset={media} preferOriginal={!thumbnail}/>}/>{node.type==='result'?<div className="node-actions"><Button data-interaction-id="restore:cloudcanvassurface:3" disabled={!canEdit} onClick={()=>onResultAction(node,'tail-frame')}> 尾帧续写</Button><Button data-interaction-id="restore:cloudcanvassurface:4" disabled={!canEdit} onClick={()=>onResultAction(node,'revision')}> 修改后重新生成</Button></div>:null}</>
                    : <GroupNode count={node.data.childIds.length} collapsed={node.data.collapsed}/>}

                </div>
              </article>
            );
          })}
      </div>
      <ConnectionMenu connections={connections} />
      {minimap ? (
        <svg className="canvas-minimap" aria-label="画布小地图" viewBox="0 0 2400 1600">
          {graph.nodes.map((n) => {
            const pt = worldPosition(n, graph);
            return <rect key={n.id} x={pt.x} y={pt.y} width={nodeSize(n, graph).width} height={nodeSize(n, graph).height} onClick={() => fit([n.id])} />;
          })}
        </svg>
      ) : null}
      {box ? (
        <div className="selection-box" style={{left: box.left, top: box.top, width: box.width, height: box.height}} aria-hidden="true" />
      ) : null}
    </div>
  );
}
