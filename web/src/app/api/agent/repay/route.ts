import { NextRequest } from "next/server";
import { POST as repayHandler } from "@/app/api/repay/route";

export async function POST(req: NextRequest) {
  return repayHandler(req);
}
