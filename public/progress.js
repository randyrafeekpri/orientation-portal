const root = document.querySelector("#publicProgress");
const token = location.pathname.split("/").filter(Boolean).pop();

loadProgress();

async function loadProgress() {
  try {
    const response = await fetch(`/api/public/${token}`);
    const user = await response.json();
    if (!response.ok) throw new Error(user.error || "Progress page not found");
    render(user);
  } catch (error) {
    root.innerHTML = `
      <p class="eyebrow">Progress Link</p>
      <h1>Link Not Found</h1>
      <p class="public-muted">${escapeHtml(error.message)}</p>
    `;
  }
}

function render(user) {
  root.innerHTML = `
    <div class="public-hero">
      <p class="eyebrow">Orientation Success Path</p>
      <h1>${escapeHtml(user.name)}</h1>
      <p class="public-muted">Recruiter: ${escapeHtml(user.recruiterName || "Not set")} | Field Trainer: ${escapeHtml(user.fieldTrainerName || "Not set")}</p>
      <div class="progress public-progress"><span style="width:${user.progressPercent}%"></span></div>
      <strong>${user.progressPercent}% complete</strong>
    </div>

    <section class="public-section">
      <h2>Checklist</h2>
      <div class="checklist">
        ${user.checklist.map((item, index) => `
          <div class="check-row public-check">
            <span class="status-dot ${item.completedAt ? "done" : ""}">${item.completedAt ? "✓" : index + 1}</span>
            <strong>${escapeHtml(item.label)}</strong>
            <span>${item.completedAt ? `Completed ${escapeHtml(item.completedAt)}` : item.dueDate ? `Due ${escapeHtml(item.dueDate)}` : "Pending"}</span>
          </div>
        `).join("")}
      </div>
    </section>

    <section class="public-section">
      <h2>Appointments</h2>
      <div class="appointments">
        ${user.appointments.map((item) => `
          <div class="appointment">
            <strong>Appointment ${item.number}</strong>
            <span>${escapeHtml(item.name || "Not booked yet")}</span>
            <span>${item.dateTime ? new Date(item.dateTime).toLocaleString() : "Date not set"}</span>
          </div>
        `).join("")}
      </div>
    </section>

    <section class="public-section">
      <h2>Licensing</h2>
      <div class="phase-grid">
        <div class="phase-chip"><p class="eyebrow">Course</p><strong>${escapeHtml(user.licensing.courseDate || "Not scheduled")}</strong></div>
        <div class="phase-chip"><p class="eyebrow">Exam</p><strong>${escapeHtml(user.licensing.examDate || "Not scheduled")}</strong></div>
        <div class="phase-chip"><p class="eyebrow">Study Plan</p><strong>${escapeHtml(user.licensing.weeklyStudyHours || "Not set")}</strong></div>
      </div>
    </section>

    ${user.certificateReady ? `<section class="public-section certificate-ready"><h2>Certificate Ready</h2><p>Your orientation success path is complete. Ask your RVP for the printed certificate.</p></section>` : ""}
    ${user.telegramGroupLink ? `<a class="public-join" href="${attr(user.telegramGroupLink)}">Join Telegram Group</a>` : ""}
  `;
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
