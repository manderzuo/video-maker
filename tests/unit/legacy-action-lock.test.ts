import {it,expect} from 'vitest';
import {f} from '../helpers/fixtures';
import {normalizeLegacyActionLock} from '../../src/features/prompt-generation/legacy-action-lock';

it('QA-020 preserves older action prohibitions without treating them as a no-cuts camera rule',()=>{
 const old=f.draft({lockedConstraints:[{id:'old-action',field:'noCuts',originalValue:'不得添加人物或改写品牌汉字',locked:true}]});
 const normalized=normalizeLegacyActionLock(old);
 expect(normalized.lockedConstraints).toEqual([{id:'old-action',field:'forbiddenAction',originalValue:'不得添加人物或改写品牌汉字',locked:true}]);
 expect(old.lockedConstraints[0].field).toBe('noCuts');
});

it('QA-020 retains genuine no-cuts camera constraints',()=>{
 const old=f.draft({lockedConstraints:[{id:'camera',field:'noCuts',originalValue:'不切镜或转场',locked:true}]});
 expect(normalizeLegacyActionLock(old)).toBe(old);
});
