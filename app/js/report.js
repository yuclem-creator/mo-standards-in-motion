
function $(id) { return document.getElementById(id); }

/* self-contained toast — host pages define their own inside closures */
function toast(msg, ms) {
  var host = document.getElementById("toastHost");
  if (!host) { try { alert(msg); } catch (e) {} return; }
  var el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(function () { el.classList.add("show"); }, 10);
  setTimeout(function () {
    el.classList.remove("show");
    setTimeout(function () { el.remove(); }, 400);
  }, ms || 4200);
}

/* ============================================================
   Docebo xAPI report — pull LRS statements, flatten to CSV
   ============================================================ */
var DC_DEFAULTS = {
  domain  : "theloopplus.mohg.com",
  clientId: "xapi-report",
  secret  : "4dbec463e60495d1adcb3a103b1ffaeaecfa72847d279b36fd57d1f327b60dd9",
  user    : "",
  pass    : "",
  since   : "",
  simOnly : true
};
var MO_EXT = "https://www.mandarinoriental.com/xapi/extensions";

function dcLoad() {
  var cfg;
  try { cfg = JSON.parse(localStorage.getItem("simDoceboCfg") || "null"); } catch (e) { cfg = null; }
  cfg = cfg || {};
  Object.keys(DC_DEFAULTS).forEach(function (k) {
    /* seed the app credentials once; user/pass stay as saved */
    if (k === "user" || k === "pass" || k === "since") cfg[k] = cfg[k] || "";
    else if (k === "simOnly") cfg[k] = cfg[k] !== false;   /* default ON */
    else cfg[k] = cfg[k] || DC_DEFAULTS[k];
  });
  return cfg;
}
function dcSave() {
  if (!$("dcDomain")) return;
  localStorage.setItem("simDoceboCfg", JSON.stringify({
    domain  : $("dcDomain").value.trim(),
    clientId: $("dcClientId").value.trim(),
    secret  : $("dcSecret").value.trim(),
    user    : $("dcUser").value.trim(),
    pass    : $("dcPass").value,
    since   : $("dcSince") ? $("dcSince").value.trim() : "",
    simOnly : $("dcSimOnly") ? $("dcSimOnly").checked : true
  }));
}
function dcSyncPanel() {
  if (!$("dcDomain")) return;
  var cfg = dcLoad();
  $("dcDomain").value = cfg.domain;
  $("dcClientId").value = cfg.clientId;
  $("dcSecret").value = cfg.secret;
  $("dcUser").value = cfg.user;
  $("dcPass").value = cfg.pass;
  if ($("dcSince")) $("dcSince").value = cfg.since || "";
  if ($("dcSimOnly")) $("dcSimOnly").checked = cfg.simOnly !== false;
}

function dcBase(cfg) {
  return /^https?:\/\//.test(cfg.domain) ? cfg.domain.replace(/\/$/, "") : "https://" + cfg.domain;
}
function dcToken(cfg) {
  /* the LRS requires a superadmin USER token — password grant — not an
     app-level client_credentials token (that returns 401 on tcapi) */
  var body = "client_id=" + encodeURIComponent(cfg.clientId) +
    "&client_secret=" + encodeURIComponent(cfg.secret) + "&scope=api";
  if (cfg.user && cfg.pass) {
    body += "&grant_type=password&username=" + encodeURIComponent(cfg.user) +
      "&password=" + encodeURIComponent(cfg.pass);
  } else {
    body += "&grant_type=client_credentials";
  }
  return fetch(dcBase(cfg) + "/oauth2/token", {
    method : "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body   : body
  }).then(function (res) {
    if (!res.ok) {
      return res.text().then(function (t) {
        var detail = "";
        try { detail = JSON.parse(t).error_description || JSON.parse(t).error || ""; } catch (e) {}
        throw new Error("auth failed (" + res.status + ")" + (detail ? " — " + detail : ""));
      });
    }
    return res.json();
  }).then(function (j) { return j.access_token; });
}

