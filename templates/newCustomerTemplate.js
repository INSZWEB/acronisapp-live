const newCustomerSalesTemplate = ({
  customerName,
  partnerName,
}) => `
  <div style="font-family: Arial, sans-serif">
    <h2>📢 New Customer Registered</h2>

    <p>A new customer has been registered in <strong>InsightMDR</strong>.</p>

    <table cellpadding="6" cellspacing="0" border="1">
      <tr><td><strong>Customer Name</strong></td><td>${customerName}</td></tr>
      <tr><td><strong>Partner Name</strong></td><td>${partnerName}</td></tr>
    </table>

    <br/>
    <p>Please follow up with onboarding and commercial steps.</p>

    <p>— InsightMDR System</p>
  </div>
`;

module.exports = { newCustomerSalesTemplate };
