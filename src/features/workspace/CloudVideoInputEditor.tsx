import {useState} from 'react';
import type {Graph} from '../../domain/graph';
import type {GraphOperation} from '../../application/commands/registry';
import {inspectVideoTextInputs, nextEdgeOrder} from './cloud-video-input';
import {Button} from '../../ui/Button';

export function CloudVideoInputEditor({
  graph,
  nodeId,
  canEdit,
  stage,
}: {
  graph: Graph;
  nodeId: string;
  canEdit: boolean;
  stage: (operations: GraphOperation[]) => boolean;
}) {
  const target = graph.nodes.find((n) => n.id === nodeId);
  const [pick, setPick] = useState('');
  const [text, setText] = useState('');
  if (!target || target.type !== 'video-generation') return null;
  const {sources, missing} = inspectVideoTextInputs(graph, nodeId);
  const candidates = graph.nodes.filter((n) => n.type === 'text' && !n.locked);
  const op = (type: GraphOperation['type'], payload: Record<string, unknown>): GraphOperation => ({
    id: crypto.randomUUID(),
    type,
    payload,
  });

  function connectExisting() {
    if (!pick) return;
    const applied = stage([
      op('add_edge', {
        edge: {
          id: crypto.randomUUID(),
          sourceId: pick,
          targetId: nodeId,
          port: 'text',
          order: nextEdgeOrder(graph, nodeId),
        },
      }),
    ]);
    if (applied) setPick('');
  }

  function createAndConnect() {
    const value = text.trim();
    const video = graph.nodes.find((n) => n.id === nodeId);
    if (!value || !video || video.type !== 'video-generation') return;
    const id = crypto.randomUUID();
    const applied = stage([
      op('add_node', {
        node: {
          id,
          type: 'text',
          title: value.slice(0, 60) || '文字',
          x: video.x - 380,
          y: video.y,
          locked: false,
          data: {kind: 'text', text: value, referenceTokens: []},
        },
      }),
      op('add_edge', {
        edge: {
          id: crypto.randomUUID(),
          sourceId: id,
          targetId: nodeId,
          port: 'text',
          order: nextEdgeOrder(graph, nodeId),
        },
      }),
    ]);
    if (applied) setText('');
  }

  if (!missing) return null;

  return (
    <div>
      <p role="alert">这个视频草稿还没有提示词</p>
      {sources.length > 0 && (
        <div>
          <p>已连接但正文为空，请先补正文或重新选择：</p>
          {sources.map((s) => (
            <p key={s.edgeId}>
              {s.title} · 正文为空
            </p>
          ))}
        </div>
      )}
      <label>
        选择文字节点
        <select
          aria-label={'为' + target.title + '选择文字节点'}
          data-interaction-id="cloud:video:pick-text"
          disabled={!canEdit || !candidates.length}
          value={pick}
          onChange={(e) => setPick(e.target.value)}
        >
          <option value="">请选择</option>
          {candidates.map((n) => (
            <option key={n.id} value={n.id}>
              {n.title || '未命名文字'}
              {n.type === 'text' && !n.data.text.trim() ? '（空）' : ''}
            </option>
          ))}
        </select>
      </label>
      <Button
        data-interaction-id="cloud:video:connect-text"
        disabled={!canEdit || !pick}
        onClick={connectExisting}
      >
        连接所选文字
      </Button>
      <label>
        填写提示词
        <textarea
          aria-label={'为' + target.title + '填写提示词'}
          data-interaction-id="cloud:video:new-text"
          disabled={!canEdit}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <Button
        data-interaction-id="cloud:video:save-text"
        disabled={!canEdit || !text.trim()}
        onClick={createAndConnect}
      >
        保存文字并连接
      </Button>
    </div>
  );
}
