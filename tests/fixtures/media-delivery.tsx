import {createRoot} from 'react-dom/client';
import {f} from '../helpers/fixtures';
import {openStudioDb,transact} from '../../src/infrastructure/storage/database';
import {connectGeneration} from './generation';
import {RunMediaActions} from '../../src/features/review/RunMediaActions';
import '../../src/ui/tokens.css';
const {binding}=connectGeneration(),run=f.run({id:'media-original-run',executionState:'succeeded',taskId:'mock-core-1',coreRequestId:'operation-original-1',authBindingId:binding.id});
const db=await openStudioDb();try{await transact(db,db.tables.slice(),'readwrite',tx=>{for(const table of db.tables)tx.objectStore(table).clear();tx.objectStore('projects').put(f.project());tx.objectStore('runs').put(run);});}finally{db.close();}
const root=createRoot(document.getElementById('root')!);root.render(<main className="page-content"><h1>原任务媒体交付</h1><p>原创本地回环视频样本，账务信息未提供。</p><RunMediaActions run={run}/></main>);
export function unmountMediaFixture(){root.unmount();}
