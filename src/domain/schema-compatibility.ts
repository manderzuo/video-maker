import {schemaVersion} from './common';
export type CompatibilityDecision={mode:'writable'|'readonly'|'unsupported';code:'supported'|'schema_too_new'|'schema_invalid'};
// Project/package schema and IndexedDB structural version are separate contracts.
export function canOpenSchema(version:number):CompatibilityDecision{
 if(!Number.isSafeInteger(version)||version<1)return {mode:'unsupported',code:'schema_invalid'};
 if(version>schemaVersion)return {mode:'readonly',code:'schema_too_new'};
 return {mode:'writable',code:'supported'};
}
