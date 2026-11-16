/** This site's address as the browser (or another app) asked for it: the forwarded host on Vercel, the Host header otherwise. */
export function originOf(request: Request) {
  const url = new URL(request.url), host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host).split(",")[0].trim();
  const proto = (request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "")).split(",")[0].trim();
  return /^[a-z0-9.-]+(?::\d+)?$/i.test(host) && /^https?$/.test(proto) ? `${proto}://${host}` : url.origin;
}
