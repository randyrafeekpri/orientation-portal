let state = { users: [], settings: {}, messageLog: [] };
let currentUserId = "";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

init();

async function init() {
  bindNavigation();
  bindForms();
  await loadState();
}

function bindNavigation() {
  $$(".tab").forEach((button) => {
    button.addEventListener("click", () => {
      $$(".tab").forEach((item) => item.classList.toggle("is-active", item === button));
      $$(".view").forEach((view) => view.classList.toggle("is-active", view.id === button.dataset.view));
    });
  });
}

function bindForms() {
  $("#addUserForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.target).entries());
    const user = await api("/api/users", { method: "POST", body });
    currentUserId = user.id;
    event.target.reset();
    await loadState();
    showView("associate");
  });

  $("#settingsForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.target).entries());
    await api("/api/settings", { method: "POST", body });
    await loadState();
  });

  $("#messageForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.target).entries());
    const result = await api("/api/messages/send", { method: "POST", body, softFail: true });
    alert(result.ok ? "Message sent." : result.error);
    await loadState();
  });

  $("#sendDigest").addEventListener("click", async () => {
    const result = await api("/api/digest/send", { method: "POST", body: {}, softFail: true });
    alert(result.results?.every((item) => item.ok) ? "Digest sent." : "Digest created. Check Telegram setup for any failed sends.");
    await loadState();
  });

  $("#userSelect").addEventListener("change", (event) => {
    currentUserId = event.target.value;
    render();
  });

  $("#printCertificate").addEventListener("click", () => {
    const user = currentUser();
    if (!user) return;
    const complete = user.checklist.every((item) => item.completedAt);
    if (!complete) {
      alert("Complete all five success steps before generating the certificate.");
      return;
    }
    renderCertificate(user);
    window.print();
  });
}

async function loadState() {
  state = await api("/api/state");
  if (!currentUserId && state.users[0]) currentUserId = state.users[0].id;
  render();
}

function render() {
  renderMetrics();
  renderUserList();
  renderUserSelect();
  renderAssociate();
  renderSettings();
  renderDigest();
  renderMessageLog();
}

function renderMetrics() {
  const users = state.users;
  const completedUsers = users.filter((user) => user.checklist.every((item) => item.completedAt)).length;
  const appointments = users.reduce((sum, user) => sum + user.appointments.filter((item) => item.dateTime).length, 0);
  const exams = users.filter((user) => user.licensing.examDate).length;
  $("#metrics").innerHTML = [
    metric("Associates", users.length),
    metric("Certified", completedUsers),
    metric("Booked Appts", appointments),
    metric("Exam Dates", exams)
  ].join("");
}

function metric(label, value) {
  return `<div class="metric"><strong>${value}</strong><span>${label}</span></div>`;
}

function renderUserList() {
  $("#userList").innerHTML = state.users.map((user) => {
    const percent = progressPercent(user);
    return `
      <article class="user-card">
        <div>
          <strong>${escapeHtml(user.name)}</strong>
          <p>${escapeHtml(user.recruiterName || "Recruiter not set")} | ${escapeHtml(user.fieldTrainerName || "Trainer not set")}</p>
          <div class="progress" aria-label="${percent}% complete"><span style="width:${percent}%"></span></div>
        </div>
        <div class="card-actions">
          <button type="button" data-open="${user.id}">Open</button>
          <button type="button" data-copy-link="${user.id}">Copy Link</button>
        </div>
      </article>
    `;
  }).join("") || `<p class="muted">No associates yet. Create the first dashboard to begin.</p>`;

  $$("[data-open]").forEach((button) => {
    button.addEventListener("click", () => {
      currentUserId = button.dataset.open;
      render();
      showView("associate");
    });
  });
  $$("[data-copy-link]").forEach((button) => {
    button.addEventListener("click", async () => {
      const user = state.users.find((item) => item.id === button.dataset.copyLink);
      const link = progressLink(user);
      await copyText(link);
      alert(`Progress link copied:\n${link}`);
    });
  });
}

