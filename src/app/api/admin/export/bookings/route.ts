import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { Prisma } from "@/generated/prisma/client";
import { requireApiAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeZone: "UTC",
});

function parseDate(value: string | null, endOfDay = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay) date.setUTCHours(23, 59, 59, 999);
  return date;
}

function parseAmount(value: string | null) {
  if (!value || value.trim() === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function slotLabel(slot: string) {
  const start = Number(slot);
  const display = (hour: number) => `${hour % 12 || 12}:00 ${hour >= 12 ? "PM" : "AM"}`;
  return `${display(start)}–${display(start + 1)}`;
}

function formatFilters(params: URLSearchParams) {
  const entries = [
    ["Search", params.get("q")],
    ["Status", params.get("status") === "ALL" ? null : params.get("status")],
    ["From", params.get("from")],
    ["To", params.get("to")],
    ["Minimum amount", params.get("minAmount")],
    ["Maximum amount", params.get("maxAmount")],
  ].filter(([, value]) => value);
  return entries.length ? entries.map(([label, value]) => `${label}: ${value}`).join(" · ") : "All bookings";
}

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111111" } };
  row.alignment = { vertical: "middle", horizontal: "center" };
}

export async function GET(request: Request) {
  const auth = await requireApiAdmin();
  if (!auth.user) return auth.response;

  const { searchParams } = new URL(request.url);
  const where: Prisma.BookingWhereInput = {};
  const status = searchParams.get("status");
  if (status && status !== "ALL" && ["CONFIRMED", "PENDING", "CANCELLED"].includes(status)) where.status = status;

  const from = parseDate(searchParams.get("from"));
  const to = parseDate(searchParams.get("to"), true);
  if (from || to) where.date = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };

  const minAmount = parseAmount(searchParams.get("minAmount"));
  const maxAmount = parseAmount(searchParams.get("maxAmount"));
  if (minAmount !== null || maxAmount !== null) {
    where.totalAmount = { ...(minAmount !== null ? { gte: minAmount } : {}), ...(maxAmount !== null ? { lte: maxAmount } : {}) };
  }

  const query = searchParams.get("q")?.trim();
  if (query) {
    where.OR = [
      { ticketNumber: { contains: query, mode: "insensitive" } },
      { bookingName: { contains: query, mode: "insensitive" } },
      { bandName: { contains: query, mode: "insensitive" } },
      { user: { is: { OR: [
        { name: { contains: query, mode: "insensitive" } },
        { email: { contains: query, mode: "insensitive" } },
        { phone: { contains: query, mode: "insensitive" } },
      ] } } },
    ];
  }

  const bookings = await prisma.booking.findMany({
    where,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: { user: true, order: { select: { totalHours: true, freeHours: true } } },
  });

  const confirmed = bookings.filter((booking) => booking.status === "CONFIRMED");
  const customers = new Map<string, { name: string; email: string; phone: string; bandName: string; bookings: number; confirmedBookings: number; hours: number; paid: number }>();
  for (const booking of bookings) {
    const current = customers.get(booking.userId) || {
      name: booking.bookingName || booking.user.name || "—",
      email: booking.user.email || "—",
      phone: booking.user.phone || "—",
      bandName: booking.bandName || booking.user.bandName || "—",
      bookings: 0,
      confirmedBookings: 0,
      hours: 0,
      paid: 0,
    };
    current.bookings += 1;
    current.hours += booking.slots.length;
    if (booking.status === "CONFIRMED") {
      current.confirmedBookings += 1;
      current.paid += booking.totalAmount;
    }
    customers.set(booking.userId, current);
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Elf Jampad";
  workbook.created = new Date();
  workbook.properties.date1904 = false;

  const summary = workbook.addWorksheet("Summary", { views: [{ showGridLines: false }] });
  summary.columns = [{ width: 26 }, { width: 28 }];
  summary.addRow(["Elf Jampad booking export"]);
  summary.mergeCells("A1:B1");
  summary.getCell("A1").font = { name: "Arial", size: 16, bold: true, color: { argb: "FFFFFFFF" } };
  summary.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111111" } };
  summary.getCell("A1").alignment = { vertical: "middle" };
  summary.getRow(1).height = 28;
  summary.addRows([
    ["Generated", new Date()],
    ["Filters", formatFilters(searchParams)],
    [],
    ["Metric", "Value"],
    ["Bookings", bookings.length],
    ["Customers", customers.size],
    ["Confirmed bookings", confirmed.length],
    ["Booked hours", bookings.reduce((sum, booking) => sum + booking.slots.length, 0)],
    ["Confirmed revenue", confirmed.reduce((sum, booking) => sum + booking.totalAmount, 0)],
  ]);
  styleHeader(summary.getRow(5));
  summary.getCell("B2").numFmt = "dd mmm yyyy, h:mm AM/PM";
  summary.getCell("B10").numFmt = '₹#,##0';
  for (let rowNumber = 5; rowNumber <= 9; rowNumber += 1) {
    for (let columnNumber = 1; columnNumber <= 2; columnNumber += 1) {
      summary.getRow(rowNumber).getCell(columnNumber).border = {
        top: { style: "thin", color: { argb: "FFE5E7EB" } },
        left: { style: "thin", color: { argb: "FFE5E7EB" } },
        bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
        right: { style: "thin", color: { argb: "FFE5E7EB" } },
      };
    }
  }

  const bookingSheet = workbook.addWorksheet("Bookings", { views: [{ state: "frozen", ySplit: 1, showGridLines: false }] });
  bookingSheet.columns = [
    { header: "Ticket", key: "ticket", width: 16 }, { header: "Booking date", key: "date", width: 16 },
    { header: "Time slots", key: "slots", width: 30 }, { header: "Booking name", key: "bookingName", width: 24 },
    { header: "Artist / band", key: "bandName", width: 24 }, { header: "Email", key: "email", width: 30 },
    { header: "Phone", key: "phone", width: 18 }, { header: "Attendees", key: "attendees", width: 12 },
    { header: "Hours", key: "hours", width: 10 }, { header: "Amount", key: "amount", width: 14 },
    { header: "Payment method", key: "paymentMethod", width: 16 }, { header: "Payment status", key: "paymentStatus", width: 16 },
    { header: "Booking status", key: "status", width: 16 }, { header: "Loyalty free hours", key: "freeHours", width: 20 },
    { header: "Created at", key: "createdAt", width: 22 }, { header: "Equipment requests", key: "equipment", width: 42 },
  ];
  styleHeader(bookingSheet.getRow(1));
  bookingSheet.autoFilter = "A1:P1";
  for (const booking of bookings) {
    bookingSheet.addRow({
      ticket: booking.ticketNumber || "—", date: booking.date, slots: booking.slots.map(slotLabel).join(", "),
      bookingName: booking.bookingName || booking.user.name || "—", bandName: booking.bandName || "—",
      email: booking.user.email || "—", phone: booking.user.phone || "—", attendees: booking.attendees,
      hours: booking.slots.length, amount: booking.totalAmount, paymentMethod: booking.paymentMethod,
      paymentStatus: booking.paymentStatus, status: booking.status, freeHours: booking.order?.freeHours || 0,
      createdAt: booking.createdAt, equipment: booking.equipmentRequests || "—",
    });
  }
  bookingSheet.getColumn("date").numFmt = "dd mmm yyyy";
  bookingSheet.getColumn("amount").numFmt = '₹#,##0';
  bookingSheet.getColumn("createdAt").numFmt = "dd mmm yyyy, h:mm AM/PM";
  bookingSheet.getColumn("equipment").alignment = { wrapText: true, vertical: "top" };

  const customerSheet = workbook.addWorksheet("Customers", { views: [{ state: "frozen", ySplit: 1, showGridLines: false }] });
  customerSheet.columns = [
    { header: "Booking name", key: "name", width: 24 }, { header: "Email", key: "email", width: 32 },
    { header: "Phone", key: "phone", width: 18 }, { header: "Artist / band", key: "bandName", width: 24 },
    { header: "Bookings", key: "bookings", width: 12 }, { header: "Confirmed", key: "confirmedBookings", width: 14 },
    { header: "Booked hours", key: "hours", width: 16 }, { header: "Confirmed spend", key: "paid", width: 20 },
  ];
  styleHeader(customerSheet.getRow(1));
  customerSheet.autoFilter = "A1:H1";
  [...customers.values()].sort((a, b) => b.paid - a.paid).forEach((customer) => customerSheet.addRow(customer));
  customerSheet.getColumn("paid").numFmt = '₹#,##0';

  [bookingSheet, customerSheet].forEach((sheet) => {
    sheet.eachRow((row, index) => {
      if (index > 1) row.alignment = { vertical: "middle" };
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `elf-jampad-bookings-${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename=\"${filename}\"`,
      "Cache-Control": "no-store",
    },
  });
}
