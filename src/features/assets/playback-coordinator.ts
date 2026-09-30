const players=new Map<HTMLMediaElement,string|undefined>();
export function activateLocalMedia(element:HTMLMediaElement,group?:string){for(const [other,owner] of players)if(other!==element&&(!group||owner!==group))other.pause();players.set(element,group);}
export function releaseLocalMedia(element:HTMLMediaElement){players.delete(element);}
