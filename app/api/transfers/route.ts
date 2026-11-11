import { context, failure, privateHeaders } from '@/lib/server';
import { createTransfer } from '@/lib/transfers';
export async function POST(request: Request) {
  try {
    const { bucket, prefix } = await context(request);
    const text = await request.text();
    if (text.length > 2048) throw Error('Transfer request too large.');
    return Response.json(createTransfer(bucket, prefix, JSON.parse(text)), { headers: privateHeaders });
  } catch (error) { return failure(error); }
}
