import {createRoot} from 'react-dom/client';
import {useRef,useState} from 'react';
import {Button} from '../../src/ui/Button';
import {Toast} from '../../src/ui/Toast';
import '../../src/ui/tokens.css';
function Fixture(){
 const [calls,setCalls]=useState(0),[success,setSuccess]=useState(true),finish=useRef<(()=>void)|null>(null);
 return <main className="page-content"><h1>通用控件技术验收</h1><p>本地控件测试，不调用模型。</p><output aria-label="操作次数">{calls}</output><div className="actions"><Button onClick={async()=>{setCalls(value=>value+1);await new Promise<void>(resolve=>{finish.current=resolve;});}}>开始本地异步操作</Button><Button onClick={()=>finish.current?.()}>完成操作</Button></div><Button disabled disabledReason="当前服务能力未验证">受控操作</Button>{success?<Toast onClose={()=>setSuccess(false)}>保存成功</Toast>:null}<Toast kind="error">本次修改尚未保存，请重试或导出草稿。</Toast></main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