function renderUserSelect() {
  $("#userSelect").innerHTML = state.users.map((user) => (
    `<option value="${user.id}" ${user.id === currentUserId ? "selected" : ""}>${escapeHtml(user.name)}</option>`
  )).join("");
}

function renderAssociate() {
  const user = currentUser();
  if (!user) {
    $("#associateSummary").innerHTML = `<div class="summary-box">Create an associate dashboard first.</div>`;
    $("#associateEditor").innerHTML = "";
    return;
  }

  const percent = progressPercent(user);
  $("#associateSummary").innerHTML = `
    <div class="summary-box">
      <h3>${escapeHtml(user.name)}</h3>
      <p>${percent}% complete</p>
      <div class="progress"><span style="width:${percent}%"></span></div>
      <p>Recruiter: ${escapeHtml(user.recruiterName || "Not set")}</p>
      <p>Trainer: ${escapeHtml(user.fieldTrainerName || "Not set")}</p>
      <p><a class="inline-link" href="${attr(progressLink(user))}" target="_blank" rel="noreferrer">View associate link</a></p>
    </div>
  `;

  $("#associateEditor").innerHTML = `
    <div class="section-head">
      <div>
        <p class="eyebrow">Success Path</p>
        <h2>${escapeHtml(user.name)} Dashboard</h2>
      </div>
      <div class="card-actions">
        <button type="button" data-copy-current-link>Copy User Link</button>
        <button type="button" data-save-user>Save Progress</button>
      </div>
    </div>
    <div class="phase-grid">
      ${user.checklist.map((item, index) => `
        <div class="phase-chip ${item.completedAt ? "done" : ""}">
          <p class="eyebrow">Step ${index + 1}</p>
          <strong>${escapeHtml(item.label)}</strong>
        </div>
      `).join("")}
    </div>
    <form id="userEditForm" class="grid-form">
      <label>Name<input name="name" value="${attr(user.name)}"></label>
      <label>Telegram Chat ID<input name="telegramChatId" value="${attr(user.telegramChatId)}"></label>
      <label class="full">Why<textarea name="why">${escapeHtml(user.why)}</textarea></label>
      <label class="full">Notes<textarea name="notes">${escapeHtml(user.notes)}</textarea></label>
      <label>Pre-license Course<input name="courseDate" type="date" value="${attr(user.licensing.courseDate)}"></label>
      <label>State Exam Target<input name="examDate" type="date" value="${attr(user.licensing.examDate)}"></label>
      <label class="full">Weekly Study Hours<input name="weeklyStudyHours" value="${attr(user.licensing.weeklyStudyHours)}" placeholder="Example: Mon/Wed/Fri 7-9 PM"></label>
    </form>
    <h3>Checklist</h3>
    <div class="checklist">
      ${user.checklist.map((item) => `
        <div class="check-row">
          <input type="checkbox" data-check="${item.id}" ${item.completedAt ? "checked" : ""} aria-label="${attr(item.label)}">
          <strong>${escapeHtml(item.label)}</strong>
          <label>Due<input type="date" data-due="${item.id}" value="${attr(item.dueDate)}"></label>
        </div>
      `).join("")}
    </div>
    <h3 style="margin-top:22px">Eight Appointment Table</h3>
    <div class="appointments">
      ${user.appointments.map((item, index) => `
        <div class="appointment">
          <strong>Appointment ${index + 1}</strong>
          <input data-appt-name="${item.id}" value="${attr(item.name)}" placeholder="Client or household name">
          <input data-appt-time="${item.id}" type="datetime-local" value="${attr(item.dateTime)}">
        </div>
      `).join("")}
    </div>
  `;

  $("[data-save-user]").addEventListener("click", saveCurrentUser);
  $("[data-copy-current-link]").addEventListener("click", async () => {
    const link = progressLink(user);
    await copyText(link);
    alert(`Progress link copied:\n${link}`);
  });
}

