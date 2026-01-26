// scheduler/invoiceScheduler.js
const cron = require("node-cron");
const { sendMonthlyInvoices } = require("../services/invoiceService");

// ┌──────── min (0)
// │ ┌────── hour (10)
// │ │ ┌──── day of month (1)
// │ │ │ ┌── month (*)
// │ │ │ │ ┌─ day of week (*)
cron.schedule("0 10 1 * *", async () => {
  console.log("📨 Running monthly invoice scheduler...");
  await sendMonthlyInvoices();
});
