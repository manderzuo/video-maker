import * as argon2 from 'argon2';
import {z} from 'zod';
export const passwordSchema=z.string().refine(value=>{const n=Array.from(value).length;return n>=15&&n<=128;});
const options={type:argon2.argon2id,memoryCost:19456,timeCost:2,parallelism:1} as const;
export const hashPassword=(password:string)=>argon2.hash(passwordSchema.parse(password),options);
export const verifyPassword=(hash:string,password:string)=>argon2.verify(hash,password);
