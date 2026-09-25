import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const session = req.cookies.get("world_session")?.value;
  if (session) {
    return NextResponse.json({
      authenticated: true,
      nullifierHash: session,
    });
  }
  return NextResponse.json({ authenticated: false });
}

export async function DELETE() {
  const res = NextResponse.json({ success: true });
  res.cookies.set("world_session", "", {
    httpOnly: true,
    expires: new Date(0),
    path: "/",
  });
  return res;
}
