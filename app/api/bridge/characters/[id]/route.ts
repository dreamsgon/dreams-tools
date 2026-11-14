import { z } from "zod";
import { bridge, commit, preflight, readBody, reply } from "@/lib/bridge/http";
import { BridgeError, need, readCharacter, writeCharacter } from "@/lib/bridge/api";
import { importFileSchema } from "@/lib/encyclopedia/sheet-import";
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };
const id = z.string().min(1).max(100);
// One character as an RPG Tools sheet, and updating it from one.
export const GET = (request: Request, { params }: Params) => bridge(request, async ({ grant, store }) => {
  need(grant, "characters", "to");
  const { data, revision } = await store.read(grant.owner);
  return reply({ revision, character: readCharacter(data, grant.campaignId, id.parse((await params).id)) });
});
export const PUT = (request: Request, { params }: Params) => bridge(request, async ctx => {
  need(ctx.grant, "characters", "from");
  const entryId = id.parse((await params).id);
  const body = z.object({ sheet: z.unknown(), baseUpdatedAt: z.string().max(40).optional() }).parse(await readBody(request));
  const sheet = importFileSchema.safeParse(body.sheet);
  if (!sheet.success) throw new BridgeError(400, `That isn’t an RPG Tools sheet: ${sheet.error.issues[0].message} (at ${sheet.error.issues[0].path.join(" › ") || "the top"}).`);
  const out = await commit(ctx, data => writeCharacter(data, ctx.grant.campaignId, entryId, sheet.data, { baseUpdatedAt: body.baseUpdatedAt }));
  const { data } = await ctx.store.read(ctx.grant.owner);
  return reply({ revision: out.revision, warnings: out.warnings, character: readCharacter(data, ctx.grant.campaignId, out.id) });
});
export const OPTIONS = preflight;
