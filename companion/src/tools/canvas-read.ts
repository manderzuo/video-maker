import type {AgentSession} from '../../../src/domain/agent-session';
import type {CanvasToolBridge,ToolResult} from '../mcp';
export async function readCanvasTool(name:'canvas_get_state'|'canvas_get_selection',session:AgentSession,bridge:CanvasToolBridge):Promise<ToolResult>{return {status:'ok',data:await(name==='canvas_get_state'?bridge.readState(session):bridge.readSelection(session))};}
