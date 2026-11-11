import {workspaceBody,storedJson} from '@/lib/transfers';
import {context,failure,privateHeaders} from '@/lib/server';
import {loadWorkspace,saveWorkspace,patchWorkspace,type WorkspacePatch} from '@/lib/workspace-storage';
import {workspaceSchema} from '@/lib/model';
export async function GET(request:Request){try{
 const {bucket,prefix}=await context();const known=request.headers.get('If-None-Match');
 if(known){const head=await bucket.head(prefix+'workspace.json');if(head&&(known===head.etag||known===`"${head.etag}"`))return new Response(null,{status:304,headers:{...privateHeaders,ETag:`"${head.etag}"`}});}
 const stored=await loadWorkspace(bucket,prefix);
 return storedJson(bucket,prefix,{workspace:stored?.workspace??null,revision:stored?.revision??null},{headers:{...privateHeaders,...(stored?{ETag:`"${stored.revision}"`}:{})}});
}catch(e){return failure(e);}}
const conflict=()=>Response.json({error:'Another device saved changes. Download a backup, then reload to get the latest cloud version.'},{status:409,headers:privateHeaders});

export async function PUT(request:Request){try{const {bucket,prefix}=await context(request),data=await workspaceBody(request,bucket,prefix),parsed=workspaceSchema.safeParse(data.workspace);if(!parsed.success)throw new Error('Invalid scene data. Your previous cloud save is unchanged.');const saved=await saveWorkspace(bucket,prefix,parsed.data,data.revision??null);return saved?Response.json(saved,{headers:privateHeaders}):conflict();}catch(e){return failure(e);}}
export async function PATCH(request:Request){try{const {bucket,prefix}=await context(request),data=await workspaceBody(request,bucket,prefix);const saved=await patchWorkspace(bucket,prefix,data.revision??null,data.patch as WorkspacePatch);return saved?Response.json(saved,{headers:privateHeaders}):conflict();}catch(e){return failure(e);}}

