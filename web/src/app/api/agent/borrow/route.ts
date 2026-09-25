import { NextRequest } from "next/server";
import { POST as borrowHandler } from "@/app/api/borrow/route";

export async function POST(req: NextRequest) {
  return borrowHandler(req);
}
