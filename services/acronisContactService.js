const axios = require("axios");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

// -------------------------------------------
// ACRONIS API HELPERS
// -------------------------------------------
async function getToken(cred) {
  const url = `${cred.datacenterUrl}/api/2/idp/token`;

  const res = await axios.post(
    url,
    new URLSearchParams({ grant_type: "client_credentials" }),
    {
      auth: {
        username: cred.clientId,
        password: cred.clientSecret,
      },
    }
  );

  return res.data.access_token;
}

async function apiGet(url, token, params = {}) {
  const res = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
    params,
  });
  return res.data;
}

// -------------------------------------------
// CONTACT MAPPER
// -------------------------------------------
function mapContactToDb(contact, partnerTenantId) {
  return {
    apiId: contact.id,
    apiCreatedAt: contact.created_at ? new Date(contact.created_at) : null,
    apiUpdatedAt: contact.updated_at ? new Date(contact.updated_at) : null,

    email: contact.email ?? null,
    address1: contact.address1 ?? null,
    address2: contact.address2 ?? null,
    country: contact.country ?? null,
    state: contact.state ?? null,
    city: contact.city ?? null,
    zipcode: contact.zipcode ?? null,
    phone: contact.phone ?? null,

    firstname: contact.firstname ?? null,
    lastname: contact.lastname ?? null,
    title: contact.title ?? null,
    website: contact.website ?? null,
    industry: contact.industry ?? null,
    organizationSize: contact.organization_size ?? null,

    emailConfirmed: contact.email_confirmed ?? null,
    aan: contact.aan ?? null,
    fax: contact.fax ?? null,
    language: contact.language ?? null,
    types: Array.isArray(contact.types)
      ? contact.types.join(",")
      : contact.types ?? null,

    tenantId: partnerTenantId,
    userId: contact.user_id ?? null,
  };
}

// -------------------------------------------
// MAIN SERVICE
// -------------------------------------------
async function syncContacts(partnerTenantId) {
  // 1️⃣ Credential
  const credential = await prisma.parnterCredential.findFirst({
    where: {
      partnerTenantId,
      active: true,
    },
  });

  if (!credential) {
    throw new Error("No active credential found for this partnerTenantId");
  }

  // 2️⃣ Token
  const token = await getToken(credential);

  // 3️⃣ Contact IDs
  const contactsResponse = await apiGet(
    `${credential.datacenterUrl}/api/2/tenants/${partnerTenantId}/contacts`,
    token
  );

  if (!contactsResponse?.items?.length) {
    return { synced: 0 };
  }

  // 4️⃣ Details + DB
  let count = 0;

  for (const contactId of contactsResponse.items) {
    const contactDetails = await apiGet(
      `${credential.datacenterUrl}/api/2/contacts/${contactId}`,
      token
    );

    const dbData = mapContactToDb(contactDetails, partnerTenantId);

    await prisma.parnterContact.upsert({
      where: { apiId: dbData.apiId },
      update: dbData,
      create: dbData,
    });

    count++;
  }

  return { synced: count };
}

module.exports = {
  syncContacts,
};
