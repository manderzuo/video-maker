import {useEffect,useState} from 'react';
import {createWorkspaceClient,type WorkspaceClient} from '../../infrastructure/api/workspace-client';
import {sessionStore} from '../../infrastructure/api/session';
import {CloudProjectsPage} from './CloudProjectsPage';
import {CloudAssetsPage} from './CloudAssetsPage';
import {CloudCanvasPage} from './CloudCanvasPage';
import {CloudPromptsPage} from './CloudPromptsPage';
import {CloudPromptGeneratorPage} from './CloudPromptGeneratorPage';
import {CloudTasksPage} from './CloudTasksPage';
import './workspace.css';
export function CloudWorkspace({path}:{path:string}){
 const [client,setClient]=useState<WorkspaceClient>();
 useEffect(()=>{const created=createWorkspaceClient({getIdentity(){const state=sessionStore.getState();return state.status==='authenticated'?{userId:state.session.user.id,contextId:state.session.contextId,csrfToken:state.session.csrfToken}:null;},subscribe:sessionStore.subscribe,refresh:sessionStore.refresh});setClient(created);return()=>created.dispose();},[]);
 if(!client)return <p>正在打开云端工作区…</p>;
 const canvas=/^\/projects\/([a-f0-9-]{36})\/canvas$/.exec(path);
 return canvas?<CloudCanvasPage key={canvas[1]} client={client} projectId={canvas[1]}/>:path==='/assets'?<CloudAssetsPage client={client}/>:path==='/prompts'?<CloudPromptsPage client={client}/>:path==='/tasks'?<CloudTasksPage client={client}/>:path.startsWith('/prompt-generator')?<CloudPromptGeneratorPage client={client}/>:path==='/trash'?<><CloudProjectsPage client={client} trashed/><CloudAssetsPage client={client} trashed/><CloudPromptsPage client={client} trashed/><CloudPromptGeneratorPage client={client} trashed/></>:<CloudProjectsPage client={client}/>;
}
