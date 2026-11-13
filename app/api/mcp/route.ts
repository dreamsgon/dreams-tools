import { servePost, notAllowed } from "@/lib/mcp/http";
export const dynamic = "force-dynamic";
// The hosted MCP server for clients that send the key in an Authorization header.
export async function POST(request: Request) {
  return servePost(request, request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? null);
}
export const GET = notAllowed, DELETE = notAllowed;
