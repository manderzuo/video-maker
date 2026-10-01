import {useState} from 'react';
import {getFeatureAvailability,type FeatureId} from '../../app/feature-gates';
import type {CapabilityProfile} from '../../domain/connection';
import {Button} from '../../ui/Button';
import {Dialog} from '../../ui/Dialog';
const labels:Record<FeatureId,string>={'image-generation':'图片生成','image-editing':'参考图编辑','audio-generation':'音频生成','video-cancel':'远端取消任务','webdav-backup':'WebDAV 版本化备份','prompt-image-draft':'本地图片提示词草稿','video-stitching':'视频拼接与时间线剪辑'};
export function UnavailableCapability({id,caps}:{id:FeatureId;caps:CapabilityProfile}){const [open,setOpen]=useState(false),availability=getFeatureAvailability(id,caps),title=labels[id];return <section className="card"><h3>{'条件未满足 · '+title}</h3><p>{availability.reason}</p><Button onClick={()=>setOpen(true)}>{'查看'+title+'开放条件'}</Button><Dialog open={open} title={title+'开放条件'} onClose={()=>setOpen(false)} footer={<Button onClick={()=>setOpen(false)}>关闭说明</Button>}><p>条件未满足。以下全部条件完成前不开放执行；本次只提供说明和门控检查。</p><p>{availability.reason}</p><ul>{availability.requirements.map(r=><li key={r}>{r}</li>)}</ul><p>{id==='video-cancel'?'停止查询不等于取消生成，更不等于退款。':id==='webdav-backup'?'版本化手动备份不代表多人实时协作。失败保留本地项目，恢复默认另存新项目。':'已有本地素材导入、预览和提示词整理保持可用；草稿、应用提示词或接受提案均不构成收费授权。'}</p></Dialog></section>;}
