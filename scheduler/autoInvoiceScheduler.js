import cron from "node-cron";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * ======================================
 * CRON JOB – RUNS DAILY AT 02:00 AM
 * ======================================
 */
cron.schedule("0 2 * * *", async () => {
  console.log("⏰ AutoInvoice Scheduler started...");

  try {
    const autoInvoices = await prisma.autoInvoice.findMany({
      where: {
        automail: true,
        scheduleTiming: { not: null },
        customerId: { not: null },
      },
    });

    for (const ai of autoInvoices) {
      const shouldSend = shouldSendNow(ai.scheduleTiming, ai.lastSentAt);

      if (!shouldSend) continue;

      await sendInvoiceEmail(ai.customerId);

      // Update last sent timestamp
      await prisma.autoInvoice.update({
        where: { id: ai.id },
        data: { lastSentAt: new Date() },
      });

      console.log(
        `✅ Auto invoice emailed → Customer ID: ${ai.customerId} (${ai.scheduleTiming})`
      );
    }
  } catch (err) {
    console.error("❌ AutoInvoice Scheduler failed:", err);
  }
});

/**
 * ======================================
 * SCHEDULE CHECKER
 * ======================================
 */
function shouldSendNow(scheduleTiming, lastSentAt) {
  const now = new Date();

  // First-time auto invoice
  if (!lastSentAt) return true;

  const last = new Date(lastSentAt);

  switch (scheduleTiming) {
    case "MONTH_1":
      return diffInMonths(last, now) >= 1;

    case "MONTH_3":
      return diffInMonths(last, now) >= 3;

    case "YEAR_1":
      return diffInYears(last, now) >= 1;

    default:
      return false;
  }
}

/**
 * ======================================
 * DATE HELPERS
 * ======================================
 */
function diffInMonths(d1, d2) {
  return (
    d2.getFullYear() * 12 +
    d2.getMonth() -
    (d1.getFullYear() * 12 + d1.getMonth())
  );
}

function diffInYears(d1, d2) {
  return d2.getFullYear() - d1.getFullYear();
}

/**
 * ======================================
 * SEND INVOICE EMAIL
 * ======================================
 */
async function sendInvoiceEmail(customerId) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
  });

  if (!customer?.email) {
    console.warn(`⚠️ No email found for customer ${customerId}`);
    return;
  }

  const { buffer, startDate, endDate } = await generateInvoice(customerId);

  const emailBody = `
    <p>Hello,</p>

    <p>
      This is an automated email from
      <strong>Insightz MDR Invoice AutoScheduler</strong>.
    </p>

    <p>
      Please find attached your MDR invoice for the billing period below:
    </p>

    <p>
      <strong>📅 Invoice Period</strong><br/>
      From: <strong>${startDate}</strong><br/>
      To: <strong>${endDate}</strong>
    </p>

    <p>
      This invoice has been generated and sent automatically as per your selected billing schedule.
    </p>

    <p>
      Thank you for choosing <strong>Insightz MDR</strong>.
    </p>

    <p>
      Best regards,<br/>
      <strong>Insightz MDR Billing Team</strong>
    </p>
  `;

  await sendMail({
    to: customer.email,
    subject: "Insightz MDR – Scheduled Invoice",
    body: emailBody,
    attachment: buffer,
  });
}

/**
 * ======================================
 * MAIL SENDER
 * ======================================
 */
async function sendMail({ to, subject, body, attachment }) {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject,
    html: body,
    attachments: [
      {
        filename: "invoice.pdf",
        content: attachment,
        contentType: "application/pdf",
      },
    ],
  });
}
