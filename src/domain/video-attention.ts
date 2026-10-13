import {z} from 'zod';
export const videoAttentionCodeSchema=z.literal('budget_continuation_requires_attention');
export const videoAttentionLabel='后续处理需要人工检查';
export const videoAttentionMessage='后续处理需要人工检查，请联系执行网关管理员处理。辅助步骤费用和预留仍按原账务核对。可重新查询原任务查看处理结果；查询不会重发生成。';
