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

const typeWeight = { Placement: 3, Result: 2, Event: 1 };

function calcScore(notification) {
  const w = typeWeight[notification.Type] || 0;
  const ts = new Date(notification.Timestamp).getTime();
  return w * 1e13 + ts;
}

function getTopN(notifications, n) {
  const heap = [];

  function bubbleUp(idx) {
    while (idx > 0) {
      const parent = Math.floor((idx - 1) / 2);
      if (heap[parent].score > heap[idx].score) {
        [heap[parent], heap[idx]] = [heap[idx], heap[parent]];
        idx = parent;
      } else break;
    }
  }

  function sinkDown(idx) {
    while (true) {
      let smallest = idx;
      const left = 2 * idx + 1;
      const right = 2 * idx + 2;
      if (left < heap.length && heap[left].score < heap[smallest].score) smallest = left;
      if (right < heap.length && heap[right].score < heap[smallest].score) smallest = right;
      if (smallest === idx) break;
      [heap[smallest], heap[idx]] = [heap[idx], heap[smallest]];
      idx = smallest;
    }
  }

  function pushItem(item) {
    heap.push(item);
    bubbleUp(heap.length - 1);
  }

  function popItem() {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length > 0) {
      heap[0] = last;
      sinkDown(0);
    }
    return top;
  }

  for (const notif of notifications) {
    const entry = { ...notif, score: calcScore(notif) };
    if (heap.length < n) {
      pushItem(entry);
    } else if (entry.score > heap[0].score) {
      popItem();
      pushItem(entry);
    }
  }

  return heap.sort((a, b) => b.score - a.score);
}

async function fetchNotifications() {
  await Log("backend", "info", "service", "fetching notifications from api");
  const res = await axios.get(baseUrl + "/notifications", { headers: reqHeaders });
  await Log("backend", "info", "service", "received " + res.data.notifications.length + " notifications");
  return res.data.notifications;
}

async function run() {
  await Log("backend", "info", "handler", "priority inbox started");

  let allNotifications;
  try {
    allNotifications = await fetchNotifications();
  } catch (err) {
    await Log("backend", "fatal", "handler", "failed to fetch notifications: " + err.message);
    process.exit(1);
  }

  await Log("backend", "debug", "handler", "computing top 10 from " + allNotifications.length + " notifications");

  const top10 = getTopN(allNotifications, 10);

  await Log("backend", "info", "handler", "top 10 notifications computed");

  const output = top10.map(({ score, ...rest }) => rest);
  console.log(JSON.stringify(output, null, 2));
}

run().catch((err) => {
  console.error(err.message);
});
