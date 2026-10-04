export function isValidTextSessionId(value:unknown):value is string{return typeof value==='string'&&/^[-A-Za-z0-9._~]{1,128}$/.test(value);}
export function isOpenCodeGoTarget(origin:string){try{const url=new URL(origin);return url.protocol==='https:'&&url.hostname==='opencode.ai'&&url.pathname.replace(/\/$/,'').replace(/\/v1$/,'')==='/zen/go';}catch{return false;}}