function dcFetchJson(url, token) {
  var headers = { "X-Experience-API-Version": "1.0.2" };
  if (token) headers["Authorization"] = "Bearer " + token;
  /* credentials:'include' sends the Loop+ session cookie when tokenless */
  var ctrl = new AbortController();
  var timer = setTimeout(function () { ctrl.abort(); }, 30000);   /* never hang silently */
  return fetch(url, { headers: headers, credentials: "include", signal: ctrl.signal })
    .then(function (res) { clearTimeout(timer); return { status: res.status, res: res }; })
    .catch(function (e) {
      clearTimeout(timer);
      if (e && e.name === "AbortError") return { status: 0, networkError: true, timeout: true };
      return { status: 0, networkError: true };
    });
}

function dcFetchStatements(cfg, activity, onProgress) {
  var all = [], token = null, usedToken = false;
  var offset = 0, lastFirstId = null, pages = 0;
  var skipCookie = !!(cfg.user && cfg.pass);
  var start = skipCookie
    ? dcToken(cfg).then(function (t) { token = t; usedToken = true; })
    : Promise.resolve();

  function url() {
    /* paginate with our own offset — Docebo's "more" links are unreliable
       (they point at /statements/ without /tcapi, or an internal hostname) */
    /* ascending=false → newest statements first, so a capped pull still
       captures the most recent activity (fresh tests, today's launches) */
    var u = dcBase(cfg) + "/tcapi/statements?limit=100&ascending=false&offset=" + offset +
      (activity ? "&activity=" + encodeURIComponent(activity) : "");
    if (cfg.since) {
      var iso = cfg.since.indexOf("T") >= 0 ? cfg.since : cfg.since + "T00:00:00Z";
      u += "&since=" + encodeURIComponent(iso);
    }
    return u;
  }

  function next() {
    if (pages >= 500) return all;   /* absolute safety cap (50k rows) */
    return dcFetchJson(url(), token).then(function (out) {
      if (out.networkError && !usedToken) {
        /* CORS/network rejection on the cookie attempt — retry via OAuth */
        usedToken = true;
        return dcToken(cfg).then(function (t) { token = t; return next(); });
      }
      if (out.networkError && out.timeout) {
        throw new Error("timed out — the LRS took over 30s to answer");
      }
      if (out.networkError) {
        throw new Error("cannot reach " + cfg.domain + " — network or CORS blocked the request");
      }
      if (out.status === 401 && !usedToken) {
        /* cookie session didn't fly — get an OAuth user token and retry */
        usedToken = true;
        return dcToken(cfg).then(function (t) { token = t; return next(); });
      }
      if (out.status === 401) {
        throw new Error("unauthorised — log into The Loop+ in this browser, or check Settings credentials");
      }
      if (!out.res.ok) throw new Error("LRS query failed (" + out.status + ")");
      return out.res.json().then(function (j) {
        var batch = (j && j.statements) || [];
        pages++;
        /* duplicate-page guard: if the LRS ignores pagination params and
           returns the same first statement again, stop instead of looping */
        var firstId = batch.length ? (batch[0].id || JSON.stringify(batch[0])) : null;
        if (firstId && firstId === lastFirstId) return all;
        lastFirstId = firstId;
        all = all.concat(batch);
        if (onProgress) onProgress(all.length);
        if (!batch.length || batch.length < 100) return all;
        offset += batch.length;
        return next();
      });
    });
  }
  return start.then(next);
}

function dcLang(d) {
  if (!d) return "";
  if (typeof d === "string") return d;
  return d["en-US"] || d[Object.keys(d)[0]] || "";
}
/* ISO 8601 duration → plain seconds for Excel/pivot analysis */
function dcDurSecs(d) {
  if (!d) return "";
  var m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(d);
  if (!m) return "";
  return (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0));
}
/* turn an activity IRI tail into a readable course name:
   "…/sim/pre-assessment-xapi-test" → "Pre assessment xapi test"          */
