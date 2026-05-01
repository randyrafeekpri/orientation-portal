const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

loadDotEnv();

const PORT = Number(process.env.PORT || 4173);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "portal.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

const defaultStore = {
  users: [],
  settings: {
    rvpName: "",
    rvpTelegramChatId: process.env.RVP_CHAT_ID || "",
    dailyDigestTime: process.env.DAILY_DIGEST_TIME || "18:00",
    telegramGroupLink: ""
  },
  messageLog: []
};

ensureStore();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    serveStatic(req, res, url);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Server error" });
  }
});

server.listen(PORT, () => {
  console.log(`Orientation portal running at http://localhost:${PORT}`);
});

setInterval(sendScheduledDigestIfDue, 60 * 1000);

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true, service: "orientation-success-portal" });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/state") {
    sendJson(res, 200, readStore());
    return;
  }

  const publicMatch = url.pathname.match(/^\/api\/public\/([^/]+)$/);
  if (publicMatch && req.method === "GET") {
    const store = readStore();
    const user = store.users.find((item) => item.shareToken === publicMatch[1]);
    if (!user) return sendJson(res, 404, { error: "Progress page not found" });
    sendJson(res, 200, publicUser(user, store.settings));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/settings") {
    const body = await readBody(req);
    const store = readStore();
    store.settings = { ...store.settings, ...body };
    writeStore(store);
    sendJson(res, 200, store.settings);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/users") {
    const body = await readBody(req);
    const store = readStore();
    const now = new Date().toISOString();
    const user = {
      id: crypto.randomUUID(),
      shareToken: crypto.randomBytes(18).toString("hex"),
      createdAt: now,
      updatedAt: now,
      status: "active",
      name: body.name || "New Associate",
      email: body.email || "",
      phone: body.phone || "",
      telegramChatId: body.telegramChatId || "",
      recruiterName: body.recruiterName || "",
      recruiterTelegramChatId: body.recruiterTelegramChatId || "",
      fieldTrainerName: body.fieldTrainerName || "",
      fieldTrainerTelegramChatId: body.fieldTrainerTelegramChatId || "",
      why: body.why || "",
      notes: body.notes || "",
      checklist: defaultChecklist(),
      appointments: Array.from({ length: 8 }, (_, index) => ({
        id: `appointment-${index + 1}`,
        name: "",
        dateTime: "",
        status: "open"
      })),
      licensing: {
        courseDate: "",
        examDate: "",
        weeklyStudyHours: ""
      }
    };
    store.users.unshift(user);
    writeStore(store);
    sendJson(res, 201, user);
    return;
  }

  const userMatch = url.pathname.match(/^\/api\/users\/([^/]+)$/);
  if (userMatch && req.method === "PUT") {
    const body = await readBody(req);
    const store = readStore();
    const user = store.users.find((item) => item.id === userMatch[1]);
    if (!user) return sendJson(res, 404, { error: "User not found" });
    Object.assign(user, body, { updatedAt: new Date().toISOString() });
    writeStore(store);
    sendJson(res, 200, user);
    return;
  }

  if (userMatch && req.method === "DELETE") {
    const store = readStore();
    const before = store.users.length;
    store.users = store.users.filter((item) => item.id !== userMatch[1]);
    writeStore(store);
    sendJson(res, before === store.users.length ? 404 : 200, { ok: true });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/messages/send") {
    const body = await readBody(req);
    const result = await sendTelegramMessage(body.chatId, body.text);
    const store = readStore();
    store.messageLog.unshift({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      chatId: body.chatId,
      text: body.text,
      ok: result.ok,
      error: result.error || ""
    });
    store.messageLog = store.messageLog.slice(0, 100);
    writeStore(store);
    sendJson(res, result.ok ? 200 : 400, result);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/digest/send") {
    const store = readStore();
    const digest = buildDailyDigest(store);
    const chatIds = collectDigestRecipients(store);
    const results = [];
    for (const chatId of chatIds) {
      results.push(await sendTelegramMessage(chatId, digest));
    }
    store.messageLog.unshift({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      chatId: chatIds.join(", "),
      text: digest,
      ok: results.every((item) => item.ok),
      error: results.filter((item) => !item.ok).map((item) => item.error).join("; ")
    });
    store.messageLog = store.messageLog.slice(0, 100);
    writeStore(store);
    sendJson(res, 200, { digest, results });
    return;
  }

  sendJson(res, 404, { error: "Not found" });
}

