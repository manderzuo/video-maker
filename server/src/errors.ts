export class HttpError extends Error{
 constructor(readonly status:number,readonly code:string,readonly issues?:string[]){super(code);}
}
