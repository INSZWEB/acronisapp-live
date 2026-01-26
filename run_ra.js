#!/usr/bin/env node
/**
 * ACRONIS MDR – INCIDENT HANDLING (DOC-COMPLIANT)
 *
 * Flow:
 * ✔ Authenticate
 * ✔ List incidents
 * ✔ Select incident
 * ✔ Show AVAILABLE RESPONSE ACTIONS
 * ✔ Perform selected response action (via URI)
 * ✔ Poll response-action status
 */

const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const readline = require("readline");

// ================= CONFIG =================
const DC_URL = "https://sg-cloud.acronis.com";
const CLIENT_ID = "1ab20e84-ff0b-41b4-ab47-4e26fcfc2210";
const CLIENT_SECRET = "i6cdfnapiqbmawqombh7p5e2kmrbysalspi2rc3oeuzdcklphxi4";

const TOKEN_URL = `${DC_URL}/api/2/idp/token`;
const BASE_URL = `${DC_URL}/api/mdr/v1`;
const INCIDENTS_URL = `${BASE_URL}/incidents`;
// =========================================

// ---------- CLI ----------
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
const ask = (q) => new Promise((res) => rl.question(q, res));

// ---------------- AUTH ----------------
async function getToken() {
  console.log("🔐 Authenticating...");
  const res = await axios.post(
    TOKEN_URL,
    new URLSearchParams({ grant_type: "client_credentials" }),
    {
      auth: {
        username: CLIENT_ID,
        password: CLIENT_SECRET,
      },
    }
  );
  console.log("✔ Token acquired\n");
  return res.data.access_token;
}

// ---------- FETCH INCIDENTS ----------
async function fetchIncidents(token) {
  console.log("📥 Fetching incidents...\n");
  const res = await axios.get(INCIDENTS_URL, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data.items || [];
}

// ---------- FETCH INCIDENT DETAILS ----------
async function fetchIncidentDetails(token, incidentId, customerId) {
  const res = await axios.get(`${BASE_URL}/incidents/${incidentId}`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { customer_id: customerId },
  });
  return res.data;
}

// ---------- PERFORM RESPONSE ACTION (URI-BASED) ----------
async function performResponseActionByUri(token, actionUri, customerId) {
  const res = await axios.post(actionUri, null, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": uuidv4(),
    },
    params: {
      customer_id: customerId,
      comment: "Triggered via MDR CLI",
    },
  });

  const activityId = res.data.activity_id;
  console.log("\n✅ Response action triggered");
  console.log(`Activity ID: ${activityId}`);
  return activityId;
}

// ---------- POLL RESPONSE ACTION STATUS ----------
async function pollActionStatus(token, incidentId, customerId, activityId) {
  console.log("\n⏳ Monitoring response action status...\n");

  while (true) {
    const res = await axios.get(
      `${BASE_URL}/incidents/${incidentId}/response_action`,
      {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          customer_id: customerId,
          activity_id: activityId,
        },
      }
    );

    const { status, result_details } = res.data;
    console.log(`[STATUS] ${status}`);
    if (result_details) console.log(`[DETAILS] ${result_details}`);

    if (status === "SUCCEEDED" || status === "FAILED") {
      console.log("\n✅ Response action completed");
      console.log(JSON.stringify(res.data, null, 2));
      return;
    }

    await new Promise((r) => setTimeout(r, 5000));
  }
}

// ---------------- MAIN ----------------
async function main() {
  try {
    const token = await getToken();
    const incidents = await fetchIncidents(token);

    if (!incidents.length) {
      console.log("ℹ No incidents found.");
      return;
    }

    console.log("========== INCIDENT LIST ==========\n");
    incidents.forEach((i, idx) => {
      console.log(`${idx + 1}. Incident ID : ${i.incident_short_id}`);
      console.log(`   Customer ID : ${i.customer_id}`);
      console.log(`   Host        : ${i.host_name}`);
      console.log(`   Severity    : ${i.severity}\n`);
    });

    const choice = Number(await ask("👉 Select incident number: "));
    const selected = incidents[choice - 1];
    if (!selected) {
      console.log("❌ Invalid incident selection");
      return;
    }

    const { incident_id, customer_id } = selected;
    const details = await fetchIncidentDetails(
      token,
      incident_id,
      customer_id
    );

    const responseActions = (details.response_actions || []).filter(
      a => a.display_name && a.action && a.uri
    );

    if (!responseActions.length) {
      console.log("\nℹ No response actions available.");
      return;
    }

    console.log("\n========== AVAILABLE RESPONSE ACTIONS ==========\n");
    responseActions.forEach((a, i) => {
      console.log(`${i + 1}. ${a.display_name} (${a.action})`);
    });

    if ((await ask("\n👉 Perform response action? (y/n): ")) !== "y") {
      console.log("ℹ No action performed.");
      return;
    }

    const actChoice = Number(await ask("Select action number: "));
    const selectedAction = responseActions[actChoice - 1];

    if (!selectedAction) {
      console.log("❌ Invalid action selection");
      return;
    }

    const activityId = await performResponseActionByUri(
      token,
      selectedAction.uri,
      customer_id
    );

    await pollActionStatus(
      token,
      incident_id,
      customer_id,
      activityId
    );

    console.log("\n✅ INCIDENT HANDLING COMPLETE");
  } catch (err) {
    console.error("❌ Error:", err.response?.data || err.message);
  } finally {
    rl.close();
  }
}

main();
