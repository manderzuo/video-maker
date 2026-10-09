import {useState} from 'react';
import {Button} from '../../ui/Button';
import {Dialog} from '../../ui/Dialog';
import {LocalLink} from '../../app/routes';
import {canvasLicense,promptLicense,zipLicense} from '../help/legal-notices';
export function CloudHelpPage(){
 const [licenses,setLicenses]=useState(false);
 return <section className="card" aria-label="帮助"><h1>帮助</h1><p data-interaction-id="cloud:help:scope">账号云端工作区：内容按账号隔离保存云端，刷新或换设备后恢复。这里没有自动反馈、遥测或默认外部渠道。</p><div className="actions"><Button data-interaction-id="cloud:help:licenses" onClick={()=>setLicenses(true)}>第三方许可与来源</Button><LocalLink data-interaction-id="cloud:help:recovery" href="/recovery">恢复中心</LocalLink><LocalLink data-interaction-id="cloud:help:connections" href="/settings/connections">API 设置</LocalLink></div><details open><summary>保存与修订</summary><p>画布修改先暂存，保存成功后云端修订才推进；另一设备已修改时会报修订冲突，本次输入保留，请重新加载后核对。清除浏览器数据不影响云端内容。</p></details><details><summary>授权与费用</summary><p>创建流程、应用提示词或接受提案不等于收费授权；文字优化和视频生成分别确认。切换连接不会改写旧任务的服务或授权绑定。</p></details><details><summary>未知提交与重试</summary><p>提交结果暂未确认时保留原身份和冻结请求，不自动换键或重发。执行、查询、交付、账务状态独立保存；停止查询不等于取消生成或退款。</p></details><details><summary>受控能力</summary><p>未核验的生成能力没有执行入口；未知节点只读隔离。素材仅在明确选择后导入；参考描述不表示文字模型已经看过视频。</p></details><Dialog title="第三方许可与来源" open={licenses} onClose={()=>setLicenses(false)} footer={<Button data-interaction-id="cloud:help:licenses-close" onClick={()=>setLicenses(false)}>关闭</Button>}><p>算法与规则来源依法保留许可和原权利声明，产品界面独立重组。</p><details><summary>画布逻辑许可</summary><pre>{canvasLicense}</pre></details><details><summary>视频提示词规则许可</summary><pre>{promptLicense}</pre></details><details><summary>压缩包许可</summary><pre>{zipLicense}</pre></details></Dialog></section>;
}
