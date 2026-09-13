/* ============================================================
   MOScorm — SCORM 1.2 wrapper with preview fallback
   Tracks: lesson_status · score.raw · suspend_data (progress)
   ============================================================ */
(function (global) {
  "use strict";

  var API = null;
  var isLMS = false;
  var initialized = false;
  var startTime = Date.now();
  var STORE_KEY = "mo_standards_in_motion_v1";

  function findAPI(win) {
    var attempts = 0;
    while (win && attempts < 7) {
      /* reading win.API / win.parent on a cross-origin frame throws
         SecurityError (Docebo serves content from a CDN iframe) — bail out */
      try {
        if (win.API) return win.API;
        if (!win.parent || win.parent === win) break;
        win = win.parent;
      } catch (e) { return null; }
      attempts++;
    }
    // try opener chain (some LMS pop the SCO into a new window)
    try {
      var op = window.opener;
      var n = 0;
      while (op && n < 7) {
        if (op.API) return op.API;
        if (!op.parent || op.parent === op) break;
        op = op.parent;
        n++;
      }
    } catch (e) { /* cross-origin opener — ignore */ }
    return null;
  }

  function init() {
    try {
      API = findAPI(window);
      if (API) {
        var ok = API.LMSInitialize("");
        if (ok === "true" || ok === true) {
          isLMS = true;
          initialized = true;
          return true;
        }
      }
    } catch (e) { /* cross-origin LMS frame — run in preview mode */ }
    initialized = true; // preview mode
    return false;
  }

  function get(name) {
    if (!isLMS) return "";
    try { return API.LMSGetValue(name); } catch (e) { return ""; }
  }

  function set(name, value) {
    if (!isLMS) return;
    try { API.LMSSetValue(name, String(value)); } catch (e) {}
  }

  function commit() {
    if (!isLMS) return;
    try { API.LMSCommit(""); } catch (e) {}
  }

  /* ---- session time in SCORM 1.2 hhhh:mm:ss.cs format ---- */
  function sessionTime() {
    var cs = Math.floor((Date.now() - startTime) / 10);
    var h = Math.floor(cs / 360000); cs -= h * 360000;
    var m = Math.floor(cs / 6000);   cs -= m * 6000;
    var s = Math.floor(cs / 100);    cs -= s * 100;
    function p(n, l) { n = String(n); while (n.length < l) n = "0" + n; return n; }
    return p(h, 4) + ":" + p(m, 2) + ":" + p(s, 2) + "." + p(cs, 2);
  }

  /* ---- progress persistence ---- */
  /* preview-mode localStorage is shared across every package served from the
     same origin (Docebo's CDN) — the player namespaces the key per course so
     one course's completed state can't leak into another */
  function setStoreKey(k) { if (k) STORE_KEY = String(k); }

  function loadProgress() {
    if (isLMS) {
      var raw = get("cmi.suspend_data");
      if (raw) { try { return JSON.parse(raw); } catch (e) {} }
      return null;
    }
    try {
      var local = localStorage.getItem(STORE_KEY);
      return local ? JSON.parse(local) : null;
    } catch (e) { return null; }
  }

  function saveProgress(state) {
    var json = JSON.stringify(state);
    if (isLMS) {
      set("cmi.suspend_data", json);
    } else {
      try { localStorage.setItem(STORE_KEY, json); } catch (e) {}
    }
  }

  function setScore(pct) {
    set("cmi.core.score.raw", pct);
    set("cmi.core.score.min", 0);
    set("cmi.core.score.max", 100);
  }

  function setStatus(status) { // "incomplete" | "completed"
    set("cmi.core.lesson_status", status);
  }

  function report(state) {
    // single commit point — score, status, suspend_data, time
    saveProgress(state);
    setScore(state.score);
    // assessment courses set lessonStatus explicitly: passed / failed / incomplete
    setStatus(state.lessonStatus || (state.completed ? "completed" : "incomplete"));
    set("cmi.core.session_time", sessionTime());
    commit();
  }

  /* ---- per-question interaction reporting ---- */
  var interactionCount = 0;
  function reportInteraction(data) {
    if (!isLMS) return;
    var p = "cmi.interactions." + interactionCount + ".";
    set(p + "id", data.id);
    set(p + "type", "choice");
    set(p + "correct_responses.0.pattern", data.correct);
    set(p + "student_response", data.chosen);
    set(p + "result", data.result);
    set(p + "weighting", 1);
    interactionCount++;
    set("cmi.interactions._count", interactionCount);
    commit();
  }

  function reset() {
    /* wipe saved progress — preview localStorage and LMS suspend_data */
    interactionCount = 0;
    try { localStorage.removeItem(STORE_KEY); } catch (e) {}
    if (isLMS) {
      set("cmi.suspend_data", "");
      set("cmi.core.score.raw", "");
      set("cmi.core.lesson_status", "incomplete");
      set("cmi.interactions._count", 0);
      commit();
    }
  }

  function finish() {
    if (!isLMS) return;
    try {
      set("cmi.core.session_time", sessionTime());
      commit();
      API.LMSFinish("");
    } catch (e) {}
  }

  function who() {
    /* learner identity from the LMS; "preview" when running outside an LMS */
    var id = get("cmi.core.student_id"), name = get("cmi.core.student_name");
    return { id: id || "preview-user", name: name || "Preview colleague" };
  }

  global.MOScorm = {
    init: init,
    isLMS: function () { return isLMS; },
    who: who,
    loadProgress: loadProgress,
    setStoreKey: setStoreKey,
    report: report,
    reportInteraction: reportInteraction,
    reset: reset,
    finish: finish
  };
})(window);
