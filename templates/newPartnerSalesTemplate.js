const newPartnerSalesTemplate = ({
  partnerTenantId,
  partnerName,
  contactName,
  contactEmail,
  preferredDate,
  preferredSlot,
  timeZone,
  integrationDate,
}) => `
  <div style="font-family: Arial, sans-serif">
    <h2>🤝 New Partner API Integrated</h2>

    <p>A new partner has successfully integrated with <strong>InsightMDR</strong>.</p>

    <table cellpadding="6" cellspacing="0" border="1">
      <tr><td><strong>Partner Name</strong></td><td>${partnerName || "-"}</td></tr>
      <tr><td><strong>Partner Tenant ID</strong></td><td>${partnerTenantId}</td></tr>
      <tr><td><strong>Contact Name</strong></td><td>${contactName || "-"}</td></tr>
      <tr><td><strong>Contact Email</strong></td><td>${contactEmail || "-"}</td></tr>
      <tr><td><strong>Preferred Date</strong></td><td>${preferredDate || "-"}</td></tr>
      <tr><td><strong>Preferred Slot</strong></td><td>${preferredSlot || "-"}</td></tr>
      <tr><td><strong>Time Zone</strong></td><td>${timeZone || "-"}</td></tr>
      <tr><td><strong>Integration Date</strong></td><td>${integrationDate}</td></tr>
    </table>

    <br/>
    <p>Please follow up with onboarding and commercial steps.</p>

    <p>— InsightMDR System</p>
  </div>
`;

module.exports = { newPartnerSalesTemplate };