async function saveCurrentUser() {
  const user = currentUser();
  if (!user) return;
  const formData = Object.fromEntries(new FormData($("#userEditForm")).entries());
  const checklist = user.checklist.map((item) => {
    const checked = $(`[data-check="${item.id}"]`).checked;
    return {
      ...item,
      dueDate: $(`[data-due="${item.id}"]`).value,
      completedAt: checked ? item.completedAt || today() : ""
    };
  });
  const appointments = user.appointments.map((item) => ({
    ...item,
    name: $(`[data-appt-name="${item.id}"]`).value,
    dateTime: $(`[data-appt-time="${item.id}"]`).value
  }));
  await api(`/api/users/${user.id}`, {
    method: "PUT",
    body: {
      name: formData.name,
      telegramChatId: formData.telegramChatId,
      why: formData.why,
      notes: formData.notes,
      checklist,
      appointments,
      licensing: {
        courseDate: formData.courseDate,
        examDate: formData.examDate,
        weeklyStudyHours: formData.weeklyStudyHours
      }
    }
  });
  await loadState();
}

function renderSettings() {
  const form = $("#settingsForm");
  form.rvpName.value = state.settings.rvpName || "";
  form.rvpTelegramChatId.value = state.settings.rvpTelegramChatId || "";
  form.dailyDigestTime.value = state.settings.dailyDigestTime || "18:00";
  form.telegramGroupLink.value = state.settings.telegramGroupLink || "";
}

function renderDigest() {
  const lines = [`Daily Orientation Success Digest - ${new Date().toLocaleDateString()}`, ""];
  if (!state.users.length) lines.push("No active associates yet.");
  state.users.forEach((user) => {
    const completed = user.checklist.filter((item) => item.completedAt).length;
    const booked = user.appointments.filter((item) => item.dateTime).length;
    const nextOpen = user.checklist.find((item) => !item.completedAt);
    lines.push(`${user.name}: ${completed}/5 checklist, ${booked}/8 appointments`);
    lines.push(`Recruiter: ${user.recruiterName || "Not set"} | Trainer: ${user.fieldTrainerName || "Not set"}`);
    lines.push(`Next step: ${nextOpen ? nextOpen.label : "Certificate ready"}`);
    if (user.licensing.examDate) lines.push(`Exam target: ${user.licensing.examDate}`);
    lines.push("");
  });
  $("#digestPreview").textContent = lines.join("\n").trim();
}

function renderMessageLog() {
  $("#messageLog").innerHTML = (state.messageLog || []).slice(0, 8).map((item) => `
    <div>${item.ok ? "Sent" : "Failed"} - ${new Date(item.createdAt).toLocaleString()} - ${escapeHtml(item.error || item.chatId || "")}</div>
  `).join("");
}

function renderCertificate(user) {
  $("#certificate").innerHTML = `
    <div class="certificate-page">
      <div>
        <p class="eyebrow">Orientation Success Portal</p>
        <h2>Certificate of Completion</h2>
        <p>This certifies that</p>
        <div class="name">${escapeHtml(user.name)}</div>
        <p>completed the 5-step orientation success path, booked the launch plan, and is ready for field training momentum.</p>
        <p style="margin-top:34px">Completed on ${new Date().toLocaleDateString()}</p>
        <p>RVP: ${escapeHtml(state.settings.rvpName || "RVP")}</p>
      </div>
    </div>
  `;
}

function currentUser() {
  return state.users.find((user) => user.id === currentUserId) || state.users[0];
}

function progressPercent(user) {
  if (!user) return 0;
  return Math.round((user.checklist.filter((item) => item.completedAt).length / user.checklist.length) * 100);
}

function progressLink(user) {
  return `${window.location.origin}/progress/${user.shareToken}`;
}

async function copyText(text) {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function showView(id) {
  const tab = $(`.tab[data-view="${id}"]`);
  if (tab) tab.click();
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: { "Content-Type": "application/json" },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const payload = await response.json();
  if (!response.ok && !options.softFail) throw new Error(payload.error || "Request failed");
  return payload;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function attr(value = "") {
  return escapeHtml(value);
}
