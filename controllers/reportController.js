const pdf = require("html-pdf");

// Controller function for generating customer report
const generateCustomerReport = async (req, res) => {
    try {
        // Static fallback data
        const invoiceData = req.body && Object.keys(req.body).length ? req.body : {
            invoiceNo: "INV-1001",
            invoiceDate: "2025-12-26",
            page: 1,
            customerName: "John Doe",
            customerAddress: "123 Orchard Road, Singapore 238890",
            items: [
                { partNo: "P001", description: "Laptop Dell Inspiron", qty: 2, unitPrice: 1200.00, amount: 2400.00 },
                { partNo: "P002", description: "Wireless Mouse Logitech", qty: 3, unitPrice: 50.00, amount: 150.00 },
                { partNo: "P003", description: "Keyboard Mechanical", qty: 1, unitPrice: 100.00, amount: 100.00 }
            ],
            total: 2650.00,
            gst: 238.50,
            grandTotal: 2888.50
        };

        if (!Array.isArray(invoiceData.items)) {
            return res.status(400).send("Invalid invoice data: 'items' array is required");
        }

        // HTML template
        const html = `
        <!DOCTYPE html>
<html>

<head>
    <meta charset="utf-8" />
    <style>
        body {
            font-family: Arial, sans-serif;
            font-size: 12px;
        }

        .header {
            display: flex;
            justify-content: space-between;
        }

        .logo {
            width: 150px;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
        }

        th,
        td {
            border: 1px solid #000;
            padding: 6px;
        }

        th {
            background: #f2f2f2;
        }

        .right {
            text-align: right;
            margin-top: 15px;
        }
    </style>
</head>

<body>
    <table width="100%" style="border: none;">
        <tr>
            <!-- LEFT: LOGO + COMPANY -->
            <td width="75%" style="border: none; vertical-align: top;">
                <img src="http://localhost:3000/assets/logo/Insightzlogo.png"
                    style="width:200px; margin-bottom:10px;" />

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
    </table>
    <h6 style="text-align:center; font-size:15px; font-weight:bold; margin:12px 0;">
        TAX INVOICE
    </h6>

    <table width="100%" style="border: none;">
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
                <p style="margin:0;">
                    Invoice No: ${invoiceData.invoiceNo}<br />
                    Invoice Date: ${invoiceData.invoiceDate}<br />
                    Page: ${invoiceData.page}
                </p>
            </div>
        </td>
    </tr>
</table>
<table width="100%" style="border: none;">
    <tr>
        <!-- LEFT: Customer -->
        <td width="50%" style="border: none; vertical-align: top;">
            <p>
                <p>Attn: Sylvia Tan/ Sae Hong </p><br />
                <strong>Delivery:</strong>
                <p>
                Banyan Tree Hotels & Resorts Pte Ltd<br/>
211 Upper Bukit Timah Road
</p>
            </p>
        </td>

        <!-- RIGHT: Invoice Info (aligned right, text left) -->
        <td width="50%" style="border: none; vertical-align: top; text-align: right;">
            <div style="display:inline-block; text-align:left; font-size:13px;">
                <p style="margin:0;">
                   PO No:202508148081227<br />
                    Sales:LSD<br />
                   Payment Terms: 30 Days
                </p>
            </div>
        </td>
    </tr>
</table>

    </div>
    <table>
        <thead>
            <tr>
                <th>L/N No</th>
                <th>Part No</th>
                <th>Description</th>
                <th>Qty</th>
                <th>Unit Price</th>
                <th>Amount</th>
            </tr>
        </thead>
        <tbody>
            ${invoiceData.items.map((item, idx) => `
            <tr>
                <td>${idx + 1}</td>
                <td>${item.partNo}</td>
                <td>${item.description}</td>
                <td>${item.qty}</td>
                <td>${item.unitPrice.toFixed(2)}</td>
                <td>${item.amount.toFixed(2)}</td>
            </tr>
            `).join("")}
        </tbody>
    </table>

    <div class="right">
        <p>
            Total: SGD ${invoiceData.total.toFixed(2)}<br />
            GST 9%: ${invoiceData.gst.toFixed(2)}<br />
            <strong>Grand Total: ${invoiceData.grandTotal.toFixed(2)}</strong>
        </p>
    </div>
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
    </div>
</body>

</html>
        `;

        // PDF options
        const options = {
            format: "A4",
            border: {
                top: "10mm",
                right: "10mm",
                bottom: "10mm",
                left: "10mm"
            }
        };

        // Generate PDF buffer
        pdf.create(html, options).toBuffer((err, buffer) => {
            if (err) {
                console.error(err);
                return res.status(500).send("PDF generation failed");
            }

            res.set({
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename=invoice_${invoiceData.invoiceNo}.pdf`,
                "Content-Length": buffer.length
            });

            res.send(buffer);
        });

    } catch (err) {
        console.error(err);
        res.status(500).send("Error generating PDF");
    }
};

module.exports = { generateCustomerReport };
