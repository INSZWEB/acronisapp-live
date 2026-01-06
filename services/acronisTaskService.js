const axios = require("axios");
const { PrismaClient } = require("@prisma/client");
const { httpsAgent, normalizeUrl } = require("../utils/httpAgent");

const prisma = new PrismaClient();

/* ==============================
   DB
================================ */
async function getCredentials() {
  return prisma.credential.findMany({
    where: { active: true },
  });
}

/* ==============================
   AUTH
================================ */
async function getToken(cred) {
  const baseUrl = normalizeUrl(cred.datacenterUrl);
  const TOKEN_URL = `${baseUrl}/api/2/idp/token`;

  const res = await axios.post(
    TOKEN_URL,
    new URLSearchParams({ grant_type: "client_credentials" }),
    {
      auth: {
        username: cred.clientId,
        password: cred.clientSecret,
      },
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      httpsAgent,
    }
  );

  return res.data.access_token;
}

/* ==============================
   FETCH HELPERS
================================ */
async function fetchAgents(headers, dcUrl) {
  const url = `${normalizeUrl(dcUrl)}/api/agent_manager/v2/agents`;
  const res = await axios.get(url, { headers, httpsAgent });
  return res.data.items || [];
}

async function fetchResources(headers, dcUrl) {
  const url = `${normalizeUrl(dcUrl)}/api/resource_management/v4/resources`;
  const res = await axios.get(url, {
    headers,
    httpsAgent,
    params: { type: "machine" },
  });
  return res.data.items || [];
}

async function fetchCompletedTasks(headers, resourceId, dcUrl, startDate, endDate) {
  const url = `${normalizeUrl(dcUrl)}/api/task_manager/v2/tasks`;

  const res = await axios.get(url, {
    headers,
    httpsAgent,
    params: {
      resourceId,
      completedAt: `gt(${startDate})`,
      order: "asc(completedAt)",
    },
  });

  return (res.data.items || []).filter(
    (t) =>
      t.state === "completed" &&
      t.completedAt &&
      t.completedAt <= endDate
  );
}

module.exports = {
  getCredentials,
  getToken,
  fetchAgents,
  fetchResources,
  fetchCompletedTasks,
};
