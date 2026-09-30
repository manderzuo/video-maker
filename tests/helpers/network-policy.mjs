export function isAllowedTestUrl(raw, origin){
 try {
  const allowed=new URL(origin), url=new URL(raw);
  if(!['127.0.0.1','localhost','[::1]'].includes(allowed.hostname))return false;
  if(url.protocol==='ws:')url.protocol='http:';
  return url.origin===allowed.origin && ['http:','https:','blob:'].includes(url.protocol);
 }catch{return false;}
}
