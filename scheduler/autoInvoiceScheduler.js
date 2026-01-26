const cron = require("node-cron");
const { PrismaClient } = require("@prisma/client");
const { generateMonthlyInvoice } = require("../services/invoiceService");

const prisma = new PrismaClient();

/**
 * Core AutoInvoice job
 */
async function runAutoInvoiceJob() {
  console.log("======================================");
  console.log("⏰ AutoInvoice job started");
  console.log("🕒 Job time:", new Date().toISOString());
  console.log("======================================");

  const autoInvoices = await prisma.autoInvoice.findMany({
    where: { automail: true },
  });

  console.log(`📦 Found ${autoInvoices.length} auto-invoice records`);

  for (const ai of autoInvoices) {
    console.log("--------------------------------------");
    console.log(`👤 Customer ID: ${ai.customerId}`);
    console.log(`📅 Schedule: ${ai.scheduleTiming}`);
    console.log(`📌 Automail Enabled: ${ai.automail}`);

    const now = new Date();
    const lastSent = ai.lastSentAt || ai.createdAt;
    const nextRun = new Date(lastSent);

    console.log("🕰 Last Sent At:", lastSent.toISOString());

    // Calculate next run date
    switch (ai.scheduleTiming) {
      case "1month":
        nextRun.setMonth(nextRun.getMonth() + 1);
        break;

      case "3month":
        nextRun.setMonth(nextRun.getMonth() + 3);
        break;

      case "1year":
        nextRun.setFullYear(nextRun.getFullYear() + 1);
        break;

      default:
        console.warn("⚠️ Unknown scheduleTiming:", ai.scheduleTiming);
        continue;
    }

    console.log("⏭ Next Scheduled Run:", nextRun.toISOString());
    console.log("⏱ Current Time:", now.toISOString());

    // Check if invoice should be sent
    if (!ai.lastSentAt || now >= nextRun) {
      console.log("✅ Condition met → Sending invoice");

      try {
        console.log("📨 Calling sendMonthlyInvoices()");

        const result = await generateMonthlyInvoice({
          customerId: ai.customerId,
          reportType: ai.scheduleTiming,
        });

        console.log("📄 Invoice generated & email sent");
        console.log("📦 Result:", result);


        await prisma.autoInvoice.update({
          where: { customerId: ai.customerId },
          data: { lastSentAt: now },
        });

        console.log("💾 lastSentAt updated in DB");
      } catch (err) {
        console.error(
          `❌ AutoInvoice failed for customer ${ai.customerId}`
        );
        console.error("🔥 Error Message:", err.message);
      }
    } else {
      console.log("⏸ Not due yet — skipping this customer");
    }
  }

  console.log("======================================");
  console.log("🏁 AutoInvoice job finished");
  console.log("======================================");
}

/**
 * ▶ Run immediately on startup (development only)
 */
// if (process.env.NODE_ENV === "dev") {
//   console.log("🚀 Development mode detected");
//   console.log("▶ Running AutoInvoice immediately");
//   runAutoInvoiceJob().catch(console.error);
// }

/**
 * ⏱ Production cron — runs daily at 02:00 AM
 */
cron.schedule("0 2 * * *", async () => {
  console.log("⏰ Cron triggered at 02:00 AM");
  await runAutoInvoiceJob();
});
