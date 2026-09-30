import './storage.css';
import {importAssets} from '../../src/features/assets/import-service';
const files=document.querySelector<HTMLInputElement>('#files')!;
const status=document.querySelector<HTMLElement>('#status')!;
files.addEventListener('change',async()=>{
 files.disabled=true;status.textContent='正在本地导入';
 try{
  const report=await importAssets(Array.from(files.files??[]));
  status.textContent=report.errorCode??`成功 ${report.successes.length}，失败 ${report.failures.length}`;
  document.querySelector('#result')!.textContent=JSON.stringify(report,null,2);
 }catch{status.textContent='本地存储不可用';}
 finally{files.disabled=false;}
});
