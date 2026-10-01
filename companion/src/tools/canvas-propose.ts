import type {AgentSession} from '../../../src/domain/agent-session';
import type {CanvasToolBridge,ToolResult} from '../mcp';
export async function proposeCanvasTool(name:'canvas_propose_ops'|'canvas_apply_proposal',input:unknown,session:AgentSession,bridge:CanvasToolBridge):Promise<ToolResult>{return {status:name==='canvas_propose_ops'?'proposed':'awaiting_browser_proposal_confirmation',data:await(name==='canvas_propose_ops'?bridge.propose(input,session):bridge.review(input,session))};}
