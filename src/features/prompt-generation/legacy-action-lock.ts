import type {PromptDraft} from '../../domain/prompt';

// Older forms stored every action prohibition as noCuts. Keep real camera locks,
// and reinterpret only values that have no cut or transition meaning.
const cameraCutRule=/切镜|转场|镜头切换|一镜到底|不剪辑/;
export function normalizeLegacyActionLock(draft:PromptDraft):PromptDraft{
 const locks=draft.lockedConstraints.map(lock=>lock.field==='noCuts'&&!cameraCutRule.test(lock.originalValue)
  ?{...lock,field:'forbiddenAction'}:lock);
 return locks.some((lock,index)=>lock!==draft.lockedConstraints[index])?{...draft,lockedConstraints:locks}:draft;
}
