export type RequestRecord={url:string;method:string;blocked:boolean};
export class NetworkCounter {
 readonly requests:RequestRecord[]=[];
 record(url:string,method:string,blocked=false){this.requests.push({url,method,blocked});}
 get paidRequests(){return this.requests.filter(r=>r.method==='POST'&&/\/(chat\/completions|videos\/generations)$/.test(new URL(r.url).pathname));}
}
