import {useState} from 'react';
import {Button} from '../../ui/Button';
import {TaskRecords} from './TasksPage';
export function TaskDrawer({projectId}:{projectId:string}){const [open,setOpen]=useState(false);return <section className="task-drawer" aria-label="当前项目任务记录"><Button data-interaction-id="ui:TaskDrawer:Button:b1aa94ad27b0" aria-expanded={open} onClick={()=>setOpen(!open)}>{open?'收起任务记录':'展开任务记录'}</Button>{open?<div className="task-drawer-content"><TaskRecords projectId={projectId}/></div>:null}</section>;}
