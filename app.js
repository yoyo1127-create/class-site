(function () {
  const CFG = window.CLASS_CONFIG || {};
  const DEMO = window.DEMO_DATA;
  const SHEET_MODE = Boolean(CFG.sheetId);
  const CAL_MODE = Boolean(CFG.calendarId);
  const DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
  const TODAY = startOfDay(new Date());
  const TODAY_NAME = DAYS[TODAY.getDay()];

  // ---------- עזרים ----------
  function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function safeUrl(u) { return /^https?:\/\//i.test(String(u).trim()) ? String(u).trim() : null; }
  function fmt(d, opts) { return d.toLocaleDateString("he-IL", { timeZone: CFG.timezone, ...opts }); }
  function $(id) { return document.getElementById(id); }

  // תאריך מהגיליון: 5/11/2026, 5.11.2026 או 2026-11-05
  function parseDate(s) {
    s = String(s || "").trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return new Date(+m[1], m[2] - 1, +m[3]);
    m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})/);
    if (m) { let y = +m[3]; if (y < 100) y += 2000; return new Date(y, m[2] - 1, +m[1]); }
    return null;
  }
  const daysFromToday = (d) => Math.round((startOfDay(d) - TODAY) / 86400000);

  // צבע קבוע לכל מקצוע
  const PALETTE = ["#e7f5ff", "#fff4e6", "#ebfbee", "#f3f0ff", "#fff0f6", "#e6fcf5", "#fff9db", "#f1f3f5", "#e3fafc", "#ffe3e3"];
  function subjectColor(name) {
    let h = 0;
    for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return PALETTE[h % PALETTE.length];
  }

  // פענוח CSV (כולל שדות עם פסיקים ומרכאות)
  function parseCSV(text) {
    const rows = []; let row = [], f = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
        else f += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(f); f = ""; }
      else if (c === "\n") { row.push(f); rows.push(row); row = []; f = ""; }
      else if (c !== "\r") f += c;
    }
    if (f !== "" || row.length) { row.push(f); rows.push(row); }
    return rows;
  }

  // ---------- טעינת נתונים ----------
  const cache = {};
  function loadSheet(key) {
    if (!SHEET_MODE) return Promise.resolve(DEMO[key]);
    if (cache[key]) return cache[key];
    const name = CFG.sheets[key];
    const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(CFG.sheetId)}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(name)}`;
    cache[key] = fetch(url)
      .then((r) => { if (!r.ok) throw new Error(); return r.text(); })
      .then((t) => parseCSV(t).filter((r) => r.some((c) => c.trim() !== "")))
      .catch(() => { throw new Error(`לא הצלחנו לטעון את הלשונית "${name}" מה-Google Sheet. בדקו שהשיתוף מוגדר ל"כל מי שיש לו את הקישור" ושהשם של הלשונית נכון.`); });
    return cache[key];
  }

  let eventsPromise;
  function loadEvents() {
    if (!CAL_MODE) return Promise.resolve(DEMO.events.slice().sort((a, b) => a.start.localeCompare(b.start)));
    if (!CFG.apiKey) return Promise.resolve(null); // אין מפתח: נציג את רשימת גוגל המוטמעת
    if (eventsPromise) return eventsPromise;
    const params = new URLSearchParams({
      key: CFG.apiKey, singleEvents: "true", orderBy: "startTime", maxResults: "60",
      timeMin: TODAY.toISOString(), timeZone: CFG.timezone,
    });
    eventsPromise = fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CFG.calendarId)}/events?${params}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data) => (data.items || []).map((e) => ({
        title: e.summary || "(ללא כותרת)",
        start: e.start.dateTime || e.start.date,
        end: e.end && (e.end.dateTime || e.end.date),
        allDay: !e.start.dateTime,
        description: e.description || "",
        location: e.location || "",
      })))
      .catch(() => { throw new Error("לא הצלחנו לטעון את האירועים מהיומן. בדקו שהיומן ציבורי ושמפתח ה-API נכון."); });
    return eventsPromise;
  }

  function calendarEmbedUrl(mode) {
    const p = new URLSearchParams({
      src: CFG.calendarId, ctz: CFG.timezone, hl: "iw", mode,
      showTitle: "0", showPrint: "0", showCalendars: "0", showTz: "0",
    });
    return `https://calendar.google.com/calendar/embed?${p}`;
  }

  function showError(el, err) { el.innerHTML = `<p class="error">${esc(err.message)}</p>`; }

  // ---------- מערכת שעות ----------
  function renderSchedule(rows) {
    const el = $("schedule");
    if (!rows || rows.length < 2) { el.innerHTML = `<p class="empty">מערכת השעות עדיין ריקה.</p>`; return; }
    const [head, ...body] = rows;
    const todayCol = head.findIndex((h) => h.trim() === TODAY_NAME);
    const days = head.slice(1).map((h, i) => ({ name: h.trim(), col: i + 1 })).filter((d) => d.name);

    // טבלה מלאה (מחשב/טאבלט)
    const th = head.map((h, i) => `<th class="${i === todayCol ? "today" : ""}">${esc(h)}${i === todayCol ? " · היום" : ""}</th>`).join("");
    const tr = body.map((r) => {
      if (isBreak(r)) {
        const [label, time] = splitHour(r[0]);
        return `<tr class="break-row"><td class="hour"><bdi dir="ltr">${esc(time)}</bdi></td><td colspan="${head.length - 1}">${esc(label)}</td></tr>`;
      }
      return "<tr>" + head.map((_, i) => {
        const v = (r[i] || "").trim();
        if (i === 0) return `<td class="hour"><bdi dir="ltr">${esc(v)}</bdi></td>`;
        if (!v) return `<td class="blank"></td>`;
        return `<td class="${i === todayCol ? "today" : ""}" style="background:${subjectColor(v)}">${esc(v)}</td>`;
      }).join("") + "</tr>";
    }).join("");

    // תצוגת יום אחד (טלפון)
    const startCol = todayCol > 0 ? todayCol : days[0].col;
    const chips = days.map((d) => `<button class="day-chip${d.col === startCol ? " active" : ""}" data-col="${d.col}">${esc(d.name)}${d.col === todayCol ? " (היום)" : ""}</button>`).join("");

    el.innerHTML = `
      <div class="schedule-desktop table-scroll"><table class="schedule"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>
      <div class="schedule-mobile">
        <div class="day-chips">${chips}</div>
        <ul class="today-list" id="day-list"></ul>
      </div>`;

    const list = $("day-list");
    const showDay = (col) => {
      list.innerHTML = dayLessons(body, col) || `<li class="empty">אין שיעורים ביום הזה.</li>`;
      el.querySelectorAll(".day-chip").forEach((b) => {
        const on = +b.dataset.col === col;
        b.classList.toggle("active", on);
        if (on) b.scrollIntoView({ block: "nearest", inline: "center" });
      });
    };
    el.querySelectorAll(".day-chip").forEach((b) => b.addEventListener("click", () => showDay(+b.dataset.col)));
    showDay(startCol);
  }

  // שורת הפסקה = שורה שבה רק העמודה הראשונה מלאה, למשל "הפסקה · 9:40–9:55"
  function isBreak(r) { return r.slice(1).every((c) => !(c || "").trim()); }
  function splitHour(h) {
    const i = String(h).indexOf("·");
    return i < 0 ? [String(h).trim(), ""] : [h.slice(0, i).trim(), h.slice(i + 1).trim()];
  }

  function dayLessons(body, col) {
    const has = (r) => (r[col] || "").trim();
    const first = body.findIndex(has);
    let last = -1;
    body.forEach((r, i) => { if (has(r)) last = i; });
    if (first < 0) return "";
    return body.slice(first, last + 1).map((r) => {
      if (isBreak(r)) {
        const [label, time] = splitHour(r[0]);
        return `<li class="break-item"><span class="num"><bdi dir="ltr">${esc(time)}</bdi></span><span>${esc(label)}</span></li>`;
      }
      if (!has(r)) return "";
      return `<li style="background:${subjectColor(r[col].trim())}"><span class="num"><bdi dir="ltr">${esc(r[0])}</bdi></span><span>${esc(r[col])}</span></li>`;
    }).join("");
  }

  function renderHomeToday(rows) {
    const el = $("home-today");
    if (!rows || rows.length < 2) { el.innerHTML = `<p class="empty">מערכת השעות עדיין ריקה.</p>`; return; }
    const col = rows[0].findIndex((h) => h.trim() === TODAY_NAME);
    const html = col > 0 ? dayLessons(rows.slice(1), col) : "";
    el.innerHTML = html ? `<ul class="today-list">${html}</ul>` : `<p class="empty">אין לימודים היום 😎</p>`;
  }

  // ---------- אירועים ----------
  function eventDate(e) { return e.allDay ? parseDate(e.start) : new Date(e.start); }

  function eventHtml(e) {
    const d = eventDate(e);
    const diff = daysFromToday(d);
    const when = diff === 0 ? "היום" : diff === 1 ? "מחר" : diff > 1 && diff < 7 ? `בעוד ${diff} ימים` : "";
    let details = [];
    if (!e.allDay) details.push(new Date(e.start).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: CFG.timezone }));
    if (e.allDay && e.end) {
      const last = parseDate(e.end); last.setDate(last.getDate() - 1); // בגוגל תאריך הסיום לא כלול
      if (last > d) details.push(`עד ${fmt(last, { day: "numeric", month: "long" })}`);
    }
    if (e.location) details.push(e.location);
    return `<div class="event">
      <div class="event-date"><span class="day">${d.getDate()}</span><span class="wd">${fmt(d, { weekday: "short" })}</span></div>
      <div class="event-body">
        <h3>${esc(e.title)}${when ? `<span class="badge">${when}</span>` : ""}</h3>
        ${details.length ? `<p>${esc(details.join(" · "))}</p>` : ""}
        ${e.description ? `<p>${esc(e.description.replace(/<[^>]*>/g, " "))}</p>` : ""}
      </div></div>`;
  }

  function renderEvents(events) {
    const el = $("events");
    if (events === null) { // יש יומן אבל אין מפתח API
      el.innerHTML = `<iframe class="calendar-frame" title="אירועים קרובים" src="${esc(calendarEmbedUrl("AGENDA"))}"></iframe>`;
      return;
    }
    if (!events.length) { el.innerHTML = `<p class="empty">אין אירועים קרובים.</p>`; return; }
    let html = "", lastMonth = "";
    for (const e of events) {
      const month = fmt(eventDate(e), { month: "long", year: "numeric" });
      if (month !== lastMonth) { html += `<h3 class="month-title">${esc(month)}</h3>`; lastMonth = month; }
      html += eventHtml(e);
    }
    el.innerHTML = html;
  }

  function renderHomeEvents(events) {
    const el = $("home-events");
    if (events === null) { el.innerHTML = `<p class="empty">ראו בכרטיסייה <a href="#events">אירועים קרובים</a>.</p>`; return; }
    el.innerHTML = events.length ? events.slice(0, 4).map(eventHtml).join("") : `<p class="empty">אין אירועים קרובים.</p>`;
  }

  function renderCalendar() {
    const el = $("calendar");
    if (!CAL_MODE) {
      el.innerHTML = `<div class="placeholder">כאן יופיע יומן הכיתה מ-Google Calendar.<br>מוסיפים את מזהה היומן בקובץ <code>config.js</code> (שדה calendarId).</div>`;
      return;
    }
    const mobile = window.matchMedia("(max-width: 760px)").matches;
    // בטלפון תצוגת חודש של גוגל צפופה מדי, לכן מציגים שבוע
    el.innerHTML = `<iframe class="calendar-frame" title="לוח שנה" src="${esc(calendarEmbedUrl(mobile ? "WEEK" : "MONTH"))}"></iframe>`;
  }

  // ---------- הודעות, שיעורי בית, קישורים ----------
  function renderAnnouncements(rows) {
    const el = $("home-announcements");
    const items = (rows || []).slice(1).filter((r) => (r[1] || r[2] || "").trim());
    items.sort((a, b) => (parseDate(b[0]) || 0) - (parseDate(a[0]) || 0));
    el.innerHTML = items.length ? items.map((r) => `<div class="announcement">
        <span class="date">${esc(r[0])}</span><h3>${esc(r[1])}</h3>${r[2] ? `<p>${esc(r[2])}</p>` : ""}</div>`).join("")
      : `<p class="empty">אין הודעות כרגע.</p>`;
  }

  function renderHomework(rows) {
    const el = $("homework");
    const items = (rows || []).slice(1).filter((r) => (r[1] || "").trim()).map((r) => ({ subject: r[0], task: r[1], dueText: r[2], due: parseDate(r[2]) }));
    items.sort((a, b) => (a.due ? a.due : Infinity) - (b.due ? b.due : Infinity));
    if (!items.length) { el.innerHTML = `<p class="empty">אין שיעורי בית כרגע 🎉</p>`; return; }
    el.innerHTML = items.map((h) => {
      let cls = "", label = h.dueText ? `להגשה: ${h.dueText}` : "";
      if (h.due) {
        const diff = daysFromToday(h.due);
        if (diff < 0) { cls = "late"; label = `עבר מועד ההגשה (${h.dueText})`; }
        else if (diff === 0) { cls = "soon"; label = "להגשה היום!"; }
        else if (diff === 1) { cls = "soon"; label = "להגשה מחר"; }
        else label = `להגשה ${fmt(h.due, { weekday: "long", day: "numeric", month: "numeric" })}`;
      }
      return `<div class="hw${cls === "late" ? " done" : ""}">
        <span class="subject" style="background:${subjectColor(h.subject)}">${esc(h.subject)}</span>
        <div class="task">${esc(h.task)}<div class="due ${cls}">${esc(label)}</div></div></div>`;
    }).join("");
  }

  function renderLinks(rows) {
    const el = $("links");
    const items = (rows || []).slice(1).filter((r) => safeUrl(r[1] || ""));
    el.innerHTML = items.length ? items.map((r) => `<a class="link-card" href="${esc(safeUrl(r[1]))}" target="_blank" rel="noopener">
        <strong>${esc(r[0] || r[1])}</strong>${r[2] ? `<span>${esc(r[2])}</span>` : ""}</a>`).join("")
      : `<p class="empty">אין קישורים עדיין.</p>`;
  }

  // ---------- כרטיסיות ----------
  const loaded = {};
  function run(tab) {
    if (loaded[tab]) return;
    loaded[tab] = true;
    const jobs = {
      home: () => {
        loadSheet("schedule").then(renderHomeToday, (e) => showError($("home-today"), e));
        loadEvents().then(renderHomeEvents, (e) => showError($("home-events"), e));
        loadSheet("announcements").then(renderAnnouncements, (e) => showError($("home-announcements"), e));
      },
      schedule: () => loadSheet("schedule").then(renderSchedule, (e) => showError($("schedule"), e)),
      calendar: renderCalendar,
      events: () => loadEvents().then(renderEvents, (e) => showError($("events"), e)),
      homework: () => loadSheet("homework").then(renderHomework, (e) => showError($("homework"), e)),
      links: () => loadSheet("links").then(renderLinks, (e) => showError($("links"), e)),
    };
    jobs[tab]();
  }

  function showTab(tab) {
    if (!$("tab-" + tab)) tab = "home";
    document.querySelectorAll(".tab").forEach((b) => {
      const on = b.dataset.tab === tab;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", on);
      if (on) b.scrollIntoView({ block: "nearest", inline: "center" });
    });
    document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.id === "tab-" + tab));
    run(tab);
  }

  // ---------- הפעלה ----------
  $("class-name").textContent = CFG.className || "אתר הכיתה";
  document.title = CFG.className || "אתר הכיתה";
  $("school-name").textContent = CFG.schoolName || "";
  $("today-label").textContent = fmt(new Date(), { weekday: "long", day: "numeric", month: "long" });
  if (!SHEET_MODE || !CAL_MODE) $("demo-banner").hidden = false;

  document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => { location.hash = b.dataset.tab; }));
  window.addEventListener("hashchange", () => showTab(location.hash.slice(1)));
  showTab(location.hash.slice(1) || "home");
})();