function dcCourseName(iri) {
  if (!iri) return "";
  var tail = String(iri).split("#")[0].split("?")[0].replace(/\/+$/, "").split("/").pop();
  if (!tail || /^[0-9a-f-]{20,}$/i.test(tail)) return "";   /* GUID — nothing to humanise */
  try { tail = decodeURIComponent(tail); } catch (e) {}
  tail = tail.replace(/[-_+.]+/g, " ").replace(/\s+/g, " ").trim();
  return tail.charAt(0).toUpperCase() + tail.slice(1);
}
function dcFlatten(st) {
  var verb = ((st.verb || {}).id || "").split("/").pop();
  var actor = st.actor || {};
  var result = st.result || {};
  var score = result.score || {};
  var obj = st.object || {};
  var def = obj.definition || {};
  var ext = result.extensions || {};
  var ctx = st.context || {};
  var ctxExt = ctx.extensions || {};
  var parents = (ctx.contextActivities || {}).parent || [{}];
  var oid = obj.id || "";
  /* username: the Docebo login name — lives in actor.account.name and is
     present even when the Email field (mbox) is empty */
  var username = (actor.account && actor.account.name) ||
    (actor.mbox || "").replace("mailto:", "") ||
    actor.mbox_sha1sum || actor.openid || "";
  var courseActivity = (parents[0] && parents[0].id) || "";
  /* course name: explicit context extension → parent activity definition
     name → humanised slug from the activity IRI */
  var courseName = ctxExt[MO_EXT + "/course-title"] ||
    dcLang((parents[0] && parents[0].definition && parents[0].definition.name)) ||
    dcCourseName(courseActivity);
  var ctxActs = ctx.contextActivities || {};
  function actIds(list) {
    return ((ctxActs[list]) || []).map(function (a) { return a.id || ""; }).filter(Boolean).join(" | ");
  }
  var instructor = ctx.instructor || {};
  var team = ctx.team || {};
  function jsonCell(o) {
    if (!o || (typeof o === "object" && !Object.keys(o).length)) return "";
    try { return JSON.stringify(o); } catch (e) { return ""; }
  }
  /* every other result extension, besides the ones we surface as columns */
  var otherExt = {};
  Object.keys(ext).forEach(function (k) {
    if (k !== MO_EXT + "/correct-answer" && k !== MO_EXT + "/response-text" && k !== MO_EXT + "/correct-answer-text") otherExt[k] = ext[k];
  });
  var otherCtxExt = {};
  Object.keys(ctxExt).forEach(function (k) {
    if (k !== MO_EXT + "/try" && k !== MO_EXT + "/course-title") otherCtxExt[k] = ctxExt[k];
  });
  return {
    /* ---- curated analytics columns (what the AI report reads first) ---- */
    timestamp      : st.timestamp || "",
    verb           : verb,
    colleague      : actor.name || "",
    username       : username,
    email          : (actor.mbox || "").replace("mailto:", ""),
    /* Docebo user additional fields — filled in by dcEnrichUsers after the
       pull (blank when the profile lookup is unavailable) */
    hotel          : "",
    department     : "",
    job_title      : "",
    registration   : ctx.registration || "",
    course_name    : courseName,
    course_activity: courseActivity,
    question_id    : oid.indexOf("/question/") >= 0 ? oid.split("/question/")[1] : "",
    question_text  : dcLang(def.description),
    topic          : dcLang(def.name),
    response       : result.response || "",
    response_text  : ext[MO_EXT + "/response-text"] || "",
    correct_answer : ext[MO_EXT + "/correct-answer"] || "",
    correct_answer_text : ext[MO_EXT + "/correct-answer-text"] || "",
    success        : result.success === undefined ? "" : result.success,
    try            : ctxExt[MO_EXT + "/try"] || "",
    score_raw      : score.raw === undefined ? "" : score.raw,
    score_scaled   : score.scaled === undefined ? "" : score.scaled,
    completion     : result.completion === undefined ? "" : result.completion,
    /* ---- the full statement, field by field ---- */
    statement_id   : st.id || "",
    stored         : st.stored || "",
    version        : st.version || "",
    actor_object_type : actor.objectType || "",
    actor_account_homepage : (actor.account && actor.account.homePage) || "",
    actor_mbox_sha1sum : actor.mbox_sha1sum || "",
    actor_openid   : actor.openid || "",
    actor_members  : (actor.member || []).map(function (m) { return m.name || m.mbox || ""; }).join(" | "),
    object_id      : oid,
    object_type    : obj.objectType || "",
    object_name    : dcLang(def.name),
    object_description : dcLang(def.description),
    object_activity_type : def.type || "",
    duration       : result.duration || "",
    duration_seconds : dcDurSecs(result.duration),
    score_min      : score.min === undefined ? "" : score.min,
    score_max      : score.max === undefined ? "" : score.max,
    result_extensions : jsonCell(otherExt),
    context_instructor  : instructor.name || (instructor.mbox || "").replace("mailto:", ""),
    context_team        : team.name || "",
    context_platform    : ctx.platform || "",
    context_language    : ctx.language || "",
    context_revision    : ctx.revision || "",
    context_grouping    : actIds("grouping"),
    context_category    : actIds("category"),
    context_other       : actIds("other"),
    context_extensions  : jsonCell(otherCtxExt),
    authority           : ((st.authority || {}).name) || ((st.authority || {}).mbox || "").replace("mailto:", ""),
    attachments_count   : (st.attachments || []).length || "",
    raw_json            : jsonCell(st)   /* nothing lost — the complete original statement */
  };
}
var DC_COLS = ["timestamp","verb","colleague","username","email",
  "hotel","department","job_title","registration",
  "course_name","course_activity","question_id","question_text","topic",
  "response","response_text","correct_answer","correct_answer_text","success","try","score_raw","score_scaled","completion",
  "statement_id","stored","version","actor_object_type","actor_account_homepage",
  "actor_mbox_sha1sum","actor_openid","actor_members","object_id","object_type",
  "object_name","object_description","object_activity_type","duration",
  "score_min","score_max","duration_seconds","result_extensions","context_instructor","context_team",
  "context_platform","context_language","context_revision","context_grouping",
  "context_category","context_other","context_extensions","authority",
  "attachments_count","raw_json"];
