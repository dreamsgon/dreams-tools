import { z } from "zod";
import { bridge, commit, preflight, readBody, reply } from "@/lib/bridge/http";
import { BridgeError, listCharacters, need, readCharacter, writeCharacter } from "@/lib/bridge/api";
import { importFileSchema } from "@/lib/encyclopedia/sheet-import";
export const dynamic = "force-dynamic";
// Every character the campaign can see (its own and the world's shared ones), and making a new one from a sheet.
export const GET = (request: Request) => bridge(request, async ({ grant, store }) => {
  need(grant, "characters", "to");
  const { data, revision } = await store.read(grant.owner);
  return reply({ revision, characters: listCharacters(data, grant.campaignId) });
});
export const POST = (request: Request) => bridge(request, async ctx => {
  need(ctx.grant, "characters", "from");
  const body = z.object({ sheet: z.unknown() }).parse(await readBody(request));
  const sheet = importFileSchema.safeParse(body.sheet);
  if (!sheet.success) throw new BridgeError(400, `That isn’t an RPG Tools sheet: ${sheet.error.issues[0].message} (at ${sheet.error.issues[0].path.join(" › ") || "the top"}).`);
  const out = await commit(ctx, data => writeCharacter(data, ctx.grant.campaignId, null, sheet.data));
  const { data } = await ctx.store.read(ctx.grant.owner);
  return reply({ revision: out.revision, warnings: out.warnings, character: readCharacter(data, ctx.grant.campaignId, out.id) }, 201);
});
export const OPTIONS = preflight;
