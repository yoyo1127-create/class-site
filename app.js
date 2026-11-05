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

  // ---------- תאריך עברי ----------
  // מספר באותיות עבריות: 25 → כ״ה, 787 → תשפ״ז, 15 → ט״ו
  function gematria(n) {
    const ones = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"];
    const tens = ["", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ"];
    const hundreds = ["", "ק", "ר", "ש", "ת"];
    let out = "";
    let h = Math.floor(n / 100);
    while (h > 4) { out += "ת"; h -= 4; }
    out += hundreds[h];
    const rest = n % 100;
    if (rest === 15) out += "טו";
    else if (rest === 16) out += "טז";
    else out += tens[Math.floor(rest / 10)] + ones[rest % 10];
    return out.length === 1 ? out + "׳" : out.slice(0, -1) + "״" + out.slice(-1);
  }
  const HEB_FMT = new Intl.DateTimeFormat("he-IL-u-ca-hebrew", { day: "numeric", month: "long", year: "numeric", timeZone: CFG.timezone });
  function hebDate(d, withYear = true) {
    const parts = Object.fromEntries(HEB_FMT.formatToParts(d).map((p) => [p.type, p.value]));
    const text = `${gematria(+parts.day)} ב${parts.month}`;
    return withYear ? `${text} ${gematria(+parts.year % 1000)}` : text;
  }

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
      .then((r) => {
        if (!r.ok || !/csv|text\/plain/.test(r.headers.get("content-type") || "")) throw new Error();
        return r.text();
      })
      .then((t) => parseCSV(t).filter((r) => r.some((c) => c.trim() !== "")))
      .catch(() => {
        // אם הגיליון לא נגיש (למשל השיתוף עוד לא "כל מי שיש לו את הקישור"), מציגים את העותק השמור באתר
        console.warn(`לא הצלחנו לטעון את הלשונית "${name}" מה-Google Sheet. מציגים עותק שמור. בדקו שהשיתוף מוגדר ל"כל מי שיש לו את הקישור".`);
        if (DEMO[key]) return DEMO[key];
        throw new Error(`לא הצלחנו לטעון את הלשונית "${name}" מה-Google Sheet.`);
      });
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
        return `<td class="${i === todayCol ? "today" : ""}" style="background:${subjectColor(splitCell(v)[0])}">${cellHtml(v)}</td>`;
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
        if (on) scrollIntoRow(b);
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

  // תא בפורמט "מקצוע | מורה" (המורה לא חובה)
  function splitCell(v) {
    const [subject, ...rest] = String(v).split("|");
    return [subject.trim(), rest.join("|").trim()];
  }
  function cellHtml(v) {
    const [subject, teacher] = splitCell(v);
    return `<span class="subj">${esc(subject)}</span>${teacher ? `<span class="teacher">${esc(teacher)}</span>` : ""}`;
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
      return `<li style="background:${subjectColor(splitCell(r[col])[0])}"><span class="num"><bdi dir="ltr">${esc(r[0])}</bdi></span><span>${cellHtml(r[col])}</span></li>`;
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
      <div class="event-date"><span class="day">${d.getDate()}</span><span class="wd">${fmt(d, { weekday: "short" })}</span><span class="hd">${esc(gematria(hebParts(d).day))}</span></div>
      <div class="event-body">
        <h3>${esc(e.title)}${when ? `<span class="badge">${when}</span>` : ""}</h3>
        <p class="heb-line">${esc(fmt(d, { weekday: "long", day: "numeric", month: "long" }))} · ${esc(hebDate(d))}</p>
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
      const ed = eventDate(e);
      const month = fmt(ed, { month: "long", year: "numeric" });
      if (month !== lastMonth) {
        const y = ed.getFullYear(), mo = ed.getMonth();
        const h1 = hebParts(new Date(y, mo, 1)), h2 = hebParts(new Date(y, mo + 1, 0));
        const heb = `${h1.month === h2.month ? h1.month : `${h1.month}–${h2.month}`} ${gematria(h2.year % 1000)}`;
        html += `<h3 class="month-title">${esc(month)} <span class="muted">· ${esc(heb)}</span></h3>`;
        lastMonth = month;
      }
      html += eventHtml(e);
    }
    el.innerHTML = html;
  }

  function renderHomeEvents(events) {
    const el = $("home-events");
    if (events === null) { el.innerHTML = `<p class="empty">ראו בכרטיסייה <a href="#events">אירועים קרובים</a>.</p>`; return; }
    el.innerHTML = events.length ? events.slice(0, 4).map(eventHtml).join("") : `<p class="empty">אין אירועים קרובים.</p>`;
  }

  // ---------- לוח שנה חודשי: תאריך לועזי + עברי, חגים ואירועי הכיתה ----------
  const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  function hebParts(d) {
    const p = Object.fromEntries(HEB_FMT.formatToParts(d).map((x) => [x.type, x.value]));
    return { day: +p.day, month: p.month, year: +p.year };
  }

  // חגים ומועדים בעברית מ-Hebcal (שירות חינמי)
  const holidayCache = {};
  function loadHolidays(start, end) {
    const key = isoDay(start);
    if (!holidayCache[key]) {
      const p = new URLSearchParams({ v: "1", cfg: "json", maj: "on", min: "on", mod: "on", nx: "on", mf: "on", i: "on", lg: "he", start: isoDay(start), end: isoDay(end) });
      holidayCache[key] = fetch(`https://www.hebcal.com/hebcal?${p}`)
        .then((r) => r.json())
        .then((d) => (d.items || []).map((i) => ({ date: i.date.slice(0, 10), title: i.hebrew || i.title })))
        .catch(() => []);
    }
    return holidayCache[key];
  }

  // אירועי הכיתה מ-Google Calendar (צריך מפתח API ב-config.js)
  function loadClassEvents(start, end) {
    if (!CAL_MODE || !CFG.apiKey) return Promise.resolve(null);
    const p = new URLSearchParams({ key: CFG.apiKey, singleEvents: "true", orderBy: "startTime", maxResults: "250", timeMin: start.toISOString(), timeMax: end.toISOString(), timeZone: CFG.timezone });
    return fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CFG.calendarId)}/events?${p}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => (d.items || []).map((e) => ({ title: e.summary || "(ללא כותרת)", start: e.start.dateTime || e.start.date, end: e.end && (e.end.dateTime || e.end.date), allDay: !e.start.dateTime })))
      .catch(() => null);
  }

  let calMonth = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);
  let calToken = 0;

  function renderCalendar() {
    const el = $("calendar");
    el.innerHTML = `
      <div class="cal-head">
        <button class="cal-nav" data-step="-1" aria-label="החודש הקודם">›</button>
        <div class="cal-title" id="cal-title"></div>
        <button class="cal-nav" data-step="1" aria-label="החודש הבא">‹</button>
      </div>
      <div class="cal-grid" id="cal-grid"></div>
      <div class="cal-legend muted">
        <span><i class="dot hol"></i>חגים ומועדים</span>
        <span><i class="dot evt"></i>אירועי הכיתה</span>
        <button class="linklike" id="cal-today-btn">חזרה להיום</button>
      </div>
      <div class="cal-list" id="cal-list"></div>
      <div id="cal-extra"></div>`;
    el.querySelectorAll(".cal-nav").forEach((b) => b.addEventListener("click", () => {
      calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + +b.dataset.step, 1);
      drawMonth();
    }));
    $("cal-today-btn").addEventListener("click", () => { calMonth = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1); drawMonth(); });
    drawMonth();
  }

  async function drawMonth() {
    const token = ++calToken;
    const y = calMonth.getFullYear(), m = calMonth.getMonth();
    const first = new Date(y, m, 1), last = new Date(y, m + 1, 0);
    const gridStart = addDays(first, -first.getDay());
    const gridEnd = addDays(last, 6 - last.getDay());

    const h1 = hebParts(first), h2 = hebParts(last);
    const hebMonths = h1.month === h2.month ? h1.month : `${h1.month}–${h2.month}`;
    $("cal-title").innerHTML = `<strong>${esc(fmt(first, { month: "long", year: "numeric" }))}</strong><span>${esc(hebMonths)} ${esc(gematria(h2.year % 1000))}</span>`;

    const paint = (byDay) => {
      let html = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "שבת"].map((d) => `<div class="cal-wd">${d}</div>`).join("");
      for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) {
        const hp = hebParts(d);
        const items = byDay[isoDay(d)] || [];
        const cls = ["cal-cell", d.getMonth() !== m && "out", +d === +TODAY && "today", d.getDay() === 6 && "sat"].filter(Boolean).join(" ");
        const hebLabel = hp.day === 1 ? `${gematria(1)} ${hp.month}` : gematria(hp.day);
        html += `<div class="${cls}">
          <div class="cal-dates"><span class="g">${d.getDate()}</span><span class="h">${esc(hebLabel)}</span></div>
          ${items.map((i) => `<div class="chip ${i.type}" title="${esc(i.title)}">${esc(i.title)}</div>`).join("")}
        </div>`;
      }
      $("cal-grid").innerHTML = html;
    };
    paint({});

    const [hol, evts] = await Promise.all([loadHolidays(gridStart, gridEnd), loadClassEvents(gridStart, addDays(gridEnd, 1))]);
    if (token !== calToken) return; // המשתמש כבר עבר לחודש אחר

    const byDay = {};
    const add = (key, item) => (byDay[key] = byDay[key] || []).push(item);
    hol.forEach((h) => add(h.date, { type: "hol", title: h.title }));
    (evts || []).forEach((e) => {
      if (e.allDay) {
        const s0 = parseDate(e.start), e0 = e.end ? parseDate(e.end) : addDays(s0, 1); // בגוגל יום הסיום לא כלול
        for (let d = s0; d < e0; d = addDays(d, 1)) add(isoDay(d), { type: "evt", title: e.title });
      } else {
        const t = new Date(e.start);
        add(isoDay(t), { type: "evt", title: `${t.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: CFG.timezone })} ${e.title}` });
      }
    });
    paint(byDay);

    // רשימת החודש מתחת ללוח (נוחה במיוחד בטלפון)
    let list = "";
    for (let d = first; d <= last; d = addDays(d, 1)) {
      const items = byDay[isoDay(d)];
      if (!items) continue;
      list += `<div class="cal-row${+d === +TODAY ? " today" : ""}">
        <div class="when"><strong>${esc(fmt(d, { weekday: "short", day: "numeric", month: "numeric" }))}</strong><span>${esc(hebDate(d, false))}</span></div>
        <div class="what">${items.map((i) => `<span class="chip ${i.type}">${esc(i.title)}</span>`).join("")}</div>
      </div>`;
    }
    $("cal-list").innerHTML = list || `<p class="empty">אין חגים או אירועים בחודש הזה.</p>`;

    // בלי מפתח API אי אפשר לשלב את אירועי הכיתה בלוח, אז מציגים אותם מתחת מהיומן של גוגל
    $("cal-extra").innerHTML = CAL_MODE && evts === null
      ? `<h3 class="month-title" style="margin-top:20px">אירועי הכיתה</h3><iframe class="calendar-frame" title="אירועי הכיתה" src="${esc(calendarEmbedUrl("AGENDA"))}"></iframe>`
      : "";
  }

  // ---------- הודעות, קישורים ----------
  function renderAnnouncements(rows) {
    const el = $("home-announcements");
    const items = (rows || []).slice(1).filter((r) => (r[1] || r[2] || "").trim());
    items.sort((a, b) => (parseDate(b[0]) || 0) - (parseDate(a[0]) || 0));
    el.innerHTML = items.length ? items.map((r) => `<div class="announcement">
        <span class="date">${esc(r[0])}${parseDate(r[0]) ? ` · ${esc(hebDate(parseDate(r[0]), false))}` : ""}</span><h3>${esc(r[1])}</h3>${r[2] ? `<p>${esc(r[2])}</p>` : ""}</div>`).join("")
      : `<p class="empty">אין הודעות כרגע.</p>`;
  }

  function renderLinks(rows) {
    const el = $("links");
    const items = (rows || []).slice(1).filter((r) => safeUrl(r[1] || ""));
    el.innerHTML = items.length ? items.map((r) => `<a class="link-card" href="${esc(safeUrl(r[1]))}" target="_blank" rel="noopener">
        <strong>${esc(r[0] || r[1])}</strong>${r[2] ? `<span>${esc(r[2])}</span>` : ""}</a>`).join("")
      : `<p class="empty">אין קישורים עדיין.</p>`;
  }

  // גלילה אופקית בלבד של שורת כפתורים, בלי להזיז את הדף למטה
  function scrollIntoRow(el) {
    const row = el.parentElement;
    const target = el.offsetLeft - (row.clientWidth - el.offsetWidth) / 2;
    row.scrollTo({ left: target, behavior: "smooth" });
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
      chat: () => window.initChat && window.initChat(),
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
      if (on) scrollIntoRow(b);
    });
    document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.id === "tab-" + tab));
    run(tab);
  }

  // ---------- הפעלה ----------
  $("class-name").textContent = CFG.className || "אתר הכיתה";
  document.title = CFG.className || "אתר הכיתה";
  $("school-name").textContent = CFG.schoolName || "";
  $("today-label").innerHTML = `${esc(fmt(new Date(), { weekday: "long", day: "numeric", month: "long" }))}<span class="heb-date">${esc(hebDate(new Date()))}</span>`;
  if (!SHEET_MODE || !CAL_MODE) $("demo-banner").hidden = false;

  document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => { location.hash = b.dataset.tab; }));
  window.addEventListener("hashchange", () => showTab(location.hash.slice(1)));
  showTab(location.hash.slice(1) || "home");
})();
