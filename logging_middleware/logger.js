const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const axios = require("axios");

const logUrl = process.env.BASE_URL + "/logs";
const authToken = process.env.TOKEN;

const validStacks = ["backend", "frontend"];
const validLevels = ["debug", "info", "warn", "error", "fatal"];
const validPackages = [
  "cache", "controller", "cron_job", "db", "domain", "handler",
  "repository", "route", "service", "api", "component", "hook",
  "page", "state", "style", "auth", "config", "middleware", "utils"
];

async function Log(stack, level, pkg, msg) {
  if (!validStacks.includes(stack) || !validLevels.includes(level) || !validPackages.includes(pkg)) {
    return null;
  }
  try {
    const result = await axios.post(
      logUrl,
      { stack, level, package: pkg, message: msg },
      { headers: { Authorization: "Bearer " + authToken, "Content-Type": "application/json" } }
    );
    return result.data;
  } catch (err) {
    return null;
  }
}

module.exports = { Log };
