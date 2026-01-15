const nodemailer = require("nodemailer");
const dotenv = require("dotenv");
const { testSMTP } = require("./test_secret");
dotenv.config(); // Load .env file

async function testSMTP() {
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,   // e.g. "smtp.gmail.com"
      port: 587,                     // or 465 for SSL
      secure: false,                 // true for 465
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    // Verify SMTP connection
    await transporter.verify();

    // Send test email
    await transporter.sendMail({
      from: `"Test App" <${process.env.EMAIL_FROM}>`,
      to: "sk34761@gmail.com",
      subject: "SMTP Test",
      text: "This is a test email from Node.js 🚀",
    });

    return { success: true, message: "SMTP is working & test email sent!" };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

module.exports = { testSMTP };
