import type {AgentSession} from '../../../src/domain/agent-session';
import type {CanvasToolBridge,ToolResult} from '../mcp';
export async function requestCanvasRun(input:unknown,session:AgentSession,bridge:CanvasToolBridge):Promise<ToolResult>{return {status:'awaiting_browser_confirmation',data:await bridge.requestRun(input,session)};}
