export function allowedCorePath(path:string,method='GET'){
 if(typeof path!=='string'||/[\\%?#\s\u0000-\u001f]/.test(path)||path.includes('//')||path.split('/').some(segment=>segment==='.'||segment==='..'))return false;
 if(method==='GET'&&['/health','/healthz','/v1/models'].includes(path))return true;
 if(method==='POST'&&['/v1/assets','/v1/chat/completions','/v1/videos/generations'].includes(path))return true;
 const identity='[A-Za-z0-9._~-]+';
 if(method==='GET'&&(new RegExp('^/v1/videos/'+identity+'(?:/content)?$').test(path)||new RegExp('^/v1/video-works/'+identity+'$').test(path)))return true;
 return method==='POST'&&(new RegExp('^/v1/video-works/'+identity+'/continue$').test(path)||new RegExp('^/v1/videos/'+identity+'/delivery$').test(path));
}
export function requiresCoreIdempotency(path:string){return path==='/v1/chat/completions'||path==='/v1/videos/generations'||/^\/v1\/video-works\//.test(path);}
