import crypto from "node:crypto";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** A fresh SIWE nonce, remembered in an httpOnly cookie until it is used. */
export async function GET() {
  const nonce = crypto.randomBytes(16).toString("hex");
  const res = NextResponse.json({ nonce });
  res.cookies.set("lifeline_siwe", nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 5 * 60,
  });
  return res;
}