/* ============================================================
   Docebo user additional fields (hotel / department / job title)
   Pulled from the Docebo user API at export time and joined onto
   every row by email — the course code never has to know them,
   which is exactly what lets the heat map carry property tags.
   ============================================================ */
function dcApiGet(cfg, token, path) {
  var ctrl = new AbortController();
  var timer = setTimeout(function () { ctrl.abort(); }, 20000);
  return fetch(dcBase(cfg) + path, {
    headers: { "Authorization": "Bearer " + token, "Accept": "application/json" },
    signal: ctrl.signal
  }).then(function (res) {
    clearTimeout(timer);
    return res.ok ? res.json() : null;
  }).catch(function () { clearTimeout(timer); return null; });
}

/* Docebo dropdown additional fields come back as option IDs (320, 236…)
   rather than labels — resolve them against the field definitions once
   per export. Map: lowercase field name → { option id → label } */
var dcFieldDefs = null;
function dcFieldDefMap(cfg, token) {
  if (dcFieldDefs) return Promise.resolve(dcFieldDefs);
  dcFieldDefs = {};
  return dcApiGet(cfg, token, "/manage/v1/user/fields?page_size=200")
    .then(function (j) {
      var items = (j && j.data && (j.data.items || j.data)) || [];
      if (!Array.isArray(items)) items = [];
      items.forEach(function (f) {
        var name = (f.name || f.title || "").toLowerCase();
        var els = f.elements || f.options || [];
        var map = {};
        (Array.isArray(els) ? els : []).forEach(function (el) {
          var id = el.id != null ? String(el.id) : "";
          var label = el.name || el.value || el.label || "";
          if (id && label) map[id] = label;
        });
        if (name) dcFieldDefs[name] = map;
      });
      return dcFieldDefs;
    })
    .catch(function () { return dcFieldDefs; });
}

