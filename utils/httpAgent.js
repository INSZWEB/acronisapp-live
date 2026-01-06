const https = require("https");

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 10,
});

const normalizeUrl = (url) => url.replace(/\/+$/, "");

module.exports = {
  httpsAgent,
  normalizeUrl,
};
