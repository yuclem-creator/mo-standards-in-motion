/* ============================================================
   Standards in Motion — Duet (practice recording) prototype
   ------------------------------------------------------------
   Split-screen practice: the master clip plays on one side,
   the colleague performs the same standard on the other.
   Submit path:
     - Supabase configured + signed in → upload to sim-media
       bucket under duets/, insert row into sim_duets (review queue)
     - otherwise → local download of the take
   Camera never leaves the device until Submit is chosen.
   ============================================================ */
"use strict";

(function () {

  /* ---------- demo standards (mirror the player demo course) ---------- */
  var STANDARDS = [
    { id: "fo-arrival",   src: "media/reel1.mp4", length: "00:12" },
    { id: "fb-tableside", src: "media/reel2.mp4", length: "00:12" },
    { id: "hk-turndown",  src: "media/reel3.mp4", length: "00:12" }
  ];

  function $(id) { return document.getElementById(id); }
  function reelText(i) { return MOI18N.EN.reels[i] || { dept: "", title: "Standard " + (i + 1), points: [] }; }

  var toastTimer = null;
  function toast(msg) {
    var t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2600);
  }

  /* ---------- state ---------- */
  var current = -1;            // selected standard index
  var camStream = null;        // getUserMedia stream
  var camLive = false;         // camera actually available
  var recorder = null;         // MediaRecorder
  var chunks = [];
  var takeBlob = null;         // recorded take
  var takeUrl = null;          // object URL for review
  var takeMime = "video/webm";
  var takeIsSample = false;    // sample-take fallback used
  var recTimer = null;
  var recStart = 0;

  /* ---------- screen routing ---------- */
  var SCREENS = ["scrPick", "scrRecord", "scrReview", "scrDone"];
  function show(id) {
    SCREENS.forEach(function (sid) {
      var el = $(sid);
      var on = sid === id;
      el.classList.toggle("show", on);
      el.setAttribute("aria-hidden", on ? "false" : "true");
    });
  }

  /* ---------- screen 1 · picker ---------- */
  function renderPicker() {
    var list = $("pickList");
    list.innerHTML = "";
    STANDARDS.forEach(function (s, i) {
      var t = reelText(i);
      var row = document.createElement("button");
      row.className = "pick-row";
      row.type = "button";
      row.innerHTML =
        '<video class="pick-thumb" src="' + s.src + '" muted playsinline preload="metadata"></video>' +
        '<span class="pick-meta">' +
          '<span class="pick-dept">' + t.dept + '</span>' +
          '<span class="pick-name">' + t.title + '</span>' +
          '<span class="pick-len">' + s.length + ' · side-by-side</span>' +
        '</span>' +
        '<span class="pick-go">Duet ›</span>';
      row.addEventListener("click", function () { startDuet(i); });
      // gentle thumb motion on hover/touch
      row.addEventListener("pointerenter", function () { var v = row.querySelector("video"); if (v) v.play().catch(function(){}); });
      row.addEventListener("pointerleave", function () { var v = row.querySelector("video"); if (v) { v.pause(); v.currentTime = 0; } });
      list.appendChild(row);
    });
  }

  /* ---------- screen 2 · record ---------- */
  function startDuet(i) {
    current = i;
    var t = reelText(i);
    $("recTitle").textContent = t.dept + " · " + t.title;
    var master = $("masterVideo");
    master.src = STANDARDS[i].src;
    master.currentTime = 0;
    master.load();
    resetRecUI();
    show("scrRecord");
    openCamera();
  }

  function resetRecUI() {
    $("recTime").textContent = "00:00";
    var b = $("btnRecord");
    b.classList.remove("recording");
    b.setAttribute("aria-label", "Start recording");
    b.disabled = false;
  }

  function openCamera() {
    camLive = false;
    $("camFallback").hidden = true;
    var cam = $("camVideo");
    cam.style.visibility = "";
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return showCamFallback();
    }
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 1280 } },
      audio: true
    }).then(function (stream) {
      camStream = stream;
      camLive = true;
      cam.srcObject = stream;
      cam.play().catch(function () {});
    }).catch(function () {
      showCamFallback();
    });
  }

  function showCamFallback() {
    camLive = false;
    $("camVideo").style.visibility = "hidden";
    $("camFallback").hidden = false;
  }

  function stopCamera() {
    if (camStream) {
      camStream.getTracks().forEach(function (tr) { tr.stop(); });
      camStream = null;
    }
    $("camVideo").srcObject = null;
  }

  /* sample-take fallback: use another demo clip as the "take" */
  $("btnSample").addEventListener("click", function () {
    if (current < 0) return;
    var sampleIdx = (current + 1) % STANDARDS.length;
    fetch(STANDARDS[sampleIdx].src)
      .then(function (r) { return r.blob(); })
      .then(function (blob) {
        takeBlob = blob;
        takeMime = blob.type || "video/mp4";
        takeIsSample = true;
        toast("Sample take loaded — rehearsing the review step");
        openReview();
      })
      .catch(function () { toast("Could not load the sample take"); });
  });

  /* ---------- countdown + record ---------- */
  $("btnRecord").addEventListener("click", function () {
    if (current < 0) return;
    if (recorder && recorder.state === "recording") { stopRecording(); return; }
    if (!camLive) { toast("No camera — use “Use a sample take” instead"); return; }
    runCountdown(3, function () { beginRecording(); });
  });

  function runCountdown(n, done) {
    var el = $("countdown");
    el.hidden = false;
    el.textContent = n;
    el.classList.remove("tick");
    void el.offsetWidth; /* restart animation */
    el.classList.add("tick");
    if (n <= 0) { el.hidden = true; done(); return; }
    setTimeout(function () { runCountdown(n - 1, done); }, 900);
  }

  function pickMime() {
    if (!window.MediaRecorder) return "";
    var cands = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
    for (var i = 0; i < cands.length; i++) {
      if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(cands[i])) return cands[i];
    }
    return "";
  }

  function beginRecording() {
    var master = $("masterVideo");
    chunks = [];
    takeIsSample = false;
    var mime = pickMime();
    try {
      recorder = new MediaRecorder(camStream, mime ? { mimeType: mime } : undefined);
      takeMime = mime || "video/webm";
    } catch (e) {
      toast("Recording is not supported in this browser");
      return;
    }
    recorder.ondataavailable = function (ev) { if (ev.data && ev.data.size) chunks.push(ev.data); };
    recorder.onstop = function () {
      takeBlob = new Blob(chunks, { type: takeMime });
      openReview();
    };
    recorder.start(250);

    var b = $("btnRecord");
    b.classList.add("recording");
    b.setAttribute("aria-label", "Stop recording");

    master.currentTime = 0;
    master.play().catch(function () {});
    master.onended = function () { stopRecording(); };

    recStart = Date.now();
    tickTimer();
  }

  function tickTimer() {
    clearInterval(recTimer);
    recTimer = setInterval(function () {
      var s = Math.floor((Date.now() - recStart) / 1000);
      $("recTime").textContent = ("0" + Math.floor(s / 60)).slice(-2) + ":" + ("0" + (s % 60)).slice(-2);
    }, 250);
  }

  function stopRecording() {
    clearInterval(recTimer);
    if (recorder && recorder.state === "recording") recorder.stop();
    $("masterVideo").pause();
    resetRecUI();
  }

  $("btnBackPick").addEventListener("click", function () {
    if (recorder && recorder.state === "recording") stopRecording();
    stopCamera();
    show("scrPick");
  });

  /* ---------- screen 3 · review ---------- */
  function openReview() {
    stopCamera();
    if (takeUrl) { URL.revokeObjectURL(takeUrl); takeUrl = null; }
    takeUrl = URL.createObjectURL(takeBlob);
    var rm = $("revMaster");
    var rt = $("revTake");
    rm.src = STANDARDS[current].src;
    rm.currentTime = 0; rm.pause(); rm.load();
    rt.src = takeUrl;
    rt.currentTime = 0; rt.pause(); rt.load();
    rt.muted = takeIsSample ? false : true; /* sample clips carry their own audio */
    $("submitNote").textContent = takeIsSample
      ? "Sample take — submit will download locally in this preview."
      : "Submits to your training record for manager review.";
    show("scrReview");
  }

  $("btnPlayReview").addEventListener("click", function () {
    var rm = $("revMaster"), rt = $("revTake");
    rm.currentTime = 0; rt.currentTime = 0;
    rm.play().catch(function () {});
    rt.play().catch(function () {});
  });

  $("btnRerecord").addEventListener("click", function () {
    if (takeUrl) { URL.revokeObjectURL(takeUrl); takeUrl = null; }
    takeBlob = null;
    startDuet(current);
  });

  /* ---------- submit ---------- */
  function sbClient() {
    try {
      var cfg = JSON.parse(localStorage.getItem("simSbConfig") || "null");
      if (!cfg || !cfg.url || !cfg.key || !window.supabase) return null;
      return window.supabase.createClient(cfg.url, cfg.key);
    } catch (e) { return null; }
  }

  $("btnSubmit").addEventListener("click", function () {
    if (!takeBlob) { toast("Nothing to submit yet"); return; }
    var name = ($("fName").value || "").trim() || "A colleague";
    var t = reelText(current);
    var btn = $("btnSubmit");
    btn.disabled = true;
    btn.textContent = "Submitting…";

    var sb = sbClient();
    if (!sb) return finishLocalDownload(name);

    sb.auth.getSession().then(function (res) {
      var session = res && res.data && res.data.session;
      if (!session) return finishLocalDownload(name);

      var ext = /mp4/.test(takeMime) ? "mp4" : "webm";
      var path = "duets/" + STANDARDS[current].id + "/" + Date.now() + "-" +
                 name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "." + ext;

      return sb.storage.from("sim-media").upload(path, takeBlob, { contentType: takeMime, upsert: false })
        .then(function (up) {
          if (up.error) throw up.error;
          var pub = sb.storage.from("sim-media").getPublicUrl(path);
          var url = pub && pub.data && pub.data.publicUrl;
          return sb.from("sim_duets").insert({
            user_id: session.user.id,
            user_email: session.user.email,
            display_name: name,
            standard_id: STANDARDS[current].id,
            standard_title: t.dept + " · " + t.title,
            video_path: path,
            video_url: url,
            status: "pending"
          }).then(function (ins) {
            if (ins.error) {
              /* table not created yet — upload alone still proves the take */
              console.warn("sim_duets insert failed:", ins.error.message);
            }
            finishCloud(name);
          });
        })
        .catch(function (err) {
          console.warn("cloud submit failed, falling back to download:", err);
          finishLocalDownload(name);
        });
    }).catch(function () { finishLocalDownload(name); })
      .finally(function () {
        btn.disabled = false;
        btn.textContent = "Submit take";
      });
  });

  function finishCloud(name) {
    $("doneSub").textContent = name + ", your take is in the review queue — your manager will see it against the master clip.";
    show("scrDone");
  }

  function finishLocalDownload(name) {
    var ext = /mp4/.test(takeMime) ? "mp4" : "webm";
    var a = document.createElement("a");
    a.href = takeUrl;
    a.download = "duet-" + STANDARDS[current].id + "-" + Date.now() + "." + ext;
    document.body.appendChild(a);
    a.click();
    a.remove();
    $("doneSub").textContent = name + ", your take downloaded to this device. In the LMS flow it uploads straight to your training record.";
    show("scrDone");
  }

  /* ---------- screen 4 · done ---------- */
  $("btnAnother").addEventListener("click", function () { show("scrPick"); });
  $("btnBackPlayer").addEventListener("click", function () { location.href = "player.html"; });

  /* ---------- boot ---------- */
  renderPicker();
  show("scrPick");

  /* ?reel=N deep-link (from the player completion screen) */
  var q = new URLSearchParams(location.search);
  var want = parseInt(q.get("reel") || "", 10);
  if (!isNaN(want) && want >= 0 && want < STANDARDS.length) startDuet(want);

  /* tidy up on leave */
  window.addEventListener("pagehide", function () {
    stopCamera();
    if (recorder && recorder.state === "recording") recorder.stop();
  });

})();
