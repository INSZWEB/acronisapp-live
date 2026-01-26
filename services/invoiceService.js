const pdf = require("html-pdf-node"); // ✅ NEW

const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");
const { ERROR_MESSAGES, STATUS_CODES, EMAIL_AUTH, BASE_URL_FRONTEND } = require('../constants/constants');

const prisma = new PrismaClient();
const { createTransporter } = require('../config/mailConfig')

const transporter = createTransporter();
const sendMail = async ({ to, cc, subject, body, attachment }) => {
    const mailOptions = {
        from: process.env.EMAIL_FROM,
        to,               // primary recipients
        //cc,               // optional CC
        subject,          // dynamic subject
        html: body,       // email body (HTML)
        attachments: [
            {
                filename: "invoice.pdf",
                content: attachment,
                contentType: "application/pdf",
            },
        ],
    };

    await transporter.sendMail(mailOptions);
};


const UPLOAD_BASE = path.join(process.cwd(), "uploads", "invoices");

exports.generateMonthlyInvoice = async ({
    customerId,
    reportType,
    downloadMode = "auto",
}) => {

    console.log("🧾 Generating invoice");
    console.log("Customer:", customerId);
    console.log("Report Type:", reportType);
    console.log("Mode:", downloadMode);

    /* ---------------- DATE RANGE ---------------- */
    let start, end;




    // AUTO MODE → calculate date by reportType (FUTURE)
    if (downloadMode === "auto") {
        start = new Date(); // current date
        end = new Date(start); // clone

        switch (reportType) {
            case "1month":
                end.setMonth(start.getMonth() + 1);
                break;

            case "3month":
                end.setMonth(start.getMonth() + 3);
                break;

            case "1year":
                end.setFullYear(start.getFullYear() + 1);
                break;

            default:
                return res.status(400).json({
                    error: "Invalid reportType. Use 1month, 3month, or 1year",
                });
        }
    }

    // MANUAL / FORWARD MODE → use range
    else {
        if (!range?.startDate || !range?.endDate) {
            return res.status(400).json({
                error: "range.startDate and range.endDate are required",
            });
        }

        start = new Date(range.startDate);
        end = new Date(range.endDate);
    }

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({
            error: "Invalid date range",
        });
    }

    console.log("start", start);
    console.log("end", end);


    // ⛔ Prevent duplicate invoice for same customer & period

    const existingInvoice = await prisma.invoice.findFirst({
        where: {
            customerId: Number(customerId),
            startDate: start,
            endDate: end,
            category: "mdr",
            type: "invoice",
        },
    })


    if (existingInvoice) {
        console.log("⏭ Invoice already exists — skipping");
        return {
            skipped: true,
            invoiceId: existingInvoice.id,
        };
    }


    /* ---------------- BILLING MONTH CALCULATION ---------------- */
    const startMonth = new Date(start.getFullYear(), start.getMonth(), 1);
    const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);

    const billingMonths =
        (endMonth.getFullYear() - startMonth.getFullYear()) * 12 +
        (endMonth.getMonth() - startMonth.getMonth()) +
        1; // inclusive


    const formatDate = d =>
        d.toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
        });

    const displayStartDate = formatDate(start);
    const displayEndDate = formatDate(end);


    /* ---------------- CUSTOMER ---------------- */
    const customer = await prisma.customer.findUnique({
        where: { id: Number(customerId) },
        select: {
            partnerTenantId: true,
            partnerTenantName: true,
            acronisCustomerTenantId: true,
            acronisCustomerTenantName: true,
        },
    });

    if (!customer?.acronisCustomerTenantId) {
        throw new Error("Customer not found");
    }


    /* ---------------- CONTACT ---------------- */
    const contact = await prisma.parnterContact.findFirst({
        where: {
            tenantId: customer.partnerTenantId,
            types: "company_billing",
        },
        select: {
            email: true,
            address1: true,
            address2: true,
            city: true,
            zipcode: true,
            state: true,
            country: true,
        },
    });

    const contacts = await prisma.parnterContact.findMany({
        where: {
            tenantId: customer.partnerTenantId,
            OR: [
                { types: { in: ["billing"] } }, // exact matches
                { types: { contains: "billing" } },               // partial matches
            ],
        },
        select: {
            email: true,
        },
    });

    console.log("contacts", contacts)

    const customerAddress = contact
        ? [
            contact.address1,
            contact.address2,
            `${contact.city ?? ""} ${contact.zipcode ?? ""}`.trim(),
            contact.state,
            contact.country,
        ]
            .filter(Boolean)
            .join("<br/>")
        : "N/A";
    /* ---------------- DEVICES ---------------- */
    const whereClause = {
        customerTenantId: customer.acronisCustomerTenantId,
    };

    const devices = await prisma.device.findMany({
        where: whereClause,
    });

    //console.log("devices", devices);



    //console.log("devices",devices)
    const tenantId = customer.acronisCustomerTenantId;

    function formatPolicyType(type) {
        if (!type) return "-";

        const lastPart = type
            .trim()
            .split(".")
            .pop();

        return lastPart
            .split("_")
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ");
    }

    /* ---------------- PLANS (FROM PLAN TABLE) ---------------- */
    const plans = await prisma.plan.findMany({
        where: {
            customerTenantId: tenantId,
            enabled: true,
            agentId: { not: null },
        },
        orderBy: { createdAt: "desc" },
    });


    /* ---------------- POLICIES (FROM POLICY TABLE) ---------------- */
    const policies = await prisma.policy.findMany({
        where: {
            customerTenantId: tenantId,
            enabled: true,
            agentId: { not: null },
        },
        orderBy: { createdAt: "desc" },
    });


    /* ---------------- MAP POLICIES BY AGENT ---------------- */
    const policiesByAgent = policies.reduce((acc, policy) => {
        if (!acc[policy.agentId]) acc[policy.agentId] = [];
        acc[policy.agentId].push(policy);
        return acc;
    }, {});



    //console.log("policies", policies);
    //console.log("plans", plans);
    /* ---------------- PLAN + POLICY HTML ---------------- */
    /* ---------------- ACTIVE PLANS & ENABLED POLICIES ---------------- */

    const plansByName = plans.reduce((acc, plan) => {
        const name = plan.planName || plan.planType || "Unknown Plan";

        if (!acc[name]) {
            acc[name] = [];
        }

        acc[name].push(plan);
        return acc;
    }, {});


    const planPolicyHTML = Object.keys(plansByName).length
        ? Object.entries(plansByName)
            .map(([planDisplayName, planGroup]) => {
                // collect ALL related policies for this plan group
                const allPolicies = planGroup.flatMap(
                    plan => policiesByAgent[plan.agentId] || []
                );

                const policyHTML = allPolicies.length
                    ? [
                        ...new Set(
                            allPolicies.map(p => {
                                if (p.planName?.startsWith("policy.")) {
                                    return formatPolicyType(p.planName);
                                }
                                if (p.planType?.startsWith("policy.")) {
                                    return formatPolicyType(p.planType);
                                }
                                return p.planName || p.planType || "Unknown Policy";
                            })
                        ),
                    ]
                        .map(name => `&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;- ${name}`)
                        .join("<br/>")
                    : "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;- No enabled policies";

                return `
• ${planDisplayName}<br/>
${policyHTML}
`;
            })
            .join("<br/><br/>")
        : "• No active plans";


    /* ---------------- POLICIES ---------------- */
    // const insightPolicies = new Set();
    // devices.forEach(d =>
    //   d.policies.forEach(p => insightPolicies.add(p.policyName))
    // );


    /* ---------------- OS COUNTS ---------------- */
    const osCount = { windows: 0, linux: 0 };

    devices.forEach(d => {
        if (d.osFamily?.toLowerCase() === "windows") osCount.windows++;
        if (d.osFamily?.toLowerCase() === "linux") osCount.linux++;
    });

    const totalDevices = osCount.windows + osCount.linux;

    /* ---------------- PRICING ---------------- */
    const UNIT_PRICE = 6; // per device per month

    const mdrAmount = totalDevices * UNIT_PRICE * billingMonths;


    /* ---------------- ITEMS ---------------- */
    const items = [
        {
            ln: 1,
            partNo: "-",
            title: "Insight MDR Service",
            body: `
    Acronis Cyber Protect Service<br/><br/>

 <strong>Active Plans & Enabled Policies</strong><br/>

${planPolicyHTML}<br/><br/>


    <span class="muted">
      Period: ${displayStartDate} – ${displayEndDate}
    </span>
  `,
            qty: null,
            unitPrice: null,
            amount: null,
        },

        {
            ln: 2,
            partNo: "-",
            title: "Acronis Cyber Protect MDR Monitoring",
            body: `
    Number of Devices (${totalDevices}):<br/>
    • Windows: ${osCount.windows}<br/>
    • Linux: ${osCount.linux}<br/><br/>

    Billing Period:<br/>
    • ${billingMonths} month(s)<br/><br/>

    <span class="muted">
      Period: ${displayStartDate} – ${displayEndDate}
    </span>
  `,
            qty: totalDevices * billingMonths,
            unitPrice: UNIT_PRICE,
            amount: mdrAmount,
        }

    ];

    /* ---------------- TOTALS ---------------- */
    const total = items.reduce((s, i) => s + (i.amount || 0), 0);
    const gst = total * 0.09;
    const grandTotal = total + gst;

    const ROWS_PER_PAGE = 18;
    const page = Math.max(1, Math.ceil(items.length / ROWS_PER_PAGE));

    const invoiceNo = String(Date.now()).slice(-9);

    const invoiceDate = new Date().toISOString().split("T")[0];

    const invoiceData = {
        invoiceNo,
        invoiceDate,
        page,
        customerName: customer.acronisCustomerTenantName,
        customerAddress,
        items,
        total,
        gst,
        grandTotal,
    };

    // Extract all emails, filter out empty/undefined, and remove duplicates
    const emails = Array.from(
        new Set(
            contacts
                .map(contact => contact.email?.trim()) // get email and trim spaces
                .filter(email => email)               // remove empty/undefined
        )
    );

    console.log("emails", emails)

    /* ---------------- HTML ---------------- */
    //const html = `YOUR_HTML_TEMPLATE_HERE`; // 👈 keep your existing HTML exactly

    const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
