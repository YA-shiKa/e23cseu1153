const axios = require("axios");

const url = "http://4.224.186.213/evaluation-service/logs";
const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJNYXBDbGFpbXMiOnsiYXVkIjoiaHR0cDovLzIwLjI0NC41Ni4xNDQvZXZhbHVhdGlvbi1zZXJ2aWNlIiwiZW1haWwiOiJlMjNjc2V1MTE1M0BiZW5uZXR0LmVkdS5pbiIsImV4cCI6MTc3ODQ3OTI0NywiaWF0IjoxNzc4NDc4MzQ3LCJpc3MiOiJBZmZvcmQgTWVkaWNhbCBUZWNobm9sb2dpZXMgUHJpdmF0ZSBMaW1pdGVkIiwianRpIjoiMjBkMTZhYjctNDU4MC00NzMwLThhZTYtM2MzZjNjNDExZTE3IiwibG9jYWxlIjoiZW4tSU4iLCJuYW1lIjoibWFsaWdpIHlhc2hpa2EiLCJzdWIiOiJlNzBjODhjZS1jOGQ3LTRlNmEtYjQwNC1jZjQ4MzkxNWIwMDgifSwiZW1haWwiOiJlMjNjc2V1MTE1M0BiZW5uZXR0LmVkdS5pbiIsIm5hbWUiOiJtYWxpZ2kgeWFzaGlrYSIsInJvbGxObyI6ImUyM2NzZXUxMTUzIiwiYWNjZXNzQ29kZSI6IlRmRHhnciIsImNsaWVudElEIjoiZTcwYzg4Y2UtYzhkNy00ZTZhLWI0MDQtY2Y0ODM5MTViMDA4IiwiY2xpZW50U2VjcmV0IjoiYW5BWkZKZEVVSFhXdGRDcSJ9.gvUajlocxE2mgTC02fVtMUE-6_7blSUR7GyHkDNH4Lw";

const stacks = ["backend", "frontend"];
const levels = ["debug", "info", "warn", "error", "fatal"];
const packages = ["cache", "controller", "cron_job", "db", "domain", "handler", "repository", "route", "service"];

async function Log(stack, level, pkg, msg) {
  if (!stacks.includes(stack) || !levels.includes(level) || !packages.includes(pkg)) {
    return null;
  }

  try {
    const res = await axios.post(
      url,
      { stack, level, package: pkg, message: msg },
      { headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" } }
    );
    return res.data;
  } catch (e) {
    return null;
  }
}

module.exports = { Log };
