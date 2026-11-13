import { servePost, notAllowed } from "@/lib/mcp/http";
export const dynamic = "force-dynamic";
// The hosted MCP server for connectors that take only a URL (Claude, ChatGPT): the key is the last part of the URL.
export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
  return servePost(request, (await params).key);
}
export const GET = notAllowed, DELETE = notAllowed;
