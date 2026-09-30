export type PollResult={ok:boolean;retryAfterMs?:number;hidden?:boolean;random?:()=>number};
export function parseRetryAfter(value:string|undefined,now=Date.now()):number|undefined{
 if(!value||!Number.isFinite(now))return undefined;const text=value.trim();
 if(/^\d+(?:\.\d+)?$/.test(text)){const seconds=Number(text);return Number.isFinite(seconds)?Math.min(seconds*1000,86400000):undefined;}
 if(!/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(text))return undefined;
 const at=Date.parse(text);return Number.isFinite(at)?Math.min(Math.max(0,at-now),86400000):undefined;
}
export function nextPollDelay(result:PollResult,attempt:number){
 if(result.retryAfterMs!==undefined&&Number.isFinite(result.retryAfterMs)&&result.retryAfterMs>=0)return Math.max(result.hidden?15000:0,Math.min(result.retryAfterMs,86400000));
 const index=Number.isSafeInteger(attempt)&&attempt>=0?Math.min(attempt,4):0,base=result.ok?3000:Math.min(2000*2**index,30000),random=Math.max(0,Math.min(1,(result.random??Math.random)()));
 const delay=result.ok?base:Math.min(30000,Math.round(base*(.85+random*.3)));return Math.max(result.hidden?15000:0,delay);
}
