// utils/sendMail.js
const { createTransporter } = require("../config/mailConfig");

const transporter = createTransporter();

const sendMail = async ({ to, cc, subject, html, attachments }) => {
  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to,
    cc,
    subject,
    html,
    attachments,
  };

  return transporter.sendMail(mailOptions);
};

module.exports = { sendMail };
