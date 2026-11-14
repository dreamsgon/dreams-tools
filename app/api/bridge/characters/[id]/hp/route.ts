import { z } from "zod";
import { bridge, commit, preflight, readBody, reply } from "@/lib/bridge/http";
import { need, setHp } from "@/lib/bridge/api";
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };
// Current (and maximum) HP from the other table, such as a token's HP bar in Foundry.
export const POST = (request: Request, { params }: Params) => bridge(request, async ctx => {
  need(ctx.grant, "characters", "from");
  const entryId = z.string().min(1).max(100).parse((await params).id);
  const body = z.object({ value: z.unknown(), max: z.unknown().optional() }).parse(await readBody(request));
  const out = await commit(ctx, data => setHp(data, ctx.grant.campaignId, entryId, body));
  return reply({ revision: out.revision, hp: out.hp });
});
export const OPTIONS = preflight;
