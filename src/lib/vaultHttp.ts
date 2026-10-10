import { NextResponse } from "next/server";
import { invalidateEngine } from "./engine";
import { VaultError } from "./vaultStore";

/** SQLite's codes when the file or folder can't be written (e.g. Vercel's read-only filesystem). */
function isReadOnly(e: unknown): boolean {
  const code = (e as { code?: unknown }).code;
  return typeof code === "string" && (code.startsWith("SQLITE_READONLY") || code === "SQLITE_CANTOPEN");
}

async function readBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new VaultError("Body must be valid JSON.", 400);
  }
}

/**
 * Runs a vault write and turns failures into clear responses: field errors (400),
 * missing product (404), stock conflicts (409), read-only deployments (503).
 */
export async function vaultWrite(request: Request, write: (body: unknown) => unknown): Promise<NextResponse> {
  try {
    const result = write(await readBody(request));
    invalidateEngine();
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    if (e instanceof VaultError) return NextResponse.json({ error: e.message, fieldErrors: e.fieldErrors ?? {} }, { status: e.status });
    if (isReadOnly(e)) {
      return NextResponse.json(
        { error: "This deployment can't save changes (read-only filesystem). Run the app locally to use the vault and billing counter." },
        { status: 503 },
      );
    }
    throw e;
  }
}
