import nodemailer from "nodemailer";
import { format } from "date-fns";

const SMTP_EMAIL = process.env.SMTP_EMAIL;
const SMTP_PASSWORD = process.env.SMTP_PASSWORD;
const ADMIN_EMAILS = process.env.ADMIN_EMAILS;

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: SMTP_EMAIL,
    pass: SMTP_PASSWORD,
  },
});

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function sendBookingConfirmation(booking: any, userEmail: string) {
  if (!SMTP_EMAIL || !SMTP_PASSWORD) {
    console.warn("SMTP credentials not configured. Skipping email.");
    return;
  }

  const { ticketNumber, bandName, date, slots, totalAmount, equipmentRequests, user } = booking;
  const formattedDate = format(new Date(date), "EEEE, MMMM d, yyyy");
  
  // Convert slot strings to readable times (e.g. "10" -> "10:00 AM - 11:00 AM")
  const formattedSlots = slots.map((s: string) => {
    const hr = parseInt(s);
    const ampm1 = hr >= 12 ? "PM" : "AM";
    const ampm2 = (hr + 1) >= 12 ? "PM" : "AM";
    const hr1 = hr > 12 ? hr - 12 : hr;
    const hr2 = (hr + 1) > 12 ? (hr + 1) - 12 : (hr + 1);
    return `${hr1}:00 ${ampm1} - ${hr2}:00 ${ampm2}`;
  }).join("<br/>");

  const userName = user?.name || "Musician";
  const userPhone = user?.phone || "Not provided";
  const safeUserName = escapeHtml(userName);
  const safeBandName = escapeHtml(bandName);
  const safeTicketNumber = escapeHtml(ticketNumber);
  const safeEquipmentRequests = escapeHtml(equipmentRequests);
  const safeUserEmail = escapeHtml(userEmail);
  const safeUserPhone = escapeHtml(userPhone);

  // Customer Email HTML
  const customerHtml = `
    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #111111; color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #333;">
      <div style="background-color: #000000; padding: 30px; text-align: center; border-bottom: 2px solid #ff6600;">
        <h1 style="color: #ff6600; margin: 0; font-size: 28px; letter-spacing: 2px; text-transform: uppercase;">Elf Studios</h1>
      </div>
      <div style="padding: 40px 30px;">
        <h2 style="color: #4ade80; font-size: 24px; margin-top: 0;">Booking Confirmed!</h2>
        <p style="font-size: 16px; line-height: 1.5; color: #cccccc;">
          Hey ${safeUserName},<br/><br/>
          Your jam session for <strong>${safeBandName}</strong> is locked and loaded. We've received your payment and secured your slots.
        </p>
        
        <div style="background-color: #1a1a1a; border-left: 4px solid #ff6600; padding: 20px; margin: 30px 0; border-radius: 4px;">
          <p style="margin: 0 0 10px 0; font-size: 14px; color: #888888; text-transform: uppercase; letter-spacing: 1px;">Official Ticket No.</p>
          <p style="margin: 0; font-size: 32px; font-weight: bold; color: #ff6600; letter-spacing: 4px;">${safeTicketNumber}</p>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
          <tr>
            <td style="padding: 12px 0; border-bottom: 1px solid #333; color: #888; width: 40%;">Date</td>
            <td style="padding: 12px 0; border-bottom: 1px solid #333; font-weight: bold; text-align: right;">${formattedDate}</td>
          </tr>
          <tr>
            <td style="padding: 12px 0; border-bottom: 1px solid #333; color: #888;">Time Slots</td>
            <td style="padding: 12px 0; border-bottom: 1px solid #333; font-weight: bold; text-align: right;">${formattedSlots}</td>
          </tr>
          <tr>
            <td style="padding: 12px 0; border-bottom: 1px solid #333; color: #888;">Total Amount</td>
            <td style="padding: 12px 0; border-bottom: 1px solid #333; font-weight: bold; text-align: right; color: #4ade80;">₹${totalAmount}</td>
          </tr>
        </table>
        
        ${equipmentRequests ? `
        <div style="margin-bottom: 30px;">
          <p style="color: #888; font-size: 14px; margin-bottom: 5px;">Equipment Requests:</p>
          <p style="background-color: #222; padding: 15px; border-radius: 6px; margin: 0; font-size: 14px; color: #ddd;">${safeEquipmentRequests}</p>
        </div>` : ''}

        <p style="font-size: 14px; color: #888; text-align: center; margin-top: 40px;">
          See you at the pad!<br/>
          <strong>Elf Studios Team</strong>
        </p>
      </div>
    </div>
  `;

  // Admin Email HTML
  const adminHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #ff6600;">New Booking Alert: ${safeBandName}</h2>
      <p>A new jam session has been successfully booked and paid for.</p>
      
      <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold; width: 150px;">Ticket No:</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${safeTicketNumber}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Band Name:</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${safeBandName}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Booked By:</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${safeUserName} (${safeUserEmail})</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Phone:</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${safeUserPhone}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Date:</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${formattedDate}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Slots:</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${formattedSlots}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Amount Paid:</td><td style="padding: 8px; border-bottom: 1px solid #eee;">₹${totalAmount}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Equipment:</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${safeEquipmentRequests || "None"}</td></tr>
      </table>
    </div>
  `;

  try {
    // 1. Send to Customer
    await transporter.sendMail({
      from: `"Elf Studios" <${SMTP_EMAIL}>`,
      to: userEmail,
      subject: `Booking Confirmed - Ticket ${ticketNumber}`,
      html: customerHtml,
    });

    // 2. Send to Admins
    if (ADMIN_EMAILS) {
      const adminList = ADMIN_EMAILS.split(",").map(e => e.trim());
      await transporter.sendMail({
        from: `"Elf Studios System" <${SMTP_EMAIL}>`,
        to: adminList,
        subject: `NEW BOOKING: ${bandName} - ${formattedDate}`,
        html: adminHtml,
      });
    }

    console.log("Booking emails sent successfully.");
  } catch (error) {
    console.error("Error sending booking emails:", error);
  }
}

export async function sendOrderConfirmation(order: any, bookings: any[], userEmail: string) {
  if (bookings.length === 1) {
    return sendBookingConfirmation(bookings[0], userEmail);
  }
  if (!SMTP_EMAIL || !SMTP_PASSWORD) {
    console.warn("SMTP credentials not configured. Skipping email.");
    return;
  }

  const sessions = bookings.map((booking) => {
    const times = (booking.slots as string[]).map((slot) => {
      const hour = Number(slot);
      const display = (value: number) => `${value % 12 || 12}:00 ${value >= 12 ? "PM" : "AM"}`;
      return `${display(hour)}–${display(hour + 1)}`;
    }).join(", ");
    return `<tr>
      <td style="padding:12px 0;border-bottom:1px solid #333"><strong>${escapeHtml(format(new Date(booking.date), "EEE, MMM d, yyyy"))}</strong><br/><span style="color:#aaa">${escapeHtml(times)}</span></td>
      <td style="padding:12px 0;border-bottom:1px solid #333;text-align:right;color:#ff6600;font-weight:bold">${escapeHtml(booking.ticketNumber || "—")}</td>
    </tr>`;
  }).join("");
  const safeBand = escapeHtml(order.bandName || "Jam Session");
  const safeName = escapeHtml(order.user?.name || "Musician");
  const total = Number(order.totalAmount).toLocaleString("en-IN");
  const loyalty = order.freeHours > 0
    ? `<p style="margin:16px 0 0;color:#86efac">Loyalty credit applied: ${order.freeHours} free hour${order.freeHours === 1 ? "" : "s"}.</p>`
    : "";
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;background:#111;color:#fff;border:1px solid #333;border-radius:12px;overflow:hidden">
      <div style="padding:28px;text-align:center;background:#000;border-bottom:2px solid #ff6600"><h1 style="margin:0;color:#ff6600;letter-spacing:2px">ELF STUDIOS</h1></div>
      <div style="padding:30px"><h2 style="color:#86efac;margin-top:0">Your sessions are confirmed!</h2>
        <p>Hey ${safeName}, we have received payment for <strong>${safeBand}</strong>. All ${bookings.length} sessions below are secured.</p>
        <table style="width:100%;border-collapse:collapse;margin-top:20px"><thead><tr><th style="text-align:left;color:#aaa;font-size:12px">DATE & TIME</th><th style="text-align:right;color:#aaa;font-size:12px">TICKET</th></tr></thead><tbody>${sessions}</tbody></table>
        ${loyalty}
        <p style="font-size:22px;font-weight:bold;text-align:right;margin-top:26px">Paid: <span style="color:#86efac">₹${total}</span></p>
      </div>
    </div>`;
  const adminHtml = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto"><h2 style="color:#ff6600">New multi-session booking: ${safeBand}</h2>
      <p><strong>Customer:</strong> ${safeName} (${escapeHtml(userEmail)})</p>
      <p><strong>Paid:</strong> ₹${total}${order.freeHours ? ` · ${order.freeHours} loyalty free hour${order.freeHours === 1 ? "" : "s"}` : ""}</p>
      <table style="width:100%;border-collapse:collapse"><tbody>${sessions.replaceAll("#333", "#eee")}</tbody></table>
    </div>`;
  try {
    await transporter.sendMail({
      from: `"Elf Studios" <${SMTP_EMAIL}>`,
      to: userEmail,
      subject: `${bookings.length} sessions confirmed - Elf Jampad`,
      html,
    });
    if (ADMIN_EMAILS) {
      await transporter.sendMail({
        from: `"Elf Studios System" <${SMTP_EMAIL}>`,
        to: ADMIN_EMAILS.split(",").map((email) => email.trim()),
        subject: `NEW MULTI-SESSION BOOKING: ${order.bandName || "Elf Jampad"}`,
        html: adminHtml,
      });
    }
  } catch (error) {
    console.error("Error sending multi-session booking email:", error);
  }
}

export async function sendBookingChangeNotification(
  booking: any,
  userEmail: string,
  action: "CANCELLED" | "RESCHEDULED",
) {
  if (!SMTP_EMAIL || !SMTP_PASSWORD) return;
  const formattedDate = format(new Date(booking.date), "EEEE, MMMM d, yyyy");
  const formattedSlots = (booking.slots as string[]).map((slot) => {
    const hour = Number(slot);
    const display = (value: number) => `${value % 12 || 12}:00 ${value >= 12 ? "PM" : "AM"}`;
    return `${display(hour)} - ${display(hour + 1)}`;
  }).join(", ");
  const cancelled = action === "CANCELLED";
  const subject = cancelled
    ? `Booking Cancelled - ${booking.ticketNumber || "Elf Jampad"}`
    : `Booking Rescheduled - ${booking.ticketNumber || "Elf Jampad"}`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#111">
      <h1 style="color:#ff6600">Elf Jampad</h1>
      <h2>${cancelled ? "Booking cancelled" : "Booking rescheduled"}</h2>
      <p>Your booking for <strong>${escapeHtml(booking.bandName || "Jam Session")}</strong> has been ${cancelled ? "cancelled" : "rescheduled"}.</p>
      ${cancelled ? "" : `<p><strong>New date:</strong> ${escapeHtml(formattedDate)}<br/><strong>New time:</strong> ${escapeHtml(formattedSlots)}</p>`}
      <p><strong>Ticket:</strong> ${escapeHtml(booking.ticketNumber || "N/A")}</p>
      <p style="color:#666">If you did not expect this change, contact Elf Studios immediately.</p>
    </div>`;
  await transporter.sendMail({ from: `"Elf Studios" <${SMTP_EMAIL}>`, to: userEmail, subject, html });
}
