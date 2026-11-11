// src/app/api/purchase-orders/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/server/services/auth";
import {
  getPurchaseOrders,
  createPurchaseOrder,
} from "@/lib/server/repositories/purchase-orders";
import { createPurchaseOrderSchema } from "@/lib/server/validation/purchase-order";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { workspaceId } = await requireAuth();
    const orders = await getPurchaseOrders(workspaceId);

    return NextResponse.json(
      { success: true, data: orders },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("GET /api/purchase-orders error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error fetching purchase orders" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { workspaceId, userId } = await requireAuth(["owner", "admin", "finance"]);

    const body = await request.json();
    const parseResult = createPurchaseOrderSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation failed",
          details: parseResult.error.flatten(),
        },
        { status: 400 }
      );
    }

    const newPO = await createPurchaseOrder(
      workspaceId,
      parseResult.data,
      userId
    );

    return NextResponse.json(
      { success: true, data: newPO },
      { status: 201 }
    );
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("POST /api/purchase-orders error:", error);
    const msg = error instanceof Error ? error.message : "Failed to create purchase order";
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    );
  }
}
