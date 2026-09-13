/* ============================================================
   Reel Studio — library of reel series
   Lists every series from the active storage lanes:
     · Local lane  — localStorage "simStudioCourses"
     · Cloud lane  — Supabase sim_courses (when configured + signed in)
   Create → blank series in the editor. Open → editor.html?id=…
   ============================================================ */
(function () {
"use strict";

function $(id){ return document.getElementById(id); }
function esc(s){ return String(s == null ? "" : s).replace(/[&<>"]/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]; }); }

function toast(msg, ms) {
  var t = document.createElement("div");
  t.className = "stoast";
  t.textContent = msg;
  $("toastHost").appendChild(t);
  setTimeout(function(){ t.remove(); }, ms || 2600);
}

/* ---------------- lanes ---------------- */
var sb = null;
var cloud = false;

var localLane = {
  list: function () {
    try { return Promise.resolve(JSON.parse(localStorage.getItem("simStudioCourses") || "[]")); }
    catch (e) { return Promise.resolve([]); }
  },
  save: function (c) {
    return localLane.list().then(function (all) {
      var row = { id: c.id, title: c.title, status: c.status, updated_at: c.updated_at, data: c };
      var i = all.findIndex(function (r) { return r.id === c.id; });
      if (i >= 0) all[i] = row; else all.push(row);
      localStorage.setItem("simStudioCourses", JSON.stringify(all));
      localStorage.setItem("simStudioLast", c.id);
    });
  },
  remove: function (id) {
    return localLane.list().then(function (all) {
      all = all.filter(function (r) { return r.id !== id; });
      localStorage.setItem("simStudioCourses", JSON.stringify(all));
    });
  }
};

var cloudLane = {
  list: function () {
    return sb.from("sim_courses").select("id,title,status,updated_at,data")
      .order("updated_at", { ascending: false })
      .then(function (res) {
        if (res.error) throw res.error;
        return res.data.map(function (r) {
          return { id: r.id, title: r.title, status: r.status, updated_at: r.updated_at, data: r.data };
        });
      });
  },
  save: function (c) {
    var row = { title: c.title, status: c.status, data: c, updated_at: c.updated_at,
      owner: (window.MOUser && window.MOUser.id) || null };
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(c.id)) row.id = c.id;
    return sb.from("sim_courses").upsert(row).select("id").then(function (res) {
      if (res.error) throw res.error;
      var newId = res.data && res.data[0] && res.data[0].id;
      if (newId && newId !== c.id) {
        c.id = newId;
        return sb.from("sim_courses").update({ data: c }).eq("id", newId).then(function (r2) {
          if (r2.error) throw r2.error;
          localStorage.setItem("simStudioLast", c.id);
        });
      }
      localStorage.setItem("simStudioLast", c.id);
    });
  },
  remove: function (id) {
    return sb.from("sim_courses").delete().eq("id", id)
      .then(function (res) { if (res.error) throw res.error; });
  }
};

function lane(){ return cloud ? cloudLane : localLane; }

/* ---------------- course factory (shape mirrors studio.js) ---------------- */
function blankReel(n) {
  return {
    id: "reel-" + Date.now().toString(36) + "-" + n,
    src: "", srcType: "none", length: "00:20",
    dept: "", title: "Standard " + n,
    points: ["", "", ""],
    quiz: { q: "", options: ["", "", ""], answer: 1, why: "" }
  };
}

function blankCourse(title) {
  return {
    id: "c-" + Date.now().toString(36),
    title: title || "Untitled series",
    status: "draft",
    config: { series: "Service Essentials", passScore: 100, requireWatch: true },
    reels: [],
    i18n: {},
    updated_at: new Date().toISOString()
  };
}

/* ---------------- rendering ---------------- */
function relDate(iso) {
  var d = new Date(iso);
  if (isNaN(d)) return "";
  var days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return days + " days ago";
  if (days < 30) return Math.floor(days / 7) + (days < 14 ? " week ago" : " weeks ago");
  return d.toLocaleDateString();
}

function render(all) {
  var host = $("seriesList");
  var empty = $("libEmpty");

  all.sort(function (a, b) { return new Date(b.updated_at) - new Date(a.updated_at); });

  if (!all.length) {
    host.innerHTML = "";
    empty.hidden = false;
  } else {
    empty.hidden = true;
    host.innerHTML = all.map(function (r) {
      var reels = (r.data && r.data.reels) || [];
      var n = reels.length;
      var meta = "Swipe player · " + n + (n === 1 ? " standard" : " standards") + " · quiz-gated";
      if (r.cloud) meta += " · cloud";
      return '<div class="series-row" data-id="' + esc(r.id) + '" data-cloud="' + (r.cloud ? "1" : "") + '" role="link" tabindex="0">' +
        '<span class="sr-mono">R</span>' +
        '<div class="sr-main">' +
          '<div class="sr-title">' + esc(r.title || "Untitled series") + '</div>' +
          '<div class="sr-meta">' + esc(meta) + '</div>' +
        '</div>' +
        '<span class="sr-pill' + (r.status === "published" ? " published" : "") + '">' +
          (r.status === "published" ? "Published" : "Draft") + '</span>' +
        '<span class="sr-date">' + esc(relDate(r.updated_at)) + '</span>' +
        '<button class="sr-del" data-del="' + esc(r.id) + '" aria-label="Delete">×</button>' +
      '</div>';
    }).join("");
  }

  $("libFoot").textContent = all.length
    ? "Open a series to edit its reels, publish, or export the SCORM package."
    : "";

  host.querySelectorAll(".series-row").forEach(function (row) {
    function open() {
      localStorage.setItem("simStudioLast", row.getAttribute("data-id"));
      location.href = "editor.html?id=" + encodeURIComponent(row.getAttribute("data-id"));
    }
    row.addEventListener("click", function (e) {
      var del = e.target.getAttribute && e.target.getAttribute("data-del");
      if (del) {
        e.stopPropagation();
        var inCloud = row.getAttribute("data-cloud") === "1";
        var target = inCloud ? cloudLane : localLane;
        target.remove(del).then(loadAll).then(function () { toast("Series deleted"); })
          .catch(function () { toast("Delete failed"); });
        return;
      }
      open();
    });
    row.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
    });
  });
}

/* ---------------- load ---------------- */
function loadAll() {
  return localLane.list().then(function (localRows) {
    localRows = localRows.map(function (r) { r.cloud = false; return r; });
    if (!cloud) return localRows;
    return cloudLane.list().then(function (cloudRows) {
      cloudRows = cloudRows.map(function (r) { r.cloud = true; return r; });
      var seen = {};
      cloudRows.forEach(function (r) { seen[r.id] = true; });
      return cloudRows.concat(localRows.filter(function (r) { return !seen[r.id]; }));
    }).catch(function () { return localRows; });
  }).then(render);
}

/* ---------------- create ---------------- */
function newSeries() {
  var c = blankCourse();
  c.reels.push(blankReel(1));
  lane().save(c).then(function () {
    location.href = "editor.html?id=" + encodeURIComponent(c.id);
  }).catch(function () {
    cloud = false;
    localLane.save(c).then(function () {
      location.href = "editor.html?id=" + encodeURIComponent(c.id);
    });
  });
}

/* ---------------- ready-made xAPI test course ---------------- */
function testCourse() {
  var c = blankCourse("xAPI Reporting Test");
  c.config.entry = "reels";            /* reels + exercise + final assessment */
  c.config.passScore = 100;
  c.assessment = {
    enabled: true, passMark: 67, maxTries: 0, retryMode: "all",   /* unlimited tries */
    questions: [
      { q: "A guest asks something you cannot answer immediately. What do you do?",
        options: ["Guess politely and move on", "Acknowledge, find the answer, and follow up with the guest", "Refer them to the concierge desk and walk away"],
        answer: 1, why: "Never guess — own the question, find the answer, close the loop." },
      { q: "How many attempts should a colleague need to master a standard?",
        options: ["As many as they need — practice is unlimited", "Exactly one", "Three, no more"],
        answer: 0, why: "Unlimited tries — the goal is mastery, not rationing attempts." },
      { q: "What does a baseline (pre-assessment) score tell us?",
        options: ["Who to discipline", "Prior knowledge before any training — a starting point, not a judgement", "The final grade for the course"],
        answer: 1, why: "Pre-assessment captures the baseline only; it carries no pass mark." }
    ]
  };
  var demo = [
    { dept: "Front Office", title: "The Warm Welcome",
      points: ["Greet within 10 seconds, by name when known", "Offer assistance before being asked", "Close every interaction with a genuine farewell"],
      quiz: { q: "Within how many seconds should we greet an arriving guest?",
        options: ["30 seconds", "10 seconds", "Whenever the queue clears"],
        answer: 1, why: "The 10-second greeting is the first visible promise of the stay." } },
    { dept: "Food & Beverage", title: "Tableside Recovery",
      points: ["Apologise once, sincerely — then act", "Fix the issue before the bill, not after", "Tell the manager before the guest does"],
      quiz: { q: "When a dish is sent back, what comes first?",
        options: ["Explaining why the kitchen got it wrong", "A sincere apology, then immediate action", "Offering a discount on the spot"],
        answer: 1, why: "Recovery starts with ownership — apology once, then act fast." } },
    { dept: "Housekeeping", title: "The Turndown Detail",
      points: ["Bed turned, lighting softened, curtains drawn", "Water and glass placed on the nightstand", "Tomorrow's weather card left on the pillow"],
      quiz: { q: "Which item belongs on the nightstand at turndown?",
        options: ["The laundry price list", "Water and a glass", "A feedback form"],
        answer: 1, why: "Water and a glass — the small detail guests notice last at night." } }
  ];
  c.reels = demo.map(function (r, i) {
    return {
      id: "test-reel-" + (i + 1),
      src: "", srcType: "none", length: "00:15",
      dept: r.dept, title: r.title,
      points: r.points.slice(),
      quiz: { q: r.quiz.q, options: r.quiz.options.slice(), answer: r.quiz.answer, why: r.quiz.why }
    };
  });
  localLane.save(c).then(function () {
    toast("Test course created — export it as xAPI from the editor");
    location.href = "editor.html?id=" + encodeURIComponent(c.id);
  });
}

/* ---------------- boot ---------------- */
function boot() {
  $("btnNewSeries").addEventListener("click", newSeries);
  $("btnEmptyNew").addEventListener("click", newSeries);
  var tcBtn = $("btnTestCourse");
  if (tcBtn) tcBtn.addEventListener("click", testCourse);
  var repBtn = $("btnXapiReport");
  if (repBtn && window.runXapiReport) {
    repBtn.addEventListener("click", function () { runXapiReport(repBtn); });
  }
  var cfgBtn = $("btnReportCfg"), cfgPanel = $("reportCfg");
  if (cfgBtn && cfgPanel && window.dcSyncPanel) {
    cfgBtn.addEventListener("click", function () {
      cfgPanel.hidden = !cfgPanel.hidden;
      if (!cfgPanel.hidden) dcSyncPanel();
    });
    ["dcDomain","dcClientId","dcSecret","dcUser","dcPass","dcSince","dcSimOnly"].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener(el.type === "checkbox" ? "change" : "input", function () {
        dcSave();
        var saved = $("reportCfgSaved");
        if (saved) { saved.hidden = false; clearTimeout(saved._t); saved._t = setTimeout(function(){ saved.hidden = true; }, 2000); }
      });
    });
    var testBtn = $("btnTestConn"), testLog = $("reportTestLog");
    if (testBtn && testLog && window.dcTestConnection) {
      testBtn.addEventListener("click", function () {
        testLog.hidden = false;
        testLog.textContent = "";
        testBtn.disabled = true;
        dcTestConnection(dcLoad(), function (msg) {
          testLog.textContent += msg + "\n";
        }).then(function () { testBtn.disabled = false; });
      });
    }
  }

  // cloud lane — the shared signed-in client from js/auth.js
  if (window.MOSB) {
    sb = window.MOSB;
    cloud = true;
  }

  loadAll();
}

document.addEventListener("DOMContentLoaded", function () {
  if (window.MOAuth) MOAuth.require(function () { boot(); });
  else boot();
});
})();