function dcResolveVal(name, val) {
  if (val == null) return "";
  /* multi-select dropdowns may arrive as an array (or csv) of option ids */
  var parts = Array.isArray(val) ? val.map(String) : String(val).split(/\s*,\s*/);
  var map = (dcFieldDefs && dcFieldDefs[name.toLowerCase()]) || {};
  var out = parts.map(function (p) { return (/^\d+$/.test(p) && map[p]) ? map[p] : p; });
  return out.filter(Boolean).join(", ");
}

function dcPickField(fields, re) {
  for (var i = 0; i < fields.length; i++) {
    var f = fields[i] || {};
    var name = f.name || f.title || "";
    if (f.value == null || f.value === "" || !re.test(name)) continue;
    /* some payloads carry the label alongside the id — prefer it */
    var label = f.value_name || f.label || f.element_name || "";
    if (label) return label;
    return dcResolveVal(name, f.value);
  }
  return "";
}

function dcLookupUser(cfg, token, email) {
  var empty = { hotel: "", department: "", job_title: "" };
  return dcApiGet(cfg, token, "/manage/v1/user?search_text=" + encodeURIComponent(email) + "&page_size=5")
    .then(function (j) {
      var items = (j && j.data && j.data.items) || [];
      var hit = items.filter(function (u) {
        return (u.email || "").toLowerCase() === email.toLowerCase();
      })[0] || items.filter(function (u) {
        return (u.username || "").toLowerCase() === email.toLowerCase();
      })[0] || items[0];
      var id = hit && (hit.user_id || hit.id);
      if (!id) return empty;
      return dcApiGet(cfg, token, "/manage/v1/user/" + id).then(function (u) {
        var d = (u && u.data) || {};
        var fields = d.additional_fields || d.fields || [];
        if (!Array.isArray(fields)) fields = [];
        return {
          hotel     : dcPickField(fields, /hotel|property|resort/i),
          department: dcPickField(fields, /depart|division/i),
          job_title : dcPickField(fields, /job|title|position|role/i)
        };
      });
    })
    .catch(function () { return empty; });
}

function dcEnrichUsers(rows, cfg) {
  var emails = {};
  rows.forEach(function (r) {
    var e = r.email || ((r.username || "").indexOf("@") >= 0 ? r.username : "");
    if (e) emails[e.toLowerCase()] = true;
  });
  var list = Object.keys(emails);
  if (!list.length) return Promise.resolve(rows);
  var cache = {};
  return dcToken(cfg).then(function (token) {
    return dcFieldDefMap(cfg, token).then(function () { return token; });
  }).then(function (token) {
    var i = 0;
    function next() {
      if (i >= list.length) return null;
      var e = list[i++];
      return dcLookupUser(cfg, token, e).then(function (f) {
        cache[e] = f;
        var el = $("reportStatus");
        if (el) { el.hidden = false; el.textContent = "Pulling colleague profiles… " + i + " / " + list.length; }
        return next();
      });
    }
    return next();
  }).then(function () {
    rows.forEach(function (r) {
      var e = (r.email || ((r.username || "").indexOf("@") >= 0 ? r.username : "")).toLowerCase();
      var f = cache[e] || {};
      r.hotel = f.hotel || ""; r.department = f.department || ""; r.job_title = f.job_title || "";
    });
    return rows;
  }).catch(function () { return rows; });   /* profiles are a bonus — never block the export */
}

