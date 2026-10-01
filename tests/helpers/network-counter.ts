export type RequestRecord={url:string;method:string;blocked:boolean};
export class NetworkCounter {
 readonly requests:RequestRecord[]=[];
 record(url:string,method:string,blocked=false){this.requests.push({url,method,blocked});}
 get paidRequests(){return this.requests.filter(r=>r.method==='POST'&&(/\/(chat\/completions|videos\/generations)$/.test(new URL(r.url).pathname)||/\/video-works\/[^/]+\/(revise|continue)$/.test(new URL(r.url).pathname)));}
 get evidence(){return {coreWrites:this.requests.filter(r=>['POST','PUT','PATCH','DELETE'].includes(r.method)&&new URL(r.url).pathname.startsWith('/core-api/')).length,paidRequests:this.paidRequests.length,blockedRequests:this.requests.filter(r=>r.blocked).length};}
}
