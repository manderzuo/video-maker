const origins=new Set<string>();
export const registeredMockOrigins=()=>[...origins];
export function registerTestMockOrigin(origin:string){const parsed=new URL(origin);if(parsed.protocol!=='http:'||parsed.hostname!=='127.0.0.1'||!parsed.port||parsed.username||parsed.password||parsed.origin!==origin)throw new Error('test_mock_origin_invalid');origins.add(origin);return()=>origins.delete(origin);}
