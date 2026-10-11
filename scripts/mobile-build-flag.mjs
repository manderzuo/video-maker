export function readMobileBuildFlag(value){if(value===undefined||value==='0')return false;if(value==='1')return true;throw new Error('invalid_mobile_build_flag');}
