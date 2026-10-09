import type {Graph} from '../../domain/graph';
import type {VideoSpec} from '../../domain/common';

export type VideoTextSource = {nodeId: string; title: string; text: string; edgeId: string};

/**
 * 仅按实际指向该视频草稿的非关系文字输入读取。
 * 不读取旁边的任意文字，不推断标题，不跟随关系边（tail-frame/revision/result）。
 */
export function inspectVideoTextInputs(
  graph: Graph,
  nodeId: string,
): {sources: VideoTextSource[]; missing: boolean} {
  const target = graph.nodes.find((node) => node.id === nodeId);
  if (!target || target.type !== 'video-generation') return {sources: [], missing: true};
  const sources: VideoTextSource[] = [];
  const edges = graph.edges
    .filter((edge) => edge.targetId === nodeId && !edge.relation)
    .slice()
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  for (const edge of edges) {
    const source = graph.nodes.find((node) => node.id === edge.sourceId);
    if (!source || source.type !== 'text') continue;
    sources.push({nodeId: source.id, title: source.title, text: source.data.text, edgeId: edge.id});
  }
  const missing = sources.length === 0 || sources.every((source) => !source.text.trim());
  return {sources, missing};
}

export function nextEdgeOrder(graph: Graph, targetId: string): number {
  return Math.max(-1, ...graph.edges.filter((e) => e.targetId === targetId).map((e) => e.order)) + 1;
}

export type FlowSpecRequest = {durationSeconds?: number; ratio?: string};
export type FlowCapability = {model: string; videoSpecs: VideoSpec[]};
export type FlowSpecResolution =
  | {kind: 'ready'; spec: VideoSpec; warning?: string}
  | {kind: 'need_selection'; reason: string; options: VideoSpec[]; wanted: FlowSpecRequest}
  | {kind: 'capability_unavailable'; reason: string};

/**
 * Flow新建规格解析：以写作请求为准，不从旁边视频复制，不猜默认能力。
 * wanted = requested ?? suggested（逐字段）。capability缺失/失败一律返回unavailable，
 * 由调用方显示原因并让用户明确修改或重试，不静默回退seedance/5秒/16:9。
 */
export function resolveFlowSpec(args: {
  requested: FlowSpecRequest;
  suggested: FlowSpecRequest;
  capability?: FlowCapability;
  selected?: VideoSpec;
}): FlowSpecResolution {
  const {requested, suggested, capability, selected} = args;
  if (!capability) {
    return {kind: 'capability_unavailable', reason: '视频执行能力尚未读取成功，不能猜默认规格。请先检查API设置并重试，确认后再创建流程。'};
  }
  const options = capability.videoSpecs;
  if (selected) {
    const found = options.find((s) => JSON.stringify(s) === JSON.stringify(selected));
    if (!found) return {kind: 'need_selection', reason: '所选规格不在当前已核验规格中，请重新选择。', options, wanted: wantedOf(requested, suggested)};
    const wanted = wantedOf(requested, suggested);
    const mismatch =
      (wanted.durationSeconds !== undefined && wanted.durationSeconds !== selected.durationSeconds) ||
      (wanted.ratio !== undefined && wanted.ratio !== selected.ratio);
    return {
      kind: 'ready',
      spec: selected,
      ...(mismatch ? {warning: `写作请求${describeWanted(wanted)}与所选规格${describeSpec(selected)}不一致，将按所选规格创建；原请求保留在写作草稿与文字节点中，不静默替换。`} : {}),
    };
  }
  const wanted = wantedOf(requested, suggested);
  if (wanted.durationSeconds === undefined && wanted.ratio === undefined) {
    return {kind: 'need_selection', reason: '该写作输入未指定时长与画幅，请明确选择一个已核验规格。', options, wanted};
  }
  const matches = options.filter((s) =>
    (wanted.durationSeconds === undefined || s.durationSeconds === wanted.durationSeconds) &&
    (wanted.ratio === undefined || s.ratio === wanted.ratio),
  );
  if (matches.length === 1) return {kind: 'ready', spec: matches[0]};
  if (matches.length > 1) {
    return {kind: 'need_selection', reason: `写作请求${describeWanted(wanted)}对应多个已核验分辨率，请明确选择一个。`, options: matches, wanted};
  }
  return {kind: 'need_selection', reason: `写作请求${describeWanted(wanted)}在当前已核验规格中不支持，请明确选择一个可用规格；原请求不被改写。`, options, wanted};
}

function wantedOf(requested: FlowSpecRequest, suggested: FlowSpecRequest): FlowSpecRequest {
  return {
    ...(requested.durationSeconds ?? suggested.durationSeconds) !== undefined
      ? {durationSeconds: requested.durationSeconds ?? suggested.durationSeconds}
      : {},
    ...(requested.ratio ?? suggested.ratio) !== undefined ? {ratio: requested.ratio ?? suggested.ratio} : {},
  };
}

function describeWanted(wanted: FlowSpecRequest): string {
  const parts: string[] = [];
  if (wanted.durationSeconds !== undefined) parts.push(`${wanted.durationSeconds}秒`);
  if (wanted.ratio !== undefined) parts.push(wanted.ratio);
  return parts.length ? `（${parts.join(' / ')}）` : '（未指定）';
}

function describeSpec(spec: VideoSpec): string {
  return `（${spec.modelId} / ${spec.durationSeconds ?? '未指定'}秒 / ${spec.ratio ?? '未指定'}${spec.resolution ? ` / ${spec.resolution}` : ''}）`;
}
