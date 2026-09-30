import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, relative, isAbsolute } from 'node:path';
const root=process.cwd();
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png'};
const server=createServer(async(req,res)=>{
 try {
  const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
  const path=resolve(root,'.'+(pathname==='/'?'/docs/design/visual-review.html':pathname));
  const rel=relative(root,path);
  if(isAbsolute(rel)||rel.startsWith('..')||!rel.replaceAll('\\','/').startsWith('docs/design/')){res.writeHead(403);res.end('Document review only');return;}
  const bytes=await readFile(path);res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','Cache-Control':'no-store'});res.end(bytes);
 }catch{res.writeHead(404);res.end('Review document not found');}
});
server.listen(4178,'127.0.0.1',()=>console.log('Document review: http://127.0.0.1:4178/docs/design/visual-review.html'));
