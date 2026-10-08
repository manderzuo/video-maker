import type {Pool} from 'pg';
import type {AuthContext} from '../auth/context.js';
import {HttpError} from '../errors.js';
import {documentViewSchema,type UserDocumentView} from './contracts.js';
type Row={revision:number;onboarding_completed_at:Date|null;preferences:unknown;last_visited_page:string};
function view(row:Row):UserDocumentView{return documentViewSchema.parse({revision:row.revision,onboardingCompletedAt:row.onboarding_completed_at?.toISOString()??null,preferences:row.preferences,lastVisitedPage:row.last_visited_page});}
export async function readDocument(pool:Pool,context:AuthContext){const result=await pool.query<Row>('SELECT revision,onboarding_completed_at,preferences,last_visited_page FROM user_documents WHERE user_id=$1',[context.userId]);if(!result.rows[0])throw new HttpError(404,'NOT_FOUND');return view(result.rows[0]);}
export async function readOwnedDocument(pool:Pool,context:AuthContext,id:string){if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))return null;const result=await pool.query<Row>('SELECT revision,onboarding_completed_at,preferences,last_visited_page FROM user_documents WHERE user_id=$1 AND id=$2',[context.userId,id]);return result.rows[0]?view(result.rows[0]):null;}
export async function updateDocument(pool:Pool,context:AuthContext,patch:{expectedRevision:number;preferences?:unknown;lastVisitedPage?:string;completedAt?:Date}){
 const result=await pool.query<Row>('UPDATE user_documents SET revision=revision+1,preferences=COALESCE($3::jsonb,preferences),last_visited_page=COALESCE($4,last_visited_page),onboarding_completed_at=COALESCE(onboarding_completed_at,$5) WHERE user_id=$1 AND revision=$2 RETURNING revision,onboarding_completed_at,preferences,last_visited_page',[context.userId,patch.expectedRevision,patch.preferences===undefined?null:JSON.stringify(patch.preferences),patch.lastVisitedPage??null,patch.completedAt??null]);
 if(!result.rows[0])throw new HttpError(409,'REVISION_CONFLICT');return view(result.rows[0]);
}
