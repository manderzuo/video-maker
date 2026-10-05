import {describe,it,expect} from 'vitest';
import {videoNumber} from '../../src/features/tasks/video-number';

describe('video display number',()=>{
 it('uses the original creation time in UTC+8 and keeps the input untouched',()=>{
  const run={id:'7f20363f-dedd-4ae0-9e60-ae0704171562',createdAt:Date.parse('2026-10-05T01:30:15Z')};
  const before=structuredClone(run);expect(videoNumber(run)).toBe('视频-20261005-093015-7F2036');expect(run).toEqual(before);
 });
 it('distinguishes records started in the same second and keeps a stable label on repeated reads',()=>{
  const run={id:'abcdef01-1234',createdAt:Date.parse('2026-12-31T16:00:00Z')};
  expect(videoNumber(run)).toBe('视频-20270101-000000-ABCDEF');
  expect(videoNumber({...run,id:'12345678-1234'})).not.toBe(videoNumber(run));
  expect(videoNumber(run)).toBe(videoNumber({...run}));
 });
 it('does not invent a current timestamp if a historical timestamp cannot be rendered',()=>{
  expect(videoNumber({id:'r1',createdAt:1e20})).toBe('视频-R1');
 });
});