body {
  font-family: Arial, Helvetica, sans-serif;
  font-size: 12px;
  color: #222;
  margin: 0;
  padding: 12px 16px;
}


p {
  margin: 2px 0;
}

h6 {
  margin: 6px 0;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th, td {
  padding: 8px 6px;
  text-align: left;
  vertical-align: top; /* key fix */
  box-sizing: border-box;
}

thead th {
  font-weight: bold;
  border-bottom: 1px solid #ddd;
}

tbody td {
  border-bottom: 1px solid #f0f0f0;
}

.desc-title {
  font-weight: 600;
}

.desc-body {
  font-size: 12px;
  color: #555;
}

.muted {
  color: #666;
  font-size: 11px;
}

.totals {
  width: 260px;
  margin-top: 10px;
  margin-left: auto;
}

.totals .grand {
  font-weight: bold;
  border-top: 1px solid #eee;
  padding-top: 4px;
}

.footer {
  margin-top: 20px;
  font-size: 11px;
  color: #666;
}
</style>

</head>

<body>
 <table width="100%" style="border: none;">
        <tr>
            <!-- LEFT: LOGO + COMPANY -->
            <td width="75%" style="border: none; vertical-align: top;">
                <img src=${BASE_URL_FRONTEND}assets/logo/Insightzlogo.png
                    style="width:150px; margin-bottom:10px;" />

            </td>

            <!-- RIGHT: INVOICE INFO -->
            <td width="25%" style="border: none; text-align: end; vertical-align: top;">
                <div style="text-align: start; font-size: 13px;">
                    <p style="margin:0;"><b>Insightz Technology Pte Ltd</b></p>
                    <p style="margin:0;">63 Ubi Ave 1 #04-08</p>
                    <p style="margin:0;">Singapore 408937</p>
                    <p style="margin:0;">GST Registration No: 202013305N</p>
                </div>

            </td>

        </tr>
 
    <table width="100%" style="border: none; margin-top:0;padding-top:0;">
      <tr> <td>
 <h6 style="text-align:center; font-size:15px; font-weight:bold; margin:12px 0;">
        TAX INVOICE
    </h6></td>
    </tr>
    </table>

    <table width="100%" style="border: none; margin-top:0;padding-top:0;">
    <tr>
        <!-- LEFT: Customer -->
        <td width="50%" style="border: none; vertical-align: top;">
            <p>
                <strong>Customer:</strong><br />
                ${invoiceData.customerName}<br />
                ${invoiceData.customerAddress}
            </p>
        </td>

        <!-- RIGHT: Invoice Info (aligned right, text left) -->
        <td width="50%" style="border: none; vertical-align: top; text-align: right;">
            <div style="display:inline-block; text-align:left; font-size:13px;">
             <strong>   <p style="margin-right:38px;">
                    Invoice No: ${invoiceData.invoiceNo}<br />
                    Invoice Date: ${invoiceData.invoiceDate}<br />
                    Page: ${invoiceData.page}
                </p></strong>
            </div>
        </td>
    </tr>
    <tr>
        <!-- LEFT: Customer -->
         <td width="50%" style="border: none; vertical-align: top;">
            <p>
                <p>Attn: ${customer?.partnerTenantName} </p><br />
               
            </p>
        </td>

        <!-- RIGHT: Invoice Info (aligned right, text left) -->
       <td width="50%" style="border: none; vertical-align: top; text-align: right;">
            <div style="display:inline-block; text-align:left; font-size:13px;">
   <strong>   <p style="margin-right:38px;">
      PO No:${invoiceNo}<br/>
      Sales: LSD<br/>
      Payment Terms: 30 Days
    </p></strong>
  </div>
</td>

    </tr>
</table>

<table>
<thead>
<tr>
<th>L/N</th>
<th>Part No</th>
<th>Description</th>
<th>Qty</th>
<th>Unit Price</th>
<th>Amount</th>
</tr>
</thead>
<tbody>
${items.map(i => `
<tr>
<td>${i.ln}</td>
<td>${i.partNo}</td>
<td>
  <div class="desc-title">${i.title}</div>
  <div class="desc-body">${i.body}</div>
</td>
<td>${i.qty ?? "-"}</td>
<td>${i.unitPrice != null ? i.unitPrice.toFixed(2) : "-"}</td>
<td>${i.amount != null ? i.amount.toFixed(2) : "-"}</td>
</tr>
`).join("")}
</tbody>
</table>



<table style="width: 35%; margin-left: auto; border-collapse: collapse; margin-top: 6px; text-align: right;">

  <tr>
    <td colspan="4"></td>
    <td style="text-align: right; padding: 6px 5px;"><strong>Total:</strong></td>
    <td style="text-align: right; padding: 6px 5px;"> SGD ${total.toFixed(2)}</td>
  </tr>
  <tr>
    <td colspan="4"></td>
    <td style="text-align: right; padding: 6px 5px;"><strong>GST (9%):</strong></td>
    <td style="text-align: right; padding: 6px 5px;">SGD ${gst.toFixed(2)}</td>
  </tr>
  <tr>
    <td colspan="4"></td>
    <td style="text-align: right; padding: 6px 5px; border-top: 1px solid #eee;">
      <strong>Grand Total:</strong>
    </td>
    <td style="text-align: right; padding: 6px 5px; border-top: 1px solid #eee;">
      <strong> SGD ${grandTotal.toFixed(2)}</strong>
    </td>
  </tr>
</table>
 <table width="100%" style="border: none; margin-top:0;padding-top:0;">
    <tr><td>
  <div >
    <strong>Cheque Payable to Insightz Technology Pte Ltd</strong>
    <p>Interest at 1.5% per month will be imposed on all overdue invoices<br/>
    THIS IS A COMPUTER GENERATED INVOICE. NO SIGNATURE IS REQUIRED

    </p>
    <strong>For electronic payment,</strong><br/>
        <p>
      
Account Name: Insightz Technology Pte Ltd<br/>
Bank Name: United Overseas Bank Limited<br/>
           Bank Address: UOB Plaza, 80 Raffles Place, Singapore 048624<br/>
Account No (SGD) : 357-314-302-5<br/>
Bank Code: 7375<br/>
Branch Code: 001<br/>
Swift Code: UOVBSGSG<br/>
        </p>
    </div></td></tr></table>
</body>
</html>
`;

    console.log("🧾 [1] Starting PDF generation");


    console.log("🧾 [1] Starting PDF generation");

    const file = { content: html };
    const options = { format: "A4", printBackground: true };


    try {
        buffer = await pdf.generatePdf(file, options);
        console.log("✅ [2] PDF generated successfully");
    } catch (err) {
        console.error("❌ PDF generation failed", err);
        throw err;
    }


    /* FILE SAVE */
    const customerFolder = path.join(UPLOAD_BASE, String(customerId));
    if (!fs.existsSync(customerFolder)) {
        fs.mkdirSync(customerFolder, { recursive: true });
    }

    const fileName = `${invoiceNo}.pdf`;
    const filePath = path.join(customerFolder, fileName);
    fs.writeFileSync(filePath, buffer);

    /* DB SAVE */
    const invoiceRecord = await prisma.invoice.create({
        data: {
            customerId: Number(customerId),
            startDate: start,
            endDate: end,
            generated: true,
            category: "mdr",
            type: downloadMode,
            mailto: contact?.email ?? null,
            //mailcc: cc.length ? cc : null,
            terms: 30,
            paymentStatus: "pending",
            invoicePath: {
                fileName,
                path: `uploads/invoices/${customerId}/${fileName}`,
            },
        },
    });

    const cid = parseInt(customerId);
    const devicesCount = parseInt(totalDevices);

    let seats = devicesCount;


    console.log("seats", seats)

    // Function to generate next serial number
    const generateSerialNumber = async () => {
        // Find the latest serial number in the database
        const latestContract = await prisma.customerContract.findFirst({
            orderBy: { createdAt: 'desc' }, // assuming you have createdAt column
            select: { serialNumber: true },
        });

        let nextSerial;

        if (latestContract && latestContract.serialNumber) {
            // Convert latest serial to number, increment by 1
            const current = BigInt(latestContract.serialNumber);
            nextSerial = (current + 1n).toString().padStart(16, '0'); // keep 16 digits
        } else {
            // First serial number
            nextSerial = '1000000000000000';
        }

        return nextSerial;
    };

    // Generate random Installation ID
    const generateInstallationId = () => {
        return Math.floor(1000000000 + Math.random() * 9000000000).toString();
    };

    // Use in upsert
    const result = await prisma.customerContract.upsert({
        where: {
            customerId: cid,
        },
        update: {
            startDate: start,
            endDate: end,
            seats: seats,
        },
        create: {
            customerId: cid,
            startDate: start,
            endDate: end,
            serialNumber: await generateSerialNumber(), // 👈 auto increment
            installationId: generateInstallationId(),   // 👈 random 10-digit
            name: "Insightz Technology",
            seats: devicesCount,
        },
    });
    const disableAutoInvoiceIfExists = async (customerId) => {
        await prisma.autoInvoice.updateMany({
            where: {
                customerId,
            },
            data: {
                automail: false,
                scheduleTiming: null,
            },
        });
    };



    console.log("✅ [5] Invoice saved in DB");
    console.log("🆔 Invoice ID:", invoiceRecord.id);

    /* ---------------- RESPONSE HANDLING ---------------- */
    console.log("🚦 [6] Handling downloadMode:", downloadMode);

    if (downloadMode === "manual") {
        console.log("⬇️ [7] Manual download selected");
        await disableAutoInvoiceIfExists(Number(customerId));
        res.set({
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename=${fileName}`,
            "Content-Length": buffer.length,
        });

        console.log("✅ PDF sent to browser");
        return res.send(buffer);
    }

    if (downloadMode === "auto") {
        console.log("📧 [7] Auto email mode");
        console.log("📤 Sending email to:", contact?.email);
        // console.log("📄 CC:", cc);


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
From: <strong>${start}</strong><br/>
To: <strong>${end}</strong>
</p>

<p>
This invoice has been generated and sent automatically as per your selected billing schedule.
</p>

<p>
If you have any questions or require assistance, please contact our support team.
</p>

<p>
Thank you for choosing <strong>Insightz MDR</strong>.
</p>

<p>
Best regards,<br/>
<strong>Insightz MDR Billing Team</strong>
</p>
`;


        // 1️⃣ Send email
        await sendMail({
            to: emails.join(","),
            //cc,
            subject: "Insightz MDR – Scheduled Invoice",
            body: emailBody,
            attachment: buffer,
        });


        console.log("✅ Email sent successfully");

        // 2️⃣ Save / Update AutoInvoice
        const autoInvoice = await prisma.autoInvoice.upsert({
            where: {
                customerId: Number(customerId), // must be UNIQUE (see note below)
            },
            update: {
                automail: true,
                scheduleTiming: reportType || null,
            },
            create: {
                automail: true,
                scheduleTiming: reportType || null,
                customerId: Number(customerId),
            },
        });

        console.log("🧾 AutoInvoice saved:", autoInvoice.id);

        // 3️⃣ Response
        return {
            success: true,
            invoiceId: invoiceRecord.id,
            emailed: downloadMode === "auto",
        };

    }


    if (downloadMode === "forward") {
        console.log("📨 [7] Forward mode");
        await disableAutoInvoiceIfExists(Number(customerId));
        if (!to) {
            console.warn("⚠️ Missing `to` email");
            return res.status(400).json({ error: "`to` email required" });
        }

        console.log("📤 Forwarding email to:", to);
        //console.log("📄 CC:", cc);

        await sendMail({
            to,
            //cc,
            attachment: buffer,
        });

        console.log("✅ Invoice forwarded successfully");

        return res.json({
            success: true,
            invoiceId: invoiceRecord.id,
            message: "Invoice forwarded successfully",
        });
    }

    console.warn("❌ [7] Invalid downloadMode:", downloadMode);
    return res.status(400).json({ error: "Invalid downloadMode" });


};

