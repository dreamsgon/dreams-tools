import { getBucket } from "./storage";
import { getAppUser } from "@/lib/app-user";
export async function context(request?: Request) {
  const user = await getAppUser();
  if (!user) throw new Error("Unauthorized");
  if (request && request.method !== "GET") {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
      throw new Error("Forbidden");
  }
  return {
    bucket: getBucket(),
    prefix: `users/${encodeURIComponent(user.userId)}/`,
  };
}
export function failure(e: unknown) {
  const message = e instanceof Error ? e.message : "Request failed";
  return Response.json(
    { error: message },
    {
      status:
        message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 400,
    },
  );
}
export const privateHeaders = { "Cache-Control": "private, no-store" };