function serveStatic(req, res, url) {
  let filePath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  if (filePath.startsWith("/progress/")) filePath = "/progress.html";
  filePath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, "");
  const abs = path.join(PUBLIC_DIR, filePath);
  if (!abs.startsWith(PUBLIC_DIR)) return sendText(res, 403, "Forbidden");
  fs.readFile(abs, (err, data) => {
    if (err) return sendText(res, 404, "Not found");
    res.writeHead(200, { "Content-Type": MIME[path.extname(abs)] || "application/octet-stream" });
    res.end(data);
  });
}

function defaultChecklist() {
  return [
    { id: "orientation", label: "Complete 30-minute orientation", dueDate: today(), completedAt: today(), notes: "" },
    { id: "top25", label: "Build the Top 25 warm market list", dueDate: "", completedAt: "", notes: "" },
    { id: "personal-fna", label: "Schedule personal FNA", dueDate: "", completedAt: "", notes: "" },
    { id: "appointments", label: "Book 8 field training appointments", dueDate: "", completedAt: "", notes: "" },
    { id: "licensing", label: "Schedule pre-license course and state exam", dueDate: "", completedAt: "", notes: "" }
  ];
}

function publicUser(user, settings) {
  return {
    name: user.name,
    recruiterName: user.recruiterName,
    fieldTrainerName: user.fieldTrainerName,
    why: user.why,
    checklist: user.checklist,
    appointments: user.appointments.map((item, index) => ({
      number: index + 1,
      name: item.name,
      dateTime: item.dateTime,
      status: item.status
    })),
    licensing: user.licensing,
    progressPercent: Math.round((user.checklist.filter((item) => item.completedAt).length / user.checklist.length) * 100),
    certificateReady: user.checklist.every((item) => item.completedAt),
    telegramGroupLink: settings.telegramGroupLink || "",
    rvpName: settings.rvpName || ""
  };
}

function buildDailyDigest(store) {
  const lines = [`Daily Orientation Success Digest - ${new Date().toLocaleDateString()}`, ""];
  if (!store.users.length) lines.push("No active associates yet.");
  for (const user of store.users) {
    const completed = user.checklist.filter((item) => item.completedAt).length;
    const booked = user.appointments.filter((item) => item.dateTime).length;
    const nextOpen = user.checklist.find((item) => !item.completedAt);
    lines.push(`${user.name}: ${completed}/5 checklist, ${booked}/8 appointments`);
    lines.push(`Recruiter: ${user.recruiterName || "Not set"} | Trainer: ${user.fieldTrainerName || "Not set"}`);
    lines.push(`Next step: ${nextOpen ? nextOpen.label : "Certificate ready"}`);
    if (user.licensing.examDate) lines.push(`Exam target: ${user.licensing.examDate}`);
    lines.push("");
  }
  return lines.join("\n").trim();
}

function collectDigestRecipients(store) {
  const ids = new Set();
  if (store.settings.rvpTelegramChatId) ids.add(store.settings.rvpTelegramChatId);
  for (const user of store.users) {
    if (user.recruiterTelegramChatId) ids.add(user.recruiterTelegramChatId);
    if (user.fieldTrainerTelegramChatId) ids.add(user.fieldTrainerTelegramChatId);
  }
  return [...ids];
}

async function sendTelegramMessage(chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, error: "TELEGRAM_BOT_TOKEN is not set." };
  if (!chatId) return { ok: false, error: "Telegram chat ID is missing." };
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, error: payload.description || response.statusText };
  return { ok: true, payload };
}

function sendScheduledDigestIfDue() {
  const store = readStore();
  const time = store.settings.dailyDigestTime || "18:00";
  const now = new Date();
  const hhmm = now.toTimeString().slice(0, 5);
  const todayKey = now.toISOString().slice(0, 10);
  if (hhmm !== time || store.settings.lastDigestSentDate === todayKey) return;
  store.settings.lastDigestSentDate = todayKey;
  writeStore(store);
  const digest = buildDailyDigest(store);
  collectDigestRecipients(store).forEach((chatId) => {
    sendTelegramMessage(chatId, digest).catch((error) => console.error(error));
  });
}

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) writeStore(defaultStore);
}

function readStore() {
  const store = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  let changed = false;
  for (const user of store.users || []) {
    if (!user.shareToken) {
      user.shareToken = crypto.randomBytes(18).toString("hex");
      changed = true;
    }
  }
  if (changed) writeStore(store);
  return store;
}

function writeStore(store) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function loadDotEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}
