const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const axios = require("axios");
const { Log } = require("../logging_middleware/logger");

const baseUrl = process.env.BASE_URL;
const authToken = process.env.TOKEN;

if (!baseUrl || !authToken) {
  console.error("BASE_URL or TOKEN missing from .env");
  process.exit(1);
}

const reqHeaders = { Authorization: "Bearer " + authToken };

async function fetchDepots() {
  await Log("backend", "info", "service", "fetching depots from api");
  const res = await axios.get(baseUrl + "/depots", { headers: reqHeaders });
  await Log("backend", "info", "service", "received " + res.data.depots.length + " depots");
  return res.data.depots;
}

async function fetchVehicles() {
  await Log("backend", "info", "service", "fetching vehicle tasks from api");
  const res = await axios.get(baseUrl + "/vehicles", { headers: reqHeaders });
  await Log("backend", "info", "service", "received " + res.data.vehicles.length + " tasks");
  return res.data.vehicles;
}

function pickBestTasks(tasks, budget) {
  const count = tasks.length;
  const dp = new Array(budget + 1).fill(0);
  const picked = Array.from({ length: count }, () => new Array(budget + 1).fill(false));

  for (let i = 0; i < count; i++) {
    const dur = tasks[i].Duration;
    const imp = tasks[i].Impact;
    for (let w = budget; w >= dur; w--) {
      if (dp[w - dur] + imp > dp[w]) {
        dp[w] = dp[w - dur] + imp;
        picked[i][w] = true;
      }
    }
  }

  let remaining = budget;
  const chosen = [];
  for (let i = count - 1; i >= 0; i--) {
    if (picked[i][remaining]) {
      chosen.push(tasks[i]);
      remaining -= tasks[i].Duration;
    }
  }

  return { maxImpact: dp[budget], chosen };
}

async function run() {
  await Log("backend", "info", "handler", "vehicle scheduler started");

  let depots, tasks;
  try {
    depots = await fetchDepots();
    tasks = await fetchVehicles();
  } catch (err) {
    await Log("backend", "fatal", "handler", "failed to load data: " + err.message);
    console.error("failed to load data:", err.response?.status, err.response?.data || err.message);
    process.exit(1);
  }

  const results = [];

  for (const depot of depots) {
    await Log("backend", "debug", "service", "processing depot " + depot.ID + " budget=" + depot.MechanicHours);

    const { maxImpact, chosen } = pickBestTasks(tasks, depot.MechanicHours);
    const hoursUsed = chosen.reduce((sum, t) => sum + t.Duration, 0);

    await Log("backend", "info", "service", "depot " + depot.ID + " impact=" + maxImpact + " hours=" + hoursUsed + "/" + depot.MechanicHours);

    results.push({
      depotID: depot.ID,
      budget: depot.MechanicHours,
      hoursUsed,
      totalImpact: maxImpact,
      taskCount: chosen.length,
      tasks: chosen.map((t) => ({
        taskID: t.TaskID,
        duration: t.Duration,
        impact: t.Impact,
      })),
    });
  }

  await Log("backend", "info", "handler", "scheduler completed all depots");

  console.log(JSON.stringify(results, null, 2));
}

run().catch((err) => {
  console.error(err.response?.status, err.response?.data || err.message);
});
