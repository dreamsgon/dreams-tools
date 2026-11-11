import {storedJson} from "@/lib/transfers";
import {loadWorkspace,saveWorkspace} from "@/lib/workspace-storage";
import { failure, privateHeaders } from "@/lib/server";
import { agentContext } from "@/lib/agent-auth";
import { campaignRoster, agentRosterSchema, applyAgentRosterOperation } from "@/lib/agent-roster";
import { agentJsonSchema } from "@/lib/agent-maps";

export async function GET(request: Request) {
  try {
    const { bucket, prefix, campaignId, mode } = await agentContext(request);
    const stored = await loadWorkspace(bucket,prefix);
    if (!stored) throw new Error("Campaign is unavailable.");
    const workspace = stored.workspace;
    return storedJson(bucket,prefix,{ campaignId, mode, revision: stored.revision, characters: campaignRoster(workspace, campaignId), writeSchema: agentJsonSchema(agentRosterSchema) }, { headers: privateHeaders });
  } catch (e) { return failure(e); }
}

export async function POST(request: Request) {
  try {
    const { bucket, prefix, campaignId, mode } = await agentContext(request);
    if (mode !== "edit") throw new Error("Forbidden");
    const text = await request.text();
    if (new TextEncoder().encode(text).length > 3_000_000) throw new Error("Request too large.");
    const batch = agentRosterSchema.parse(JSON.parse(text));
    const stored = await loadWorkspace(bucket,prefix);
    if (!stored) throw new Error("Campaign is unavailable.");
    const conflict = () => Response.json({ error: "Workspace changed. Read the latest revision before editing." }, { status: 409, headers: privateHeaders });
    if (stored.revision !== batch.revision) return conflict();
    const { workspace, ...result } = applyAgentRosterOperation(stored.workspace, campaignId, batch);
    const saved = await saveWorkspace(bucket,prefix,workspace,batch.revision);
    if (!saved) return conflict();
    return Response.json({ revision: saved.revision, ...result }, { headers: privateHeaders });
  } catch (e) { return failure(e); }
}

