/* ============================================================
   Standards Studio — authoring tool for reel-format courses
   Storage: Supabase (cloud lane) or localStorage (local lane)
   Publish: English master → translate on publish → SCORM zip
   ============================================================ */
(function () {
"use strict";

var PUBLISH_LANGS = ["zh-CN", "zh-TW", "ja", "fr"];
var RUNTIME_FILES = ["player.html", "css/style.css", "js/i18n.js", "js/scorm.js", "js/xapi.js", "js/player.js"];
var DEMO_SRCS = { "media/reel1.mp4": 1, "media/reel2.mp4": 2, "media/reel3.mp4": 3 };

/* ---------------- state ---------------- */
var course = null;
var selected = -1;
var sb = null;              // supabase client
var cloud = false;          // signed-in cloud lane active
var blobStore = {};         // reelId -> File (local-lane uploads, session only)
var saveTimer = null;
var previewTimer = null;

function $(id){ return document.getElementById(id); }
function esc(s){ return String(s == null ? "" : s).replace(/[&<>"]/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]; }); }

function toast(msg, ms) {
  var t = document.createElement("div");
  t.className = "stoast";
  t.textContent = msg;
  $("toastHost").appendChild(t);
  setTimeout(function(){ t.remove(); }, ms || 2600);
}

/* ============================================================
   Course document
   ============================================================ */
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
    config: { series: "Service Essentials", passScore: 100, requireWatch: true, entry: "reels" },
    assessment: { enabled: false, passMark: 80, maxTries: 3, retryMode: "all", questions: [] },
    reels: [],
    i18n: {},
    updated_at: new Date().toISOString()
  };
}

function seedCourse() {
  var c = blankCourse("Service Essentials");
  var demo = MOI18N.EN.reels;
  var srcs = Object.keys(DEMO_SRCS);
  c.reels = demo.map(function (r, i) {
    return {
      id: ["fo-arrival", "fb-tableside", "hk-turndown"][i],
      src: srcs[i], srcType: "demo", length: "00:12",
      dept: r.dept, title: r.title,
      points: r.points.slice(),
      quiz: { q: r.quiz.q, options: r.quiz.options.slice(), answer: [1, 2, 2][i], why: r.quiz.why },
      tips: (r.tips || []).map(function (t) { return { img: t.img, title: t.title, text: t.text }; })
    };
  });
  /* seed a matching assessment: one question per standard */
  c.assessment.enabled = true;
  c.assessment.questions = demo.map(function (r, i) {
    return { q: r.quiz.q, options: r.quiz.options.slice(), answer: [1, 2, 2][i], why: r.quiz.why };
  });
  return c;
}

/* ============================================================
   Storage lanes
   ============================================================ */
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
    var row = { title: c.title, status: c.status, data: c, updated_at: c.updated_at, owner: (window.MOUser && window.MOUser.id) || null };
    if (isUuid(c.id)) row.id = c.id;
    return sb.from("sim_courses").upsert(row).select("id").then(function (res) {
      if (res.error) throw res.error;
      var newId = res.data && res.data[0] && res.data[0].id;
      if (newId && newId !== c.id) {
        c.id = newId; // adopt the server id and sync the embedded document
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
  },
  uploadVideo: function (courseId, reelId, file) {
    var path = courseId + "/" + reelId + ".mp4";
    return sb.storage.from("sim-media").upload(path, file, { upsert: true, contentType: "video/mp4" })
      .then(function (res) {
        if (res.error) throw res.error;
        return sb.storage.from("sim-media").getPublicUrl(path).data.publicUrl + "?v=" + Date.now();
      });
  }
};

function isUuid(s){ return /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(s); }
function lane(){ return cloud ? cloudLane : localLane; }

/* ============================================================
   Rendering
   ============================================================ */
function renderPills() {
  var pill = $("statusPill");
  pill.textContent = course.status === "published" ? "Published" : "Draft";
  pill.classList.toggle("published", course.status === "published");
  var mode = $("modePill");
  mode.textContent = cloud ? "Cloud" : "Local";
  mode.classList.toggle("cloud", cloud);
  var note = $("storageNote");
  if (cloud) {
    note.className = "rail-note";
    note.textContent = "Cloud lane — projects and media persist in Supabase.";
  } else {
    note.className = "rail-note warn";
    note.textContent = "Local lane — projects persist in this browser; uploaded videos live only for this session. Connect Supabase in Settings to persist media.";
  }
}

function renderList() {
  var host = $("reelList");
  host.innerHTML = course.reels.map(function (r, i) {
    var sel = i === selected ? " selected" : "";
    var vid = r.srcType === "none" ? '<span class="no-video">no video</span>' : esc(r.length);
    return '<div class="reel-item' + sel + '" data-i="' + i + '">' +
      '<div class="ri-num">Standard ' + String(i + 1).padStart(2, "0") + '</div>' +
      '<div class="ri-title">' + esc(r.title || "Untitled") + '</div>' +
      '<div class="ri-meta">' + esc(r.dept || "—") + ' · ' + vid + '</div>' +
    '</div>';
  }).join("");
  host.querySelectorAll(".reel-item").forEach(function (el) {
    el.addEventListener("click", function () {
      selected = parseInt(el.getAttribute("data-i"), 10);
      renderList(); renderEditor();
    });
  });
}

function renderEditor() {
  var r = course.reels[selected];
  $("editorEmpty").hidden = !!r;
  $("editorBody").hidden = !r;
  if (!r) return;

  $("fDept").value = r.dept;
  $("fTitle").value = r.title;
  $("fPoint1").value = r.points[0] || "";
  $("fPoint2").value = r.points[1] || "";
  $("fPoint3").value = r.points[2] || "";
  $("fQuizQ").value = r.quiz.q;
  $("fOpt0").value = r.quiz.options[0] || "";
  $("fOpt1").value = r.quiz.options[1] || "";
  $("fOpt2").value = r.quiz.options[2] || "";
  $("fQuizWhy").value = r.quiz.why;
  ["fCorrect0", "fCorrect1", "fCorrect2"].forEach(function (id, n) {
    $(id).checked = r.quiz.answer === n;
  });

  // video block
  var thumb = $("videoThumb"), tv = $("thumbVideo");
  if (r.srcType !== "none" && r.src) {
    var url = previewSrc(r);
    if (tv.getAttribute("src") !== url) { tv.src = url; tv.play().catch(function(){}); }
    thumb.classList.add("has-video");
  } else {
    tv.removeAttribute("src");
    thumb.classList.remove("has-video");
  }
  $("videoSrc").textContent =
    r.srcType === "demo" ? "Demo clip — " + r.src :
    r.srcType === "storage" ? "Cloud media — " + r.src.split("/").pop().split("?")[0] :
    r.srcType === "blob" ? "Session upload — " + r.src.replace("local://", "") : "No video attached";
  $("videoStats").textContent = r.srcType === "none" ? "" : ("Duration " + r.length);
  $("demoClipSelect").value = r.srcType === "demo" ? r.src : "";
}

function previewSrc(r) {
  if (r.srcType === "blob") {
    var f = blobStore[r.id];
    return f ? URL.createObjectURL(f) : "";
  }
  return r.src;
}

/* ============================================================
   Editing + autosave
   ============================================================ */
function markDirty() {
  if (course.status === "published") { course.status = "draft"; renderPills(); }
  course.updated_at = new Date().toISOString();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveCourse, 600);
  schedulePreview();
}

function saveCourse() {
  course.title = $("courseTitle").value || "Untitled series";
  course.config.series = course.title;
  /* embed the results endpoint so the SCORM player can stream per-question rows */
  try {
    var cfg = JSON.parse(localStorage.getItem("simSbConfig") || "null");
    if ((!cfg || !cfg.url) && window.MOAuth && window.MOAuth.config) cfg = window.MOAuth.config;
    if (cfg && cfg.url && cfg.key) course.config.telemetry = { url: cfg.url, key: cfg.key };
  } catch (e) {}
  lane().save(course).catch(function (e) {
    toast("Save failed — staying in local lane");
    cloud = false; renderPills();
    localLane.save(course);
  });
}

function bindField(id, fn) {
  $(id).addEventListener("input", function () {
    var r = course.reels[selected];
    if (!r) return;
    fn(r, $(id).value);
    renderList();
    markDirty();
  });
}

function wireEditor() {
  bindField("fDept",  function (r, v) { r.dept = v; });
  bindField("fTitle", function (r, v) { r.title = v; });
  bindField("fPoint1", function (r, v) { r.points[0] = v; });
  bindField("fPoint2", function (r, v) { r.points[1] = v; });
  bindField("fPoint3", function (r, v) { r.points[2] = v; });
  bindField("fQuizQ",  function (r, v) { r.quiz.q = v; });
  bindField("fOpt0", function (r, v) { r.quiz.options[0] = v; });
  bindField("fOpt1", function (r, v) { r.quiz.options[1] = v; });
  bindField("fOpt2", function (r, v) { r.quiz.options[2] = v; });
  bindField("fQuizWhy", function (r, v) { r.quiz.why = v; });
  ["fCorrect0", "fCorrect1", "fCorrect2"].forEach(function (id, n) {
    $(id).addEventListener("change", function () {
      var r = course.reels[selected];
      if (r) { r.quiz.answer = n; markDirty(); }
    });
  });

  $("courseTitle").addEventListener("input", markDirty);

  $("btnAddReel").addEventListener("click", function () {
    course.reels.push(blankReel(course.reels.length + 1));
    selected = course.reels.length - 1;
    renderList(); renderEditor(); markDirty();
  });

  $("btnDeleteReel").addEventListener("click", function () {
    if (selected < 0) return;
    course.reels.splice(selected, 1);
    selected = Math.min(selected, course.reels.length - 1);
    renderList(); renderEditor(); markDirty();
  });

  $("btnMoveUp").addEventListener("click", function () { moveReel(-1); });
  $("btnMoveDown").addEventListener("click", function () { moveReel(1); });

  $("fileInput").addEventListener("change", onVideoUpload);
  $("demoClipSelect").addEventListener("change", function () {
    var r = course.reels[selected];
    if (!r || !this.value) return;
    r.srcType = "demo";
    r.src = this.value;
    probeVideo(r, previewSrc(r));
    renderEditor(); markDirty();
  });
}

function moveReel(dir) {
  var i = selected, j = i + dir;
  if (i < 0 || j < 0 || j >= course.reels.length) return;
  var tmp = course.reels[i];
  course.reels[i] = course.reels[j];
  course.reels[j] = tmp;
  selected = j;
  renderList(); renderEditor(); markDirty();
}

/* ---------------- video attach ---------------- */
function onVideoUpload() {
  var file = this.files[0];
  var r = course.reels[selected];
  this.value = "";
  if (!file || !r) return;

  if (cloud) {
    toast("Uploading to cloud media…");
    cloudLane.uploadVideo(course.id, r.id, file).then(function (url) {
      r.srcType = "storage";
      r.src = url;
      probeVideo(r, url);
      renderEditor(); markDirty();
      toast("Video attached");
    }).catch(function () {
      toast("Upload failed — keeping video for this session only");
      r.srcType = "blob";
      blobStore[r.id] = file;
      r.src = "local://" + file.name;
      probeVideo(r, URL.createObjectURL(file));
      renderEditor(); markDirty();
    });
  } else {
    r.srcType = "blob";
    blobStore[r.id] = file;
    r.src = "local://" + file.name;
    probeVideo(r, URL.createObjectURL(file));
    renderEditor(); markDirty();
  }
}

function probeVideo(r, url) {
  var v = document.createElement("video");
  v.muted = true;
  v.preload = "metadata";
  v.src = url;
  v.addEventListener("loadedmetadata", function () {
    var s = Math.round(v.duration);
    r.length = String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
    renderEditor(); renderList(); markDirty();
  });
}

/* ============================================================
   Live preview
   ============================================================ */
function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(refreshPreview, 800);
}

function refreshPreview() {
  var c = JSON.parse(JSON.stringify(course));
  c.reels.forEach(function (r) {
    if (r.srcType === "blob") {
      var f = blobStore[r.id];
      r.src = f ? URL.createObjectURL(f) : "";
    }
  });
  try {
    localStorage.setItem("simStudioDraft", JSON.stringify(c));
    $("previewFrame").contentWindow.location.reload();
  } catch (e) {}
}

/* ============================================================
   Publish — translate on publish, then published lane
   ============================================================ */
function contentHash(s) {
  var h = 0;
  for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0x7fffffff;
  return h.toString(36);
}

function publish() {
  if (!course.reels.length) { toast("Add at least one reel before publishing"); return; }
  var missing = course.reels.filter(function (r) { return r.srcType === "none"; });
  if (missing.length) { toast(missing.length + " reel(s) have no video attached"); return; }

  var btn = $("btnPublish");
  btn.disabled = true;
  btn.textContent = "Translating…";

  var source = { reels: MOI18N.courseReelsEN(course) };
  var key = contentHash(JSON.stringify(source));
  var chain = Promise.resolve();

  PUBLISH_LANGS.forEach(function (code) {
    chain = chain.then(function () {
      btn.textContent = "Translating " + code + "…";
      return MOI18N.autoTranslate(code, source, "sim_pub_" + course.id + "_" + code + "_" + key)
        .then(function (dict) {
          course.i18n[code] = dict.reels;
        })
        .catch(function () { /* keep English for that language */ });
    });
  });

  chain.then(function () {
    course.status = "published";
    course.updated_at = new Date().toISOString();
    return lane().save(course);
  }).then(function () {
    btn.disabled = false;
    btn.textContent = "Publish";
    renderPills();
    toast("Published — 4 languages baked in");
  }).catch(function () {
    btn.disabled = false;
    btn.textContent = "Publish";
    toast("Publish failed — check the cloud connection");
  });
}

/* ============================================================
   SCORM export — compact, Docebo-ready
   ============================================================ */
function manifestXml(title, mediaFiles) {
  var files = ["index.html", "css/style.css", "js/i18n.js", "js/scorm.js", "js/xapi.js", "js/player.js", "js/course.js"]
    .concat(mediaFiles)
    .map(function (f) { return '      <file href="' + f + '"/>'; }).join("\n");
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
'<manifest identifier="MO-SIM-' + contentHash(title) + '" version="1.0"\n' +
'  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"\n' +
'  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"\n' +
'  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n' +
'  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd\n' +
'                      http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">\n' +
'  <metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>\n' +
'  <organizations default="MO-SIM-ORG">\n' +
'    <organization identifier="MO-SIM-ORG">\n' +
'      <title>' + esc(title) + '</title>\n' +
'      <item identifier="ITEM-001" identifierref="RES-001">\n' +
'        <title>' + esc(title) + '</title>\n' +
'      </item>\n' +
'    </organization>\n' +
'  </organizations>\n' +
'  <resources>\n' +
'    <resource identifier="RES-001" type="webcontent" adlcp:scormtype="sco" href="index.html">\n' +
files + '\n' +
'    </resource>\n' +
'  </resources>\n' +
'</manifest>\n';
}

function tincanXml(title) {
  var slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "series";
  return '<?xml version="1.0" encoding="utf-8"?>\n' +
'<tincan xmlns="http://projecttincan.com/tincan.xsd">\n' +
'  <activities>\n' +
'    <activity id="https://lms.mandarinoriental.com/xapi/activities/sim/' + slug + '" type="http://adlnet.gov/expapi/activities/course">\n' +
'      <name lang="en-US">' + esc(title) + '</name>\n' +
'      <description lang="en-US">' + esc(title) + ' — Standards in Motion</description>\n' +
'      <launch lang="en-US">index.html</launch>\n' +
'    </activity>\n' +
'  </activities>\n' +
'</tincan>\n';
}

function resolveVideoBlob(r) {
  if (r.srcType === "demo" || r.srcType === "storage") {
    return fetch(r.src).then(function (res) {
      if (!res.ok) throw new Error("fetch " + r.src);
      return res.blob();
    });
  }
  var f = blobStore[r.id];
  if (!f) throw new Error("missing blob " + r.id);
  return Promise.resolve(f);
}

function exportPackage(fmt) {
  if (!course.reels.length) { toast("Nothing to export — add a reel first"); return; }
  /* videoless reels are fine — the player auto-marks them watched (Quick
     Start test courses ship without videos on purpose) */
  var sessionOnly = course.reels.filter(function (r) { return r.srcType === "blob" && !blobStore[r.id]; });
  if (sessionOnly.length) { toast("Some session videos were lost on reload — re-attach them first"); return; }

  var xapi = fmt === "xapi";
  var btn = $(xapi ? "btnExportXapi" : "btnExport");
  btn.disabled = true;
  btn.textContent = "Packaging…";

  var zip = new JSZip();
  var mediaFiles = course.reels.map(function (r, i) {
    return r.srcType === "none" ? "" : "media/reel" + (i + 1) + ".mp4";
  });

  // tip-card images ride along under their existing media/tips/ paths
  var tipFiles = [];
  course.reels.forEach(function (r) {
    (r.tips || []).forEach(function (t) {
      if (t.img && !/^(https?:|data:)/.test(t.img) && tipFiles.indexOf(t.img) < 0) tipFiles.push(t.img);
    });
  });

  // course data with packaged media paths
  var data = JSON.parse(JSON.stringify(course));
  data.reels.forEach(function (r, i) {
    if (mediaFiles[i]) { r.src = mediaFiles[i]; r.srcType = "packaged"; }
    else { r.src = ""; r.srcType = "none"; }
  });

  var jobs = [];

  RUNTIME_FILES.forEach(function (f) {
    /* cache:'no-store' — the package must contain today's runtime files,
       not whatever the browser has cached from a previous version */
    jobs.push(fetch(f, { cache: "no-store" }).then(function (res) { return res.text(); }).then(function (txt) {
      zip.file(f === "player.html" ? "index.html" : f, txt);
    }));
  });

  course.reels.forEach(function (r, i) {
    if (!mediaFiles[i]) return;   /* videoless reel — nothing to pack */
    jobs.push(resolveVideoBlob(r).then(function (blob) {
      zip.file(mediaFiles[i], blob);
    }));
  });

  tipFiles.forEach(function (p) {
    jobs.push(fetch(p).then(function (res) {
      if (!res.ok) throw new Error("fetch " + p);
      return res.blob();
    }).then(function (blob) { zip.file(p, blob); }));
  });

  Promise.all(jobs).then(function () {
    zip.file("js/course.js", "window.MO_COURSE = " + JSON.stringify(data, null, 2) + ";\n");
    if (xapi) zip.file("tincan.xml", tincanXml(course.title));
    else zip.file("imsmanifest.xml", manifestXml(course.title, mediaFiles.filter(Boolean).concat(tipFiles)));
    return zip.generateAsync({ type: "blob", compression: "STORE" }); // video is already compressed — store, don't re-deflate
  }).then(function (blob) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = course.title.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_") + (xapi ? "_xAPI.zip" : "_SCORM12.zip");
    document.body.appendChild(a);
    a.click();
    a.remove();
    btn.disabled = false;
    btn.textContent = xapi ? "Export xAPI" : "Export SCORM";
    var mb = (blob.size / 1048576).toFixed(1);
    toast("Package exported — " + mb + " MB");
    /* non-blocking: keep a versioned copy in the cloud lane */
    savePackageVersion(fmt, blob).then(function (v) {
      if (v) toast("Cloud version v" + v + " saved (" + (xapi ? "xAPI" : "SCORM") + ")");
    }).catch(function () {
      toast("Cloud version save failed — the downloaded package is unaffected");
    });
  }).catch(function (e) {
    btn.disabled = false;
    btn.textContent = xapi ? "Export xAPI" : "Export SCORM";
    toast("Export failed — " + e.message);
  });
}

function exportScorm() { exportPackage("scorm"); }
function exportXapi()  { exportPackage("xapi"); }

/* ============================================================
   Cloud version history — every export also lands in Supabase
   ============================================================ */
function savePackageVersion(fmt, blob) {
  if (!cloud || !sb || !isUuid(course.id) || !(window.MOUser && window.MOUser.id)) return Promise.resolve(null);
  var uid = window.MOUser.id;
  return sb.from("sim_package_versions").select("version")
    .eq("course_id", course.id).eq("format", fmt)
    .order("version", { ascending: false }).limit(1)
    .then(function (res) {
      if (res.error) throw res.error;
      var v = (res.data && res.data[0] ? res.data[0].version : 0) + 1;
      var path = uid + "/" + course.id + "/v" + v + "/" + fmt + ".zip";
      return sb.storage.from("sim-packages").upload(path, blob, { contentType: "application/zip" })
        .then(function (up) {
          if (up.error) throw up.error;
          return sb.from("sim_package_versions").insert({
            course_id: course.id, owner: uid, version: v, format: fmt,
            title: course.title, file_path: path, size_bytes: blob.size
          }).then(function (ins) { if (ins.error) throw ins.error; return v; });
        });
    });
}

function openHistory() {
  if (!cloud || !sb || !isUuid(course.id)) {
    toast("Version history needs the cloud lane — sign in and save the series first");
    return;
  }
  var modal = $("historyModal"), host = $("historyList");
  host.innerHTML = '<p class="course-empty">Loading…</p>';
  modal.hidden = false;
  sb.from("sim_package_versions").select("id,version,format,title,file_path,size_bytes,created_at,note")
    .eq("course_id", course.id)
    .order("created_at", { ascending: false })
    .then(function (res) {
      if (res.error) { host.innerHTML = '<p class="course-empty">Could not load versions.</p>'; return; }
      if (!res.data || !res.data.length) {
        host.innerHTML = '<p class="course-empty">No packaged versions yet — export a SCORM or xAPI package and it will appear here.</p>';
        return;
      }
      host.innerHTML = res.data.map(function (r) {
        return '<div class="course-row" data-path="' + esc(r.file_path) + '">' +
          '<span class="cr-title">' + esc(r.format === "xapi" ? "xAPI" : "SCORM 1.2") + ' · v' + r.version + '</span>' +
          '<span class="cr-meta">' + new Date(r.created_at).toLocaleString() + ' · ' +
            (r.size_bytes / 1048576).toFixed(1) + ' MB</span>' +
          '<button class="cr-dl">Download</button>' +
        '</div>';
      }).join("");
      host.querySelectorAll(".course-row").forEach(function (row) {
        row.querySelector(".cr-dl").addEventListener("click", function () {
          sb.storage.from("sim-packages").createSignedUrl(row.getAttribute("data-path"), 120)
            .then(function (r2) {
              if (r2.error || !r2.data) { toast("Could not create a download link"); return; }
              window.open(r2.data.signedUrl, "_blank");
            });
        });
      });
    });
}


/* ============================================================
   Open / New
   ============================================================ */
function openModal() {
  lane().list().then(function (all) {
    var host = $("courseList");
    if (!all.length) {
      host.innerHTML = '<p class="course-empty">No saved series yet.</p>';
    } else {
      host.innerHTML = all.map(function (r) {
        return '<div class="course-row" data-id="' + esc(r.id) + '">' +
          '<span class="cr-title">' + esc(r.title) + '</span>' +
          '<span class="cr-meta">' + esc(r.status) + ' · ' + new Date(r.updated_at).toLocaleDateString() + '</span>' +
          '<button class="cr-del" data-del="' + esc(r.id) + '" aria-label="Delete">×</button>' +
        '</div>';
      }).join("");
      host.querySelectorAll(".course-row").forEach(function (row) {
        row.addEventListener("click", function (e) {
          var del = e.target.getAttribute("data-del");
          if (del) {
            e.stopPropagation();
            lane().remove(del).then(openModal);
            return;
          }
          var id = row.getAttribute("data-id");
          var found = all.filter(function (r) { return r.id === id; })[0];
          if (found) {
            course = found.data;
            selected = course.reels.length ? 0 : -1;
            $("courseTitle").value = course.title;
            renderPills(); renderList(); renderEditor(); refreshPreview();
            $("openModal").hidden = true;
            toast("Opened — " + course.title);
          }
        });
      });
    }
    $("openModal").hidden = false;
  }).catch(function () { toast("Could not load the course list"); });
}

/* ============================================================
   Settings / auth
   ============================================================ */
function connectSb(silent) {
  var url = $("sbUrl").value.trim(), key = $("sbKey").value.trim();
  if (!url || !key) { if (!silent) toast("Enter the project URL and anon key"); return; }
  try {
    sb = window.supabase.createClient(url, key);
  } catch (e) { toast("Invalid Supabase configuration"); return; }
  localStorage.setItem("simSbConfig", JSON.stringify({ url: url, key: key }));
  sb.auth.getSession().then(function (res) {
    $("authBlock").hidden = false;
    if (res.data && res.data.session) {
      cloud = true;
      showSignedIn(res.data.session.user.email);
    } else {
      showSignedOut();
    }
    renderPills();
    if (!silent) toast(cloud ? "Connected and signed in" : "Connected — sign in as an author");
  });

  sb.auth.onAuthStateChange(function (evt, session) {
    cloud = !!(session && session.user);
    if (cloud) showSignedIn(session.user.email); else showSignedOut();
    renderPills();
  });
}

function showSignedIn(email) {
  $("signedOut").hidden = true;
  $("signedIn").hidden = false;
  $("signedAs").textContent = "Signed in as " + email;
}
function showSignedOut() {
  $("signedOut").hidden = false;
  $("signedIn").hidden = true;
}

function wireSettings() {
  /* ---------- assessment settings panel ---------- */
  function ensureAssess() {
    if (!course.assessment) {
      course.assessment = { enabled: false, passMark: 80, maxTries: 3, retryMode: "all", questions: [] };
    }
    if (!course.config.entry) course.config.entry = "reels";
    return course.assessment;
  }

  function syncAssessmentPanel() {
    var a = ensureAssess();
    $("asEntry").value   = course.config.entry;
    $("asEnabled").checked = a.enabled;
    $("asPass").value    = a.passMark;
    $("asTries").value   = a.maxTries;
    $("asMode").value    = a.retryMode;
    $("asFields").hidden = !a.enabled;
    /* pre-assessment is baseline-only — no pass mark, tries or retry mode */
    $("asFinalOnly").hidden = course.config.entry === "pre" || course.config.entry === "preOnly";
    renderAsQuestions();
  }

  function blankAsQ() {
    return { q: "", options: ["", "", ""], answer: 0, why: "" };
  }

  function renderAsQuestions() {
    var a = ensureAssess();
    var host = $("asQList");
    host.innerHTML = "";
    if (!a.questions.length) {
      host.innerHTML = '<p class="as-empty">No questions yet — add the first one.</p>';
      return;
    }
    a.questions.forEach(function (q, qi) {
      var card = document.createElement("div");
      card.className = "as-qcard";
      card.innerHTML =
        '<div class="as-qtop"><span class="as-qnum">' + String(qi + 1).padStart(2, "0") + '</span>' +
        '<button class="mini-btn as-qdel" data-q="' + qi + '">Delete</button></div>' +
        '<label class="fld"><span>Question</span><input type="text" data-q="' + qi + '" data-f="q" value="' + escAttr(q.q) + '"></label>' +
        q.options.map(function (opt, n) {
          return '<div class="opt-row"><input type="radio" name="asCorrect' + qi + '" data-q="' + qi + '" data-n="' + n + '"' +
            (q.answer === n ? " checked" : "") + '>' +
            '<input type="text" data-q="' + qi + '" data-f="opt' + n + '" value="' + escAttr(opt) + '" placeholder="Option ' + "ABC"[n] + '"></div>';
        }).join("") +
        '<label class="fld"><span>Rationale</span><input type="text" data-q="' + qi + '" data-f="why" value="' + escAttr(q.why || "") + '"></label>';
      host.appendChild(card);
    });

    host.querySelectorAll("input[type=text]").forEach(function (inp) {
      inp.addEventListener("input", function () {
        var q = course.assessment.questions[parseInt(inp.getAttribute("data-q"), 10)];
        var f = inp.getAttribute("data-f");
        if (f === "q") q.q = inp.value;
        else if (f === "why") q.why = inp.value;
        else q.options[parseInt(f.slice(3), 10)] = inp.value;
        markDirty();
      });
    });
    host.querySelectorAll("input[type=radio]").forEach(function (rad) {
      rad.addEventListener("change", function () {
        course.assessment.questions[parseInt(rad.getAttribute("data-q"), 10)].answer = parseInt(rad.getAttribute("data-n"), 10);
        markDirty();
      });
    });
    host.querySelectorAll(".as-qdel").forEach(function (btn) {
      btn.addEventListener("click", function () {
        course.assessment.questions.splice(parseInt(btn.getAttribute("data-q"), 10), 1);
        renderAsQuestions();
        markDirty();
      });
    });
  }

  function escAttr(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;"); }

  $("asEntry").addEventListener("change", function () {
    ensureAssess(); course.config.entry = $("asEntry").value;
    $("asFinalOnly").hidden = course.config.entry === "pre" || course.config.entry === "preOnly";
    markDirty();
  });
  $("asEnabled").addEventListener("change", function () {
    ensureAssess().enabled = $("asEnabled").checked;
    $("asFields").hidden = !$("asEnabled").checked;
    markDirty();
  });
  $("asPass").addEventListener("input", function () {
    ensureAssess().passMark = Math.max(0, Math.min(100, parseInt($("asPass").value, 10) || 80)); markDirty();
  });
  $("asTries").addEventListener("input", function () {
    /* 0 = unlimited tries */
    var tv = parseInt($("asTries").value, 10);
    if (!isNaN(tv)) { ensureAssess().maxTries = Math.max(0, Math.min(50, tv)); markDirty(); }
  });
  $("asMode").addEventListener("change", function () {
    ensureAssess().retryMode = $("asMode").value; markDirty();
  });
  $("btnAddAsQ").addEventListener("click", function () {
    ensureAssess().questions.push(blankAsQ());
    renderAsQuestions();
    markDirty();
  });

  $("btnSettings").addEventListener("click", function () {
    $("settingsModal").hidden = false;
    syncAssessmentPanel();
    dcSyncPanel();
  });
  $("btnCloseSettings").addEventListener("click", function () { $("settingsModal").hidden = true; });
  $("btnConnect").addEventListener("click", function () { connectSb(false); });
  $("btnSignIn").addEventListener("click", function () {
    if (!sb) return;
    sb.auth.signInWithPassword({ email: $("sbEmail").value.trim(), password: $("sbPass").value })
      .then(function (res) {
        if (res.error) toast("Sign-in failed — " + res.error.message);
        else toast("Signed in");
      });
  });
  $("btnSignOut").addEventListener("click", function () {
    if (sb) sb.auth.signOut();
  });

  var cfg = null;
  try { cfg = JSON.parse(localStorage.getItem("simSbConfig") || "null"); } catch (e) {}
  if (cfg && !window.MOSB) {
    $("sbUrl").value = cfg.url;
    $("sbKey").value = cfg.key;
    connectSb(true);
  } else if (window.MOSB && cfg) {
    $("sbUrl").value = cfg.url;
    $("sbKey").value = cfg.key;
  }
}

/* ============================================================
   Boot
   ============================================================ */
function boot() {
  /* prefer the shared auth-gate client (MOAuth) over the manual simSbConfig lane */
  if (window.MOSB) {
    sb = window.MOSB;
    cloud = true;
    try { if ($("authBlock")) { $("authBlock").hidden = false; showSignedIn((window.MOUser && window.MOUser.email) || "author"); } } catch (e) {}
  }
  wireEditor();
  wireSettings();

  $("btnNew").addEventListener("click", function () {
    course = blankCourse();
    course.reels.push(blankReel(1));
    selected = 0;
    $("courseTitle").value = course.title;
    renderPills(); renderList(); renderEditor(); saveCourse(); refreshPreview();
  });
  $("btnOpen").addEventListener("click", openModal);
  $("btnCloseOpen").addEventListener("click", function () { $("openModal").hidden = true; });
  $("btnPublish").addEventListener("click", publish);
  $("btnExport").addEventListener("click", exportScorm);
  $("btnExportXapi").addEventListener("click", exportXapi);
  $("btnHistory").addEventListener("click", openHistory);
  $("btnCloseHistory").addEventListener("click", function () { $("historyModal").hidden = true; });
  ["dcDomain","dcClientId","dcSecret","dcUser","dcPass"].forEach(function (id) {
    $(id).addEventListener("input", dcSave);
  });
  $("btnRefreshPreview").addEventListener("click", refreshPreview);

  // open a course document in the editor
  function openCourse(c) {
    course = c;
    selected = course.reels.length ? 0 : -1;
    $("courseTitle").value = course.title;
    renderPills(); renderList(); renderEditor();
    setTimeout(refreshPreview, 400);
  }

  function restoreLast(all) {
    var lastId = localStorage.getItem("simStudioLast");
    var found = all.filter(function (r) { return r.id === lastId; })[0];
    openCourse(found ? found.data : seedCourse());
  }

  // entry routes: ?new=1 → blank series · ?id=… → deep-linked series
  // (from the Reel Studio library) · bare → last-open, else the demo series
  var params = new URLSearchParams(location.search);
  var wantId = params.get("id");

  if (params.get("new") === "1") {
    course = blankCourse();
    course.reels.push(blankReel(1));
    selected = 0;
    $("courseTitle").value = course.title;
    renderPills(); renderList(); renderEditor(); saveCourse(); refreshPreview();
    return;
  }

  localLane.list().then(function (all) {
    if (!wantId) { restoreLast(all); return; }

    var found = all.filter(function (r) { return r.id === wantId; })[0];
    if (found) { openCourse(found.data); return; }

    // not in the local lane — try the cloud lane with the saved config
    var cfg = null;
    try { cfg = JSON.parse(localStorage.getItem("simSbConfig") || "null"); } catch (e) {}
    if (cfg && window.supabase) {
      var client = window.supabase.createClient(cfg.url, cfg.key);
      client.auth.getSession().then(function () {
        return client.from("sim_courses").select("id,title,status,updated_at,data").eq("id", wantId);
      }).then(function (res) {
        var row = res && res.data && res.data[0];
        if (row) { openCourse(row.data); return; }
        toast("Series not found — opened the last project instead");
        restoreLast(all);
      }).catch(function () {
        toast("Series not found — opened the last project instead");
        restoreLast(all);
      });
      return;
    }
    toast("Series not found — opened the last project instead");
    restoreLast(all);
  });
}

document.addEventListener("DOMContentLoaded", function () {
  if (window.MOAuth) MOAuth.require(function () { boot(); });
  else boot();
});
})();
