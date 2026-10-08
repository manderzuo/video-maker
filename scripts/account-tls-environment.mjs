export function assertStrictTlsEnvironment(env=process.env){
 if(env.NODE_TLS_REJECT_UNAUTHORIZED==='0'||env.NODE_OPTIONS?.trim())throw new Error('Strict TLS requires NODE_TLS_REJECT_UNAUTHORIZED not set to 0 and empty NODE_OPTIONS');
}
