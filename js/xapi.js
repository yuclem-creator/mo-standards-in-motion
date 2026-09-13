/* ============================================================
   MOxapi — xAPI (Tin Can) launch + statement layer

   When Docebo launches this package as an xAPI activity, it
   appends Tin Can launch params to the URL:
     ?endpoint=…&auth=…&actor={…}&activity_id=…&registration=…
   If those are present we stream statements straight into
   Docebo's LRS ({tenant}.docebosaas.com/tcapi/statements).
   If not, every call is a silent no-op and SCORM/preview keep
   working exactly as before.
   ============================================================ */
(function (global) {
  "use strict";

  var XAPI_VERSION = "1.0.2";   /* Docebo LRS supports up to 1.0.2 */
  var BUILD = "2026-09-13h";    /* stamped into the console so we can verify which build is live */
  var ADL = "http://adlnet.gov/expapi";
  var MO_EXT = "https://www.mandarinoriental.com/xapi/extensions";

  var active = false;
  var endpoint = "";      // …/tcapi/  (trailing slash guaranteed)
  var auth = "";
  var actor = null;
  var registration = null;
  var activityId = "";    // the course activity IRI from the launch
  var courseTitle = "";   // embedded in every statement so reports can name the course
  var startTime = Date.now();
  var queue = [];
  var flushing = false;

  /* ---------- launch param parsing ---------- */
  function param(name) {
    var m = location.search.match(new RegExp("[?&]" + name + "=([^&]*)"));
    return m ? decodeURIComponent(m[1].replace(/\+/g, " ")) : "";
  }

  function init(title) {
    if (title) courseTitle = String(title);
    var ep = param("endpoint"), au = param("auth"), ac = param("actor");
    if (!ep || !ac) {
      if (ep || au || ac) {
        /* partial launch params — tell us exactly what's missing */
        console.warn("[MOXapi] launch params incomplete — endpoint:" + !!ep +
          " auth:" + !!au + " actor:" + !!ac + " — statements disabled");
      }
      return false;
    }
    try { actor = JSON.parse(ac); } catch (e) {
      console.warn("[MOXapi] actor param is not valid JSON — statements disabled");
      return false;
    }
    /* Docebo wraps actor fields in arrays ("mbox":["mailto:…"]) and its own
       LRS then 400s them as "Invalid Agent" — unwrap to plain strings */
    ["mbox", "name", "mbox_sha1sum", "openid"].forEach(function (k) {
      if (Array.isArray(actor[k])) actor[k] = actor[k][0] || "";
    });
    if (actor.account) {
      ["name", "homePage"].forEach(function (k) {
        if (Array.isArray(actor.account[k])) actor.account[k] = actor.account[k][0] || "";
      });
    }
    endpoint = ep.replace(/\/?$/, "/");
    /* Docebo normally sends a Basic launch token in auth. Some tenants launch
       without it and rely on the platform session — activate anyway and post
       with credentials included instead of a header. */
    auth = au || "";
    if (!auth) console.warn("[MOXapi] no auth param — will post using session cookies");
    registration = param("registration") || null;
    /* Docebo sends activity_id; older launchers use activityId */
    activityId = param("activity_id") || param("activityId") ||
      (location.origin + location.pathname).replace(/\/index\.html$/, "");
    active = true;
    console.log("[MOXapi] active (build " + BUILD + ") — endpoint " + endpoint + " · actor " +
      (actor.name || (actor.account && actor.account.name) || actor.mbox || "?") +
      " · activity " + activityId);
    /* announce the launch immediately — merely opening the course in the LMS
       now leaves a row in the LRS, which makes connection testing trivial */
    var st = base(ADL + "/verbs/launched", "launched");
    st.object = { id: activityId, objectType: "Activity" };
    if (courseTitle) st.object.definition = { name: { "en-US": courseTitle } };
    send(st);
    /* flush anything queued if the page is closed mid-flight */
    window.addEventListener("beforeunload", flush);
    return true;
  }

  /* console diagnostic: type MOXapi.debug() in DevTools inside the course */
  function debug() {
    return {
      build       : BUILD,
      active      : active,
      endpoint    : endpoint,
      hasAuth     : !!auth,
      actor       : actor,
      activityId  : activityId,
      courseTitle : courseTitle,
      queued      : queue.length,
      launchParams: location.search
    };
  }

  function isActive() { return active; }

  function who() {
    if (!active || !actor) return { id: "preview-user", name: "Preview colleague" };
    return {
      id  : actor.mbox || (actor.account && actor.account.name) || "unknown",
      name: actor.name || "Colleague"
    };
  }

  /* ---------- transport ---------- */
  function flush() {
    if (!active || !queue.length || flushing) return;
    flushing = true;
    var batch = queue.splice(0, queue.length);
    var headers = {
      "Content-Type"           : "application/json",
      "X-Experience-API-Version": XAPI_VERSION
    };
    if (auth) headers["Authorization"] = auth;
    try {
      var opts = {
        method     : "POST",
        headers    : headers,
        body       : JSON.stringify(batch),
        keepalive  : true
      };
      /* session-cookie fallback only when the launch sent no auth token —
         credentialed CORS breaks against LRSs that answer ACAO:* */
      if (!auth) opts.credentials = "include";
      fetch(endpoint + "statements", opts).then(function (res) {
        if (res.ok) {
          console.log("[MOXapi] " + batch.length + " statement(s) accepted by the LRS");
          flushing = false;
        } else {
          /* the 4xx body names the offending field — surface it verbatim */
          res.text().then(function (body) {
            console.warn("[MOXapi] LRS rejected statements — HTTP " + res.status +
              (body ? " — " + body.slice(0, 400) : ""));
            console.warn("[MOXapi] rejected payload:", JSON.stringify(batch).slice(0, 800));
            flushing = false;
          }).catch(function () { flushing = false; });
        }
      }).catch(function (e) {
        console.warn("[MOXapi] POST failed at network level (CORS/proxy?): " + (e && e.message));
        queue = batch.concat(queue);
        flushing = false;
      });
    } catch (e) { flushing = false; }
  }

  function send(statement) {
    if (!active) return;
    queue.push(statement);
    flush();
  }

  /* ---------- statement skeleton ---------- */
  function base(verbId, verbDisplay) {
    var course = { id: activityId, objectType: "Activity" };
    if (courseTitle) {
      course.definition = { name: { "en-US": courseTitle } };
    }
    var ctx = {
      contextActivities: {
        parent  : [course],
        grouping: [course]
      }
    };
    if (courseTitle) {
      ctx.extensions = {};
      ctx.extensions[MO_EXT + "/course-title"] = courseTitle;
    }
    if (registration) ctx.registration = registration;
    return {
      actor    : actor,
      verb     : { id: verbId, display: { "en-US": verbDisplay } },
      timestamp: new Date().toISOString(),
      context  : ctx
    };
  }

  function questionObject(qid, text, topic) {
    var o = {
      id        : activityId + "/question/" + qid,
      objectType: "Activity",
      definition: {
        type       : ADL + "/activities/question",
        name       : { "en-US": topic ? topic + " — " + qid : qid },
        description: { "en-US": text || qid }
      }
    };
    return o;
  }

  /* iso8601 duration from session start */
  function duration() {
    var s = Math.round((Date.now() - startTime) / 1000);
    var h = Math.floor(s / 3600); s -= h * 3600;
    var m = Math.floor(s / 60);   s -= m * 60;
    return "PT" + (h ? h + "H" : "") + (m ? m + "M" : "") + s + "S";
  }

  /* ---------- public verbs ---------- */

  /* one statement per answered question (exercise check, pre, or assessment try) */
  function answered(opts) {
    var st = base(ADL + "/verbs/answered", "answered");
    st.object = questionObject(opts.id, opts.text, opts.topic);
    st.result = {
      response: String(opts.chosen),
      success : !!opts.success,
      extensions: {}
    };
    st.result.extensions[MO_EXT + "/correct-answer"] = String(opts.correct);
    if (opts.duration) st.result.duration = opts.duration;   /* ISO 8601, e.g. PT7S — time on this question */
    if (opts.try != null) st.context.extensions = {};
    if (opts.try != null) st.context.extensions[MO_EXT + "/try"] = opts.try;
    send(st);
  }

  /* summary of one assessment try, or a pre-assessment baseline */
  function scored(pct, opts) {
    opts = opts || {};
    var st = base(ADL + "/verbs/scored", "scored");
    st.object = {
      id        : activityId + (opts.baseline ? "/pre-assessment" : "/assessment-try-" + (opts.try || 1)),
      objectType: "Activity",
      definition: {
        type: ADL + "/activities/assessment",
        name: { "en-US": opts.baseline ? "Pre-assessment baseline" : "Assessment try " + (opts.try || 1) }
      }
    };
    st.result = { score: { raw: pct, min: 0, max: 100, scaled: pct / 100 } };
    send(st);
  }

  /* overall course outcome — drives completion in Docebo */
  function outcome(kind, pct) { // "passed" | "failed" | "completed"
    var st = base(ADL + "/verbs/" + kind, kind);
    st.object = { id: activityId, objectType: "Activity" };
    st.result = {
      completion: kind === "completed" || kind === "passed",
      duration  : duration(),
      score     : { raw: pct, min: 0, max: 100, scaled: pct / 100 }
    };
    if (kind === "passed") st.result.success = true;
    if (kind === "failed") st.result.success = false;
    send(st);
  }

  global.MOXapi = {
    init    : init,
    isActive: isActive,
    who     : who,
    answered: answered,
    scored  : scored,
    passed  : function (pct) { outcome("passed", pct); },
    failed  : function (pct) { outcome("failed", pct); },
    completed: function (pct) { outcome("completed", pct); },
    flush   : flush,
    debug   : debug
  };

  /* unconditional stamp — even if launch params are absent, this proves
     which build the LMS is actually serving (cache-buster for debugging) */
  console.log("[MOXapi] runtime loaded (build " + BUILD + ")");
})(window);