function dcCsv(rows) {
  var cols = DC_COLS;
  function cell(v) {
    v = String(v == null ? "" : v);
    return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  return "\ufeff" + cols.join(",") + "\n" +
    rows.map(function (r) { return cols.map(function (c) { return cell(r[c]); }).join(","); }).join("\n");
}

/* step-by-step connection diagnostic — tells us WHICH leg fails */
function dcTestConnection(cfg, onLine) {
  function line(msg) { if (onLine) onLine(msg); }
  var token = null;
  line("1 · OAuth token — contacting " + cfg.domain + " …");
  return dcToken(cfg).then(function (t) {
    token = t;
    line("1 · OAuth token — OK (" + (cfg.user ? "password grant, user " + cfg.user : "client credentials") + ")");
    line("2 · LRS statements — querying with the token …");
    return dcFetchJson(dcBase(cfg) + "/tcapi/statements?limit=1", token);
  }).then(function (out) {
    if (out.networkError) {
      line("2 · LRS statements — FAILED at network level (browser blocked the request: CORS, proxy, or extension)");
      line("Result: token endpoint reachable, LRS endpoint blocked from this browser — likely a corporate proxy or browser extension.");
      return;
    }
    if (out.status === 401) {
      line("2 · LRS statements — reached the server, but 401 unauthorised");
      line(cfg.user
        ? "Result: connection fine — the LRS rejects this token. Is " + cfg.user + " a superadmin?"
        : "Result: connection fine — app tokens can't read the LRS; enter your Docebo username + password above.");
      return;
    }
    if (!out.res.ok) {
      line("2 · LRS statements — server answered " + out.status);
      return;
    }
    return out.res.json().then(function (j) {
      var n = ((j && j.statements) || []).length;
      line("2 · LRS statements — OK (" + n + " statement" + (n === 1 ? "" : "s") + " in first read)");
      line("Result: everything works — Results CSV should succeed.");
    });
  }).catch(function (e) {
    line("Failed: " + e.message);
    if (/Failed to fetch/i.test(e.message)) {
      line("The token endpoint itself is unreachable from this browser — corporate proxy, VPN, or browser extension is blocking cross-origin requests to " + cfg.domain + ".");
    }
  });
}

function runXapiReport(btn) {
  var cfg = dcLoad();
  if (!btn) return;
  btn.disabled = true;
  var label = btn.innerHTML;
  btn.textContent = "Pulling…";

  function status(msg) {
    var el = $("reportStatus");
    if (el) { el.hidden = false; el.textContent = msg; }
  }

  /* all courses — no activity filter */
  dcFetchStatements(cfg, null, function (n) {
    btn.textContent = "Pulling… " + n + " rows";
  })
    .then(function (sts) {
      if (!sts.length) {
        status("Last pull: the LRS returned 0 statements.");
        toast("No statements found — colleagues need to run an xAPI course first", 8000);
        return;
      }
      var rows = sts.map(dcFlatten);
      if (cfg.simOnly) {
        /* keep only Standards in Motion courses — the LRS is shared with
           every other platform content (Easygenerator, AIVC, …) */
        rows = rows.filter(function (r) {
          return (r.course_activity || "").indexOf("/xapi/activities/sim/") >= 0;
        });
        if (!rows.length) {
          status("Last pull: " + sts.length + " LRS rows scanned · 0 from Standards in Motion courses — export the xAPI package, upload it to The Loop+ and launch it first.");
          toast("Pulled " + sts.length + " LRS rows but none are Standards in Motion statements yet — upload + launch your xAPI course in The Loop+ first (or untick the filter in Connection settings)", 10000);
          return;
        }
      }
      return dcEnrichUsers(rows, cfg).then(function () {
        var blob = new Blob([dcCsv(rows)], { type: "text/csv;charset=utf-8" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "standards_in_motion_results_" + new Date().toISOString().slice(0, 10) + ".csv";
      document.body.appendChild(a); a.click(); a.remove();
      var ppl = {};
      rows.forEach(function (r) { if (r.username || r.email) ppl[r.username || r.email] = 1; });
        status("Last pull: " + sts.length + " LRS rows scanned · " + rows.length + " rows exported · " + Object.keys(ppl).length + " colleagues · " + new Date().toLocaleTimeString());
        toast(rows.length + " rows · " + Object.keys(ppl).length + " colleagues → CSV downloaded", 8000);
      });
    })
    .catch(function (e) {
      status("Last pull failed: " + e.message);
      toast("Report failed — " + e.message, 8000);
    })
    .then(function () { btn.disabled = false; btn.innerHTML = label; });
}

