import {expect,it} from 'vitest';
import {suggestDefaultVideoModel} from '../../src/features/settings/default-models';
import {defaultVideoDraft} from '../../src/features/settings/default-models';
import {defaultPreferences,savePreferences} from '../../src/features/settings/preferences-store';
import {f} from '../helpers/fixtures';

it('suggests the user-designated seedance only when this Core catalog actually lists it',()=>{
 expect(suggestDefaultVideoModel('https://api.gemstory.cn',['seedance'],'')).toBe('seedance');
 expect(suggestDefaultVideoModel('https://api.gemstory.cn',['other'],'')).toBeUndefined();
 expect(suggestDefaultVideoModel('https://other.example',['seedance'],'')).toBeUndefined();
 expect(suggestDefaultVideoModel('https://api.gemstory.cn',['seedance'],'chosen')).toBeUndefined();
});
it('a saved target model does not turn an unverified capability into a runnable draft',()=>{
 try{savePreferences({defaultVideoModel:'seedance'});expect(()=>defaultVideoDraft(f.unknownCaps())).toThrow('default_video_model_unavailable');}
 finally{savePreferences(defaultPreferences);}
});
