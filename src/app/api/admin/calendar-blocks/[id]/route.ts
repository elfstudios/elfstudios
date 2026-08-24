import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiAdmin } from "@/lib/auth";
import { deleteCalendarBlockFromGoogleCalendar } from "@/lib/google-calendar";

export const dynamic = "force-dynamic";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAdmin();
  if (!auth.user) return auth.response;

  const { id } = await params;
  const block = await prisma.calendarBlock.findUnique({ where: { id } });
  if (!block) return NextResponse.json({ error: "Block not found." }, { status: 404 });

  try {
    const calendar = await deleteCalendarBlockFromGoogleCalendar(block).catch((error) => ({
      synced: false,
      reason: error instanceof Error ? error.message : "Google Calendar deletion failed.",
    }));
    await prisma.calendarBlock.delete({ where: { id } });
    return NextResponse.json({ deleted: true, calendar });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to remove the block.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
