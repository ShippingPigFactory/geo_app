import { NextRequest, NextResponse } from "next/server";
import { AddressNormalizer } from "@/lib/normalizer";

export async function POST(req: NextRequest) {
  try {
    const { address } = await req.json();
    
    if (!address) {
      return NextResponse.json({ error: "Address is required" }, { status: 400 });
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Server configuration error: Missing API Key" }, { status: 500 });
    }

    const normalizer = new AddressNormalizer(apiKey);
    const result = await normalizer.normalize(address);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("API Error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
