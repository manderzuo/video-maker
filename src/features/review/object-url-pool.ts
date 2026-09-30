export function acquireMediaUrl(blob:Blob){const objectUrl=URL.createObjectURL(blob);let released=false;return {objectUrl,release:()=>{if(!released){released=true;URL.revokeObjectURL(objectUrl);}}};}
