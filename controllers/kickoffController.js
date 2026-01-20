const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { generateDocx } = require("../services/generateDocx");
const { generatePpt } = require("../services/generatePpt");
const { createTransporter } = require('../config/mailConfig')
const fs = require("fs");
const path = require("path");

const transporter = createTransporter();

const sendMail = async ({ subject, body, attachments }) => {
  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: "Pradeep.Rajangam@insightz.tech",
    subject,
    html: body,
    attachments,
  };

  await transporter.sendMail(mailOptions);
};

const UPLOAD_BASE = path.join(process.cwd(), "uploads");
function resolveUploadPath(relativePath) {
  return path.join(
    process.cwd(),
    relativePath.replace(/^\/+/, "") // remove leading slash
  );
}

exports.getStatus = async (req, res) => {
  const { customerId } = req.params;

  let kickoff = await prisma.customerKickoff.findFirst({
    where: { customerId: parseInt(customerId) }
  });

  if (!kickoff) {
    kickoff = await prisma.customerKickoff.create({
      data: { customerId: parseInt(customerId) }
    });
  }

  res.json(kickoff);
};


exports.sendMailData = async (req, res) => {
  try {
    const { customerId } = req.body;

    const parsedCustomerId = parseInt(customerId);

    // 1️⃣ Fetch customer details
    const customer = await prisma.customer.findUnique({
      where: { id: parsedCustomerId },
      select: {
        acronisCustomerTenantName: true,
      },
    });

    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    const customerName = customer.acronisCustomerTenantName || "Customer";
    const currentYear = new Date().getFullYear().toString();

    // 2️⃣ Update kickoff status
    await prisma.customerKickoff.updateMany({
      where: { customerId: parsedCustomerId },
      data: { status: "PENDING" },
    });

    // 3️⃣ Generate DOCX
    const docxFile = await generateDocx({
      customerId: parsedCustomerId,
      year: currentYear,
    });

    // 4️⃣ Generate PPT (use acronisCustomerTenantName)
    const pptFile = await generatePpt({
      customerId: parsedCustomerId,
      name: customerName,
    });

    // 5️⃣ Store file paths
    await prisma.customerKickoff.updateMany({
      where: { customerId: parsedCustomerId },
      data: {
        docxPath: docxFile.relativePath,
        pptPath: pptFile.relativePath,
      },
    });

 // 📩 Email Body
const emailBody = `
  <p>Dear ${customerName},</p>

  <p>
    Welcome to <b>Insightz Technology</b>! We’re pleased to have you on board and thank you for choosing us to protect your organization with our Managed Detection and Response (MDR) services powered by Acronis.
  </p>

  <p>
    Our MDR service is designed to strengthen your cybersecurity posture through continuous protection, expert monitoring, and rapid response to threats—helping you stay secure, resilient, and focused on your business.
  </p>

  <p><b>What you can expect from our MDR service:</b></p>
  <ul>
    <li>24/7 threat monitoring and detection powered by Acronis</li>
    <li>Proactive identification and response to cyber threats</li>
    <li>Expert support from our dedicated security operations team</li>
    <li>Rapid incident response to minimize risk and downtime</li>
    <li>Scalable protection tailored to your organization’s needs</li>
  </ul>

  <p><b>Next steps:</b></p>
  <ul>
    <li>A member of our team will contact you to schedule an onboarding session</li>
    <li>You’ll receive documentation and resources to help you get started quickly</li>
  </ul>

  <p>
    If you have any questions at any time, our team is here to support you. We look forward to helping you maintain a strong security posture and providing peace of mind through reliable, expert-driven cybersecurity services.
  </p>

  <p>Welcome to Insightz Technology.</p>

  <p>
    Best regards,<br/>
    <b>Insightz Technology Team</b>
  </p>
`;

    const attachments = [];

    if (pptFile?.relativePath) {
      attachments.push({
        filename:"Customer_Kickoff_Slides.pptx",
        path: resolveUploadPath(pptFile.relativePath),
      });
    }


    await sendMail({
      subject: "Welcome to Insightz MDR Customer Onboarding",
      body: emailBody,
      attachments: attachments
    });

    res.json({
      message: "Kickoff mail prepared",
      status: "PENDING",
      files: {
        docx: docxFile.relativePath,
        ppt: pptFile.relativePath,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Failed to prepare kickoff mail",
      error: err.toString(),
    });
  }
};



exports.completeKickoff = async (req, res) => {
  try {
    const { customerId,providesApis,providesContact } = req.body;

    // if (!req.file) {
    //   return res.status(400).json({
    //     message: "NDA document is required",
    //   });
    // }

    // const docxPath = `/uploads/nda/${req.file.filename}`;

    await prisma.customerKickoff.updateMany({
      where: { customerId: parseInt(customerId) },
      data: {
        status: "COMPLETED",
        // docxPath: docxPath,
        providesApis: Boolean(providesApis === true || providesApis === "true"),
        providesContact: Boolean(providesContact === true || providesContact === "true"),
      },
    });

    res.json({
      message: "Kickoff completed",
      status: "COMPLETED",
      //docxPath,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};
