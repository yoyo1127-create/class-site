// ===============================================
//  קיר הכיתה: הודעות בסגנון צ'אט, שמורות ב-Firebase
//  קריאה: כולם. כתיבה: רק אחרי התחברות עם Google.
// ===============================================
(function () {
  const CFG = window.CLASS_CONFIG || {};
  const FB = CFG.firebase || {};
  const SDK = "https://www.gstatic.com/firebasejs/10.12.2/";
  const MAX_LEN = 500;
  const ADMINS = (CFG.admins || []).map((e) => String(e).toLowerCase());
  let started = false;

  window.initChat = function () {
    if (started) return;
    started = true;
    const root = document.getElementById("chat");
    if (!FB.apiKey || !FB.projectId) return renderDemo(root);
    start(root).catch((err) => {
      console.error(err);
      root.innerHTML = `<p class="error">לא הצלחנו לטעון את קיר הכיתה. נסו לרענן את הדף.</p>`;
    });
  };

  // ---------- עזרים ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const COLORS = ["#3b5bdb", "#e8590c", "#2f9e44", "#ae3ec9", "#d6336c", "#0c8599", "#f08c00", "#5f3dc4"];
  function colorFor(key) {
    let h = 0;
    for (const ch of String(key)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return COLORS[h % COLORS.length];
  }
  function initials(name) {
    const parts = String(name || "?").trim().split(/\s+/);
    return (parts[0][0] + (parts[1] ? parts[1][0] : "")).toUpperCase();
  }
  const fmtTime = (d) => d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: CFG.timezone });
  function fmtDay(d) {
    const key = (x) => x.toLocaleDateString("en-CA", { timeZone: CFG.timezone });
    const today = new Date();
    const yest = new Date(Date.now() - 86400000);
    if (key(d) === key(today)) return "היום";
    if (key(d) === key(yest)) return "אתמול";
    return d.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long", timeZone: CFG.timezone });
  }

  function messagesHtml(msgs, me, canDelete) {
    let html = "", lastDay = "";
    for (const m of msgs) {
      const day = fmtDay(m.date);
      if (day !== lastDay) { html += `<div class="day-sep">${esc(day)}</div>`; lastDay = day; }
      const mine = me && m.uid === me.uid;
      html += `<div class="msg${mine ? " mine" : ""}">
        <div class="avatar" style="background:${colorFor(m.uid || m.name)}" aria-hidden="true">${esc(initials(m.name))}</div>
        <div class="bubble">
          <div class="who">${esc(m.name)}</div>
          <div class="text">${esc(m.text)}</div>
          <div class="meta"><span>${fmtTime(m.date)}</span>${canDelete(m) ? `<button class="del" data-id="${esc(m.id)}" title="מחיקה">🗑 מחיקה</button>` : ""}</div>
        </div></div>`;
    }
    return html || `<p class="empty" style="align-self:center">עוד אין הודעות. אפשר לכתוב את הראשונה!</p>`;
  }

  function shell(root) {
    root.innerHTML = `<div class="chat-list" id="chat-list" aria-live="polite"><p class="loading" style="align-self:center">טוען הודעות…</p></div><div class="composer" id="composer"></div>`;
    return { list: document.getElementById("chat-list"), composer: document.getElementById("composer") };
  }

  function scrollToBottom(list, force) {
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 120;
    if (force || nearBottom) list.scrollTop = list.scrollHeight;
  }

  const GOOGLE_ICON = `<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;

  // ---------- מצב הדגמה (לפני חיבור Firebase) ----------
  function renderDemo(root) {
    const { list, composer } = shell(root);
    const now = Date.now();
    const demo = [
      { id: "1", uid: "a", name: "יעקב אברהם", text: "ברוכים הבאים לקיר הכיתה! כאן אפשר לשאול שאלות ולשתף.", date: new Date(now - 26 * 3600000) },
      { id: "2", uid: "b", name: "נועה כהן", text: "מישהו יודע באיזה עמוד אנחנו בחוברת בחשבון?", date: new Date(now - 3 * 3600000) },
      { id: "3", uid: "c", name: "איתי לוי", text: "עמוד 34 🙂", date: new Date(now - 2.5 * 3600000) },
    ];
    list.innerHTML = messagesHtml(demo, null, () => false);
    composer.innerHTML = `<p class="note">אלה הודעות לדוגמה. הקיר יעבוד באמת אחרי שמחברים את Firebase (שלב 6 במדריך ההתקנה).</p>`;
    scrollToBottom(list, true);
  }

  // ---------- מצב אמיתי ----------
  async function start(root) {
    const { list, composer } = shell(root);
    const [{ initializeApp }, A, F] = await Promise.all([
      import(SDK + "firebase-app.js"),
      import(SDK + "firebase-auth.js"),
      import(SDK + "firebase-firestore.js"),
    ]);
    const app = initializeApp(FB);
    const auth = A.getAuth(app);
    const db = F.getFirestore(app);
    const messagesCol = F.collection(db, "messages");

    let me = null;
    let msgs = [];
    const isAdmin = () => !!(me && me.email && ADMINS.includes(me.email.toLowerCase()));
    const canDelete = (m) => !!me && (m.uid === me.uid || isAdmin());
    const draw = (force) => {
      list.innerHTML = messagesHtml(msgs, me, canDelete);
      scrollToBottom(list, force);
    };

    // הודעות בזמן אמת (100 האחרונות)
    let first = true;
    F.onSnapshot(
      F.query(messagesCol, F.orderBy("createdAt", "desc"), F.limit(100)),
      (snap) => {
        msgs = snap.docs.map((d) => {
          const v = d.data({ serverTimestamps: "estimate" });
          return { id: d.id, uid: v.uid, name: v.name, text: v.text, date: v.createdAt ? v.createdAt.toDate() : new Date() };
        }).reverse();
        draw(first);
        first = false;
      },
      (err) => {
        console.error(err);
        list.innerHTML = `<p class="error">לא הצלחנו לקרוא את ההודעות. בדקו את חוקי האבטחה ב-Firebase (שלב 6 במדריך).</p>`;
      }
    );

    list.addEventListener("click", async (e) => {
      const btn = e.target.closest(".del");
      if (!btn || !confirm("למחוק את ההודעה?")) return;
      try { await F.deleteDoc(F.doc(db, "messages", btn.dataset.id)); }
      catch (err) { console.error(err); alert("אין הרשאה למחוק את ההודעה הזו."); }
    });

    function signIn() {
      const provider = new A.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      A.signInWithPopup(auth, provider).catch((err) => {
        if (err.code === "auth/popup-blocked" || err.code === "auth/operation-not-supported-in-this-environment") {
          A.signInWithRedirect(auth, provider);
        } else if (err.code !== "auth/popup-closed-by-user" && err.code !== "auth/cancelled-popup-request") {
          console.error(err);
          alert("ההתחברות נכשלה. נסו שוב.");
        }
      });
    }

    function drawComposer() {
      if (!me) {
        composer.innerHTML = `<button class="btn google" id="chat-signin">${GOOGLE_ICON} התחברות עם Google כדי לכתוב</button>`;
        document.getElementById("chat-signin").onclick = signIn;
        return;
      }
      composer.innerHTML = `
        <form id="chat-form">
          <textarea id="chat-text" rows="1" maxlength="${MAX_LEN}" placeholder="כתבו הודעה…" aria-label="הודעה חדשה"></textarea>
          <button class="btn" type="submit" id="chat-send">שליחה</button>
        </form>
        <div class="signed"><span>כותבים בשם: <strong>${esc(me.displayName || me.email)}</strong></span><button class="linklike" id="chat-signout">התנתקות</button></div>`;
      const form = document.getElementById("chat-form");
      const ta = document.getElementById("chat-text");
      const send = document.getElementById("chat-send");
      const grow = () => { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 140) + "px"; };
      ta.addEventListener("input", grow);
      // במחשב: Enter שולח, Shift+Enter שורה חדשה. בטלפון Enter הוא שורה חדשה.
      ta.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey && !matchMedia("(pointer: coarse)").matches) { e.preventDefault(); form.requestSubmit(); }
      });
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const text = ta.value.trim();
        if (!text) return;
        send.disabled = true;
        try {
          await F.addDoc(messagesCol, {
            text: text.slice(0, MAX_LEN),
            name: me.displayName || "",
            uid: me.uid,
            createdAt: F.serverTimestamp(),
          });
          ta.value = "";
          grow();
          scrollToBottom(list, true);
        } catch (err) {
          console.error(err);
          alert("ההודעה לא נשלחה. נסו שוב.");
        } finally {
          send.disabled = false;
          ta.focus();
        }
      });
      document.getElementById("chat-signout").onclick = () => A.signOut(auth);
    }

    A.getRedirectResult(auth).catch(() => {});
    A.onAuthStateChanged(auth, (user) => {
      me = user;
      drawComposer();
      if (msgs.length) draw(false);
    });
  }

  if (window.__chatPending) window.initChat();
})();
