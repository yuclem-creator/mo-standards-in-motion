/* ============================================================
   Standards in Motion — player runtime
   TikTok-format microlearning · SCORM-tracked · multilingual
   ------------------------------------------------------------
   Course data resolution order:
     1. ?draft=1        → localStorage "simStudioDraft" (Studio preview)
     2. js/course.js    → window.MO_COURSE (packaged course)
     3. built-in demo   → REELS below + MOI18N curated content
   ============================================================ */
"use strict";

var CONFIG = {
  series      : "Service Essentials · Three Standards",
  passScore   : 100,               // % of reels that must be watched to complete
  requireWatch: true,              // soft-gate: finish a reel to unlock the next
  autoPlay    : true,
  beatMs      : 280                // fade-to-black beat between reels
};

/* Built-in demo course (used when no course data is present) */
var DEMO_REELS = [
  { id: "fo-arrival",   src: "media/reel1.mp4", length: "00:12", answer: 1,
    check: { format: "beat",
      prompt : "Tap the moment the guest is acknowledged",
      window : [2.4, 5.6],          // seconds into the clip
      why    : "Ten seconds — presence before process. The acknowledgement lands the moment the doors part." } },
  { id: "fb-tableside", src: "media/reel2.mp4", length: "00:12", answer: 2,
    check: { format: "spot",
      prompt : "Freeze frame — tap what makes this pour correct",
      at     : 6.0,                 // freeze this many seconds in
      zones  : [ { x: 0.50, y: 0.56, r: 0.20 } ],   // fraction of frame w/h
      why    : "Label out, one-third of the glass — the two signatures of the pour." } },
  { id: "hk-turndown",  src: "media/reel3.mp4", length: "00:12", answer: 2 }
];

/* Demo assessment (used when no course document is present) */
var DEMO_ASSESS = {
  enabled  : true,
  passMark : 80,
  maxTries : 3,
  retryMode: "all",               // "all" = retake everything · "wrongOnly" = retake missed questions
  questions: [
    { q: "An arriving guest should be acknowledged within…",
      options: ["Five seconds", "Ten seconds", "Thirty seconds"], answer: 1,
      why: "Ten seconds — presence before process." },
    { q: "The door is opened with…",
      options: ["The nearer hand", "The hand furthest from the guest", "Either hand"], answer: 1,
      why: "The far hand keeps the threshold clear — and the welcome open." },
    { q: "Wine is presented and poured from…",
      options: ["The guest's right", "The guest's left", "Whichever side is clear"], answer: 0,
      why: "Always from the right, label facing the guest." },
    { q: "The glass is filled to…",
      options: ["One half", "Two thirds", "One third"], answer: 2,
      why: "One-third leaves the wine room to breathe." },
    { q: "The turndown duvet corner is folded at…",
      options: ["Thirty degrees", "Forty-five degrees", "Ninety degrees"], answer: 1,
      why: "Forty-five degrees, seam inward — the signature fold." },
    { q: "When a guest's name is learned, it should be used…",
      options: ["Once, at farewell", "Naturally, at least twice", "Only in writing"], answer: 1,
      why: "Used naturally — recognition is the quiet luxury." },
    { q: "Luggage is carried…",
      options: ["In front of the guest", "Beside the guest", "The guest carries their own"], answer: 1,
      why: "Beside the guest — never between them and the welcome." },
    { q: "A wine cork is presented to the host…",
      options: ["In the palm of your hand", "On a small side plate", "It is discarded at the bar"], answer: 1,
      why: "On a side plate, to the host's right — never palmed." },
    { q: "During turndown, the bedside is set with…",
      options: ["Water only", "Water and glasses on coasters", "Whatever was there before"], answer: 1,
      why: "Water and glasses on coasters — prepared, not left." }
  ]
};

/* ------------------------------------------------------------ */

var COURSE = null;     // course document, when running packaged/draft content
var ASSESS = null;     // resolved assessment config, or null
var ENTRY  = "reels";  // "reels" = exercise then assessment · "assessment" = assessment only
                       // "pre" = pre-assessment then exercise · "preOnly" = pre-assessment only
function isBaseline() { return ENTRY === "pre" || ENTRY === "preOnly"; }

/* ---------- results telemetry: one row per question to Supabase (optional) ---------- */
function telemetryCfg() {
  return (COURSE && COURSE.config && COURSE.config.telemetry) || null;
}
function sendRow(event) {
  var cfg = telemetryCfg();
  if (!cfg || !cfg.url || !cfg.key) return;
  var who = MOXapi.isActive() ? MOXapi.who() : MOScorm.who();
  var row = Object.assign({
    course   : (COURSE && COURSE.title) || "demo",
    entry    : ENTRY,
    user_id  : who.id,
    user_name: who.name,
    at       : new Date().toISOString()
  }, event);
  try {
    fetch(cfg.url.replace(/\/$/, "") + "/rest/v1/sim_assessment_rows", {
      method : "POST",
      headers: { "apikey": cfg.key, "Authorization": "Bearer " + cfg.key,
                 "Content-Type": "application/json", "Prefer": "return=minimal" },
      body   : JSON.stringify(row),
      keepalive: true
    }).catch(function () {});
  } catch (e) {}
}
/* every LMS interaction also becomes one telemetry row + one xAPI statement */
var qShownAt = 0;   /* when the current question appeared — for per-question duration */
function isoDur(ms) {
  var s = Math.max(0, Math.round(ms / 1000));
  var h = Math.floor(s / 3600); s -= h * 3600;
  var m = Math.floor(s / 60); s -= m * 60;
  return "PT" + (h ? h + "H" : "") + (m ? m + "M" : "") + s + "S";
}
function reportQ(inter, extra) {
  extra = extra || {};
  MOScorm.reportInteraction(inter);
  sendRow(Object.assign({ kind: "question", interaction_id: inter.id, chosen: inter.chosen,
    correct_answer: inter.correct, result: inter.result }, extra));
  if (extra.kind === "summary") {
    if (typeof extra.score === "number") {
      MOXapi.scored(extra.score, { baseline: isBaseline(), try: assessState.tries });
    }
  } else {
    MOXapi.answered({
      id     : inter.id,
      text   : extra.text  || inter.id,
      topic  : extra.topic || null,
      chosen : inter.chosen,
      correct: inter.correct,
      success: inter.result === "correct",
      try    : extra.try,
      chosenText : extra.chosenText  || null,
      correctText: extra.correctText || null,
      duration: qShownAt ? isoDur(Date.now() - qShownAt) : null
    });
  }
}
var REELS = [];
var stage, track, segmentsEl, counterEl, toastEl, beatEl, completeEl, hintEl;
var menuEl, langBtnEl;
var reels = [];
var index = 0;
var animating = false;
var started = false;
var menuOpen = true;
var selectedLang = "en";
var DICT = null;
var state = { watched: [], answers: [], score: 0, completed: false, lang: "en" };
var quizEl = null;
var quizOpen = false;
var assessEl = null;
var assessOpen = false;
var assessState = { tries: 0, correct: [], passed: false, best: 0 };
var tipsEl = null;
var tipsOpen = false;
var isDraft = false;

function $(id){ return document.getElementById(id); }
function ui(key){ return (DICT && DICT.ui && DICT.ui[key]) || MOI18N.EN.ui[key] || key; }
function reelText(i){ return (DICT && DICT.reels && DICT.reels[i]) || MOI18N.EN.reels[i]; }

/* ---------- course loading ---------- */
function loadCourse() {
  if (/[?&]draft=1/.test(location.search)) {
    isDraft = true;
    try {
      var draft = JSON.parse(localStorage.getItem("simStudioDraft") || "null");
      if (draft && draft.reels && draft.reels.length) return draft;
    } catch (e) {}
  }
  if (window.MO_COURSE && window.MO_COURSE.reels && window.MO_COURSE.reels.length) {
    return window.MO_COURSE;
  }
  return null;
}

function applyCourse(course) {
  COURSE = course;
  if (course) {
    if (course.config) {
      if (course.config.series)       CONFIG.series       = course.config.series;
      if (course.config.passScore)    CONFIG.passScore    = course.config.passScore;
      if (course.config.requireWatch != null) CONFIG.requireWatch = !!course.config.requireWatch;
    }
    REELS = course.reels.map(function (r, i) {
      return {
        id    : r.id || ("reel-" + (i + 1)),
        src   : r.src,
        length: r.length || "00:20",
        answer: (r.quiz && r.quiz.answer != null) ? r.quiz.answer : 0
      };
    });
  } else {
    REELS = DEMO_REELS.slice();
  }
  resolveAssess();
}

/* ---------- assessment config resolution ---------- */
function resolveAssess() {
  ASSESS = null;
  if (COURSE && COURSE.assessment && COURSE.assessment.enabled &&
      COURSE.assessment.questions && COURSE.assessment.questions.length) {
    ASSESS = COURSE.assessment;
  } else if (!COURSE) {
    ASSESS = DEMO_ASSESS;
  }
  if (ASSESS) {
    ASSESS.passMark  = ASSESS.passMark  || 80;
    if (typeof ASSESS.maxTries !== "number") ASSESS.maxTries = 3;   /* 0 = unlimited */
    ASSESS.retryMode = ASSESS.retryMode || "all";
    if (/[?&]retry=wrong/.test(location.search)) ASSESS.retryMode = "wrongOnly";   // preview hook
    if (/[?&]tries=0/.test(location.search)) ASSESS.maxTries = 0;                  // preview hook: unlimited
  }
  ENTRY = "reels";
  if (COURSE && COURSE.config && COURSE.config.entry === "assessment") ENTRY = "assessment";
  if (COURSE && COURSE.config && COURSE.config.entry === "pre") ENTRY = "pre";
  if (COURSE && COURSE.config && COURSE.config.entry === "preOnly") ENTRY = "preOnly";
  if (/[?&]entry=assessment/.test(location.search)) ENTRY = "assessment";           // preview hook
  if (/[?&]entry=preOnly/.test(location.search)) ENTRY = "preOnly";                 // preview hook
  else if (/[?&]entry=pre/.test(location.search)) ENTRY = "pre";                    // preview hook
  if ((ENTRY === "assessment" || isBaseline()) && !ASSESS) ENTRY = "reels";
}

/* ---------- build DOM ---------- */
function build() {
  stage      = $("stage");
  track      = $("reelTrack");
  segmentsEl = $("segments");
  counterEl  = $("counter");
  toastEl    = $("toast");
  beatEl     = $("beat");
  completeEl = $("complete");
  hintEl     = $("swipeHint");

  var glyph = document.createElement("div");
  glyph.className = "pause-glyph";
  glyph.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>';
  stage.appendChild(glyph);

  langBtnEl = document.createElement("button");
  langBtnEl.className = "lang-btn";
  langBtnEl.setAttribute("aria-label", "Change language");
  langBtnEl.addEventListener("click", function (e) {
    e.stopPropagation();
    openMenu();
  });
  document.querySelector(".chrome-top").appendChild(langBtnEl);

  REELS.forEach(function (r, i) {
    var seg = document.createElement("div");
    seg.className = "seg";
    seg.innerHTML = "<i></i>";
    segmentsEl.appendChild(seg);

    var el = document.createElement("section");
    el.className = "reel";
    el.style.top = (i * 100) + "%";
    el.innerHTML =
      '<video' + (r.src ? ' src="' + r.src + '"' : '') + ' playsinline webkit-playsinline preload="auto" muted></video>' +
      '<div class="scrim"></div>' +
      '<div class="reel-seal"><div class="ring"><svg viewBox="0 0 24 24"><path d="M4 12l5 5L20 6" stroke="#b9975b" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></div><span class="seal-label"></span></div>' +
      '<div class="reel-body"></div>';
    track.appendChild(el);

    var video = el.querySelector("video");
    wireVideo(video, i);

    reels.push({
      el: el,
      video: video,
      seg: seg,
      segFill: seg.querySelector("i"),
      watched: false
    });
    if (!r.src) markWatched(i);   /* videoless reel — nothing to watch, gate opens */
  });

  quizEl = document.createElement("section");
  quizEl.className = "quiz";
  quizEl.setAttribute("aria-hidden", "true");
  stage.appendChild(quizEl);

  tipsEl = document.createElement("section");
  tipsEl.className = "tips";
  tipsEl.setAttribute("aria-hidden", "true");
  stage.appendChild(tipsEl);

  assessEl = document.createElement("section");
  assessEl.className = "quiz assess";
  assessEl.setAttribute("aria-hidden", "true");
  stage.appendChild(assessEl);

  buildMenu();
  wireGestures();
  wireButtons();
}

/* ---------- text rendering (re-run on language change) ---------- */
function renderAll() {
  document.querySelector(".brand-sub").textContent = "Standards in Motion";
  hintEl.querySelector("span").textContent = ui("swipeHint");
  $("soundLabel").textContent = reels[index] && reels[index].video.muted ? ui("sound") : ui("muted");
  document.querySelector("#btnReplay .rail-label").textContent = ui("replay");
  langBtnEl.textContent = selectedLang.toUpperCase();
  stage.dir = MOI18N.isRTL(selectedLang) ? "rtl" : "ltr";

  reels.forEach(function (r, i) {
    var t = reelText(i);
    r.el.querySelector(".seal-label").innerHTML = ui("standardMet").replace(" ", "&nbsp;");
    r.el.querySelector(".reel-body").innerHTML =
      '<div class="reel-kicker"><span class="dot"></span><span>' + t.dept + '</span></div>' +
      '<h1 class="reel-title">' + t.title + '</h1>' +
      '<ul class="reel-points">' + t.points.map(function(p){ return "<li>" + p + "</li>"; }).join("") + '</ul>' +
      '<div class="reel-duration">' + ui("standard") + ' <b>' + String(i+1).padStart(2,"0") + '</b> · ' + ui("duration") + ' <b>' + REELS[i].length + '</b></div>';
  });

  completeEl.querySelector(".complete-title").textContent = ui("completeTitle");
  $("completeSub").textContent = ui("series");
  $("btnRewatch").textContent = ui("rewatch");
  var duetBtn = $("btnDuet");
  if (duetBtn) duetBtn.textContent = ui("duet");
  $("btnExit").textContent = ui("finish");
  var resetBtn2 = $("btnReset");
  if (resetBtn2) resetBtn2.textContent = ui("resetProgress");
}

/* ---------- main menu / language selection ---------- */
function buildMenu() {
  menuEl = document.createElement("section");
  menuEl.className = "menu show";
  menuEl.setAttribute("aria-hidden", "false");
  stage.appendChild(menuEl);
  renderMenu();
}

function renderMenu() {
  var list = MOI18N.LANGS.map(function (l) {
    var sel = l.code === selectedLang ? " selected" : "";
    var baked = l.curated || l.code === "en" || (COURSE && COURSE.i18n && COURSE.i18n[l.code]);
    var tag = baked ? "" : '<em class="menu-auto">auto</em>';
    return '<button class="menu-lang' + sel + '" data-code="' + l.code + '">' +
           '<span>' + l.name + '</span>' + tag + '</button>';
  }).join("");

  menuEl.innerHTML =
    '<div class="menu-inner">' +
      '<div class="menu-fan">MO</div>' +
      '<div class="menu-rule"></div>' +
      '<h2 class="menu-title">Standards in Motion</h2>' +
      '<p class="menu-sub" id="menuSeries">' + ui("series") + '</p>' +
      '<p class="menu-select">' + ui("selectLanguage") + '</p>' +
      '<div class="menu-list">' + list + '</div>' +
      '<button class="btn-gold menu-begin">' + ui("begin") + '</button>' +
      '<p class="menu-status"></p>' +
    '</div>';

  menuEl.querySelectorAll(".menu-lang").forEach(function (btn) {
    btn.addEventListener("click", function () {
      selectedLang = btn.getAttribute("data-code");
      menuEl.querySelectorAll(".menu-lang").forEach(function (b) { b.classList.remove("selected"); });
      btn.classList.add("selected");
    });
  });

  menuEl.querySelector(".menu-begin").addEventListener("click", onBegin);
}

function onBegin() {
  var status = menuEl.querySelector(".menu-status");
  var beginBtn = menuEl.querySelector(".menu-begin");
  beginBtn.disabled = true;

  applyLang(selectedLang, function () {
    status.textContent = ui("translating");
  }).then(function () {
    state.lang = selectedLang;
    MOScorm.report(state);
    closeMenu();
    if (!started) started = true;
    if (ENTRY === "assessment" || isBaseline()) { showAssessIntro(); return; }
    var v = reels[index].video;
    v.play().catch(function(){});
    setTimeout(hideHint, 5000);
  }).catch(function () {
    beginBtn.disabled = false;
    status.textContent = "";
  });
}

function applyLang(code, onTranslating) {
  selectedLang = code;
  var dict = MOI18N.resolveDict(code, COURSE);
  if (dict) {
    DICT = dict;
    renderAll();
    renderMenuTexts();
    return Promise.resolve();
  }
  if (onTranslating) onTranslating();
  var cacheKey = "mo_i18n_" + code + "_" + (COURSE ? (COURSE.id || "course") : "demo");
  return MOI18N.autoTranslate(code, MOI18N.translatableSource(COURSE), cacheKey)
    .then(function (auto) {
      if (COURSE && COURSE.config && COURSE.config.series) auto.ui.series = COURSE.config.series;
      DICT = auto;
      renderAll();
      renderMenuTexts();
    });
}

function renderMenuTexts() {
  if (!menuEl) return;
  var s = menuEl.querySelector("#menuSeries");
  if (s) s.textContent = ui("series");
  var sel = menuEl.querySelector(".menu-select");
  if (sel) sel.textContent = ui("selectLanguage");
  var begin = menuEl.querySelector(".menu-begin");
  if (begin) begin.textContent = ui("begin");
}

function openMenu() {
  menuOpen = true;
  if (started && reels[index]) reels[index].video.pause();
  renderMenu();
  menuEl.classList.add("show");
  menuEl.setAttribute("aria-hidden", "false");
}

function closeMenu() {
  menuOpen = false;
  menuEl.classList.remove("show");
  menuEl.setAttribute("aria-hidden", "true");
}

/* ---------- video events ---------- */
function wireVideo(video, i) {
  video.addEventListener("timeupdate", function () {
    if (i !== index || !video.duration) return;
    var pct = Math.min(100, (video.currentTime / video.duration) * 100);
    reels[i].segFill.style.width = pct + "%";
    /* 'ended' is unreliable on some mobile browsers — 95% counts as watched */
    if (pct >= 95) markWatched(i);
  });

  video.addEventListener("ended", function () {
    markWatched(i);
    if (i === index && !state.completed && i < reels.length - 1) {
      if (hintEl) hintEl.classList.remove("hidden");
      toast(ui("metSwipe"));
    }
  });

  /* a broken video must NOT silently unlock the gate (that made reels
     freely swipable in the LMS when the CDN failed to serve the file) —
     surface a deliberate tap-to-continue instead */
  video.addEventListener("error", function () {
    if (!video.getAttribute("src")) return;   /* videoless reel — handled at build */
    showSkipGate(i);
  });
}

function showSkipGate(i) {
  var reel = reels[i];
  if (!reel || reel.el.querySelector(".reel-skip")) return;
  var btn = document.createElement("button");
  btn.className = "reel-skip";
  btn.type = "button";
  btn.innerHTML = "<span>Video unavailable</span><em>Tap to continue to the question</em>";
  btn.addEventListener("click", function (e) {
    e.stopPropagation();
    btn.remove();
    markWatched(i);
  });
  reel.el.appendChild(btn);
}

function markWatched(i) {
  if (reels[i].watched) return;
  reels[i].watched = true;
  reels[i].el.classList.add("watched");
  reels[i].seg.classList.add("done");
  reels[i].segFill.style.width = "100%";
  state.watched[i] = true;
  updateScore();
  MOScorm.report(state);
  if (state.completed) setTimeout(finishExercise, 500);
}

function updateScore() {
  var watchedCount = reels.filter(function (r) { return r.watched; }).length;
  var answered = state.answers.filter(function (a) { return a != null; });
  var correctCount = 0;
  state.answers.forEach(function (a, i) {
    if (a != null && a === REELS[i].answer) correctCount++;
  });
  var allAnswered = answered.length === reels.length;
  state.score = answered.length
    ? Math.round((correctCount / reels.length) * 100)
    : Math.round((watchedCount / reels.length) * 100);
  state.completed = watchedCount === reels.length && allAnswered;
}

/* ---------- quiz ---------- */
function reelCheck(i) {
  /* authored courses run MCQ only; demo reels can carry richer formats */
  if (!COURSE && REELS[i] && REELS[i].check) return REELS[i].check;
  return null;
}

function showQuiz(i) {
  var t = reelText(i);
  var q = t.quiz;
  if (!q || !q.q) { // reel without a quiz — straight through to the tips
    state.answers[i] = REELS[i].answer;
    updateScore();
    afterGate(i);
    return;
  }
  quizOpen = true;
  qShownAt = Date.now();
  reels[i].video.pause();

  var check = reelCheck(i);
  if (check && check.format === "beat")  return showBeatCheck(i, check);
  if (check && check.format === "spot")  return showSpotCheck(i, check);

  quizEl.innerHTML =
    '<div class="quiz-inner">' +
      '<div class="quiz-kicker"><span class="quiz-rule"></span><span>' + ui("knowledgeCheck") + ' · ' + ui("standard") + ' ' + String(i+1).padStart(2,"0") + '</span></div>' +
      '<h2 class="quiz-q">' + q.q + '</h2>' +
      '<div class="quiz-options">' +
        q.options.map(function (opt, n) {
          return '<button class="quiz-opt" data-n="' + n + '"><span class="quiz-letter">' + "ABC"[n] + '</span><span>' + opt + '</span></button>';
        }).join("") +
      '</div>' +
      '<p class="quiz-why"></p>' +
      '<button class="btn-gold quiz-continue" style="visibility:hidden">' + ui("continueBtn") + '</button>' +
    '</div>';
  quizEl.classList.add("show");
  quizEl.setAttribute("aria-hidden", "false");

  var answered = false;
  quizEl.querySelectorAll(".quiz-opt").forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (answered) return;
      answered = true;
      var chosen = parseInt(btn.getAttribute("data-n"), 10);
      var correct = chosen === REELS[i].answer;

      quizEl.querySelectorAll(".quiz-opt").forEach(function (b, n) {
        b.disabled = true;
        if (n === REELS[i].answer) b.classList.add("correct");
        else if (n === chosen) b.classList.add("wrong");
        else b.classList.add("dim");
      });

      quizEl.querySelector(".quiz-why").textContent = q.why || "";
      quizEl.querySelector(".quiz-why").classList.add("show");
      var cont = quizEl.querySelector(".quiz-continue");
      cont.style.visibility = "visible";
      cont.textContent = correct ? ui("continueBtn") : ui("notedContinue");

      state.answers[i] = chosen;
      reportQ({
        id     : REELS[i].id + "-check",
        chosen : "ABC"[chosen],
        correct: "ABC"[REELS[i].answer],
        result : correct ? "correct" : "wrong"
      }, { kind: "exercise", reel: REELS[i].id, text: q.q, topic: reelText(i).title,
           chosenText: q.options[chosen], correctText: q.options[REELS[i].answer] });
      updateScore();
      MOScorm.report(state);

      cont.addEventListener("click", function () {
        closeQuiz();
        afterGate(i);
      });
    });
  });
}

function closeQuiz() {
  quizOpen = false;
  quizEl.classList.remove("show");
  quizEl.setAttribute("aria-hidden", "true");
}

/* ---------- check plumbing shared by all formats ---------- */
function quizKicker(i) {
  return '<div class="quiz-kicker"><span class="quiz-rule"></span><span>' +
    ui("knowledgeCheck") + ' · ' + ui("standard") + ' ' + String(i+1).padStart(2,"0") + '</span></div>';
}

function finishCheck(i, correct, chosenLabel, why, prompt) {
  state.answers[i] = correct ? REELS[i].answer : -1;   /* score math compares to REELS[i].answer */
  reportQ({
    id     : REELS[i].id + "-check",
    chosen : chosenLabel,
    correct: "target",
    result : correct ? "correct" : "wrong"
  }, { kind: "exercise", reel: REELS[i].id, text: prompt || chosenLabel, topic: reelText(i).title });
  updateScore();
  MOScorm.report(state);

  var whyEl = quizEl.querySelector(".quiz-why");
  whyEl.textContent = why || "";
  whyEl.classList.add("show");
  var cont = quizEl.querySelector(".quiz-continue");
  cont.style.visibility = "visible";
  cont.textContent = correct ? ui("continueBtn") : ui("notedContinue");
  cont.addEventListener("click", function () {
    closeQuiz();
    afterGate(i);
  });
}

/* ---------- Tap the Beat (timing check) ---------- */
function showBeatCheck(i, check) {
  var w0 = check.window[0], w1 = check.window[1];
  quizEl.innerHTML =
    '<div class="quiz-inner quiz-inner-wide">' +
      quizKicker(i) +
      '<h2 class="quiz-q">' + check.prompt + '</h2>' +
      '<div class="beat-stage">' +
        '<video class="beat-video" src="' + REELS[i].src + '" playsinline webkit-playsinline preload="auto" muted></video>' +
        '<div class="beat-tap"></div>' +
        '<div class="beat-ring"></div>' +
      '</div>' +
      '<div class="beat-bar"><span class="beat-window"></span><span class="beat-needle"></span></div>' +
      '<p class="beat-note">' + ui("beatNote") + '</p>' +
      '<p class="quiz-why"></p>' +
      '<button class="btn-gold quiz-continue" style="visibility:hidden">' + ui("continueBtn") + '</button>' +
    '</div>';
  quizEl.classList.add("show");
  quizEl.setAttribute("aria-hidden", "false");

  var video   = quizEl.querySelector(".beat-video");
  var tapPad  = quizEl.querySelector(".beat-tap");
  var ring    = quizEl.querySelector(".beat-ring");
  var bar     = quizEl.querySelector(".beat-bar");
  var win     = quizEl.querySelector(".beat-window");
  var needle  = quizEl.querySelector(".beat-needle");
  var note    = quizEl.querySelector(".beat-note");
  var attempts = 2;
  var done = false;
  var raf = null;

  function dur() { return video.duration || 12; }
  function layoutWindow() {
    var d = dur();
    win.style.left  = (w0 / d * 100) + "%";
    win.style.width = ((w1 - w0) / d * 100) + "%";
  }
  video.addEventListener("loadedmetadata", layoutWindow);
  if (video.readyState >= 1) layoutWindow();

  function moveNeedle() {
    if (done) return;
    var d = dur();
    needle.style.left = Math.min(100, (video.currentTime / d * 100)) + "%";
    raf = requestAnimationFrame(moveNeedle);
  }

  function endGame(correct, tappedAt) {
    done = true;
    cancelAnimationFrame(raf);
    video.pause();
    note.textContent = "";
    needle.style.left = (tappedAt / dur() * 100) + "%";
    finishCheck(i, correct, tappedAt.toFixed(1) + "s", check.why, check.prompt);
  }

  video.currentTime = 0;
  setTimeout(function () {
    video.play().catch(function () {});
    moveNeedle();
  }, 500);

  video.addEventListener("ended", function () {
    if (!done) { note.textContent = ""; endGame(false, dur()); }
  });

  tapPad.addEventListener("pointerdown", function (ev) {
    if (done) return;
    var t = video.currentTime;
    var rect = quizEl.querySelector(".beat-stage").getBoundingClientRect();
    ring.style.left = (ev.clientX - rect.left) + "px";
    ring.style.top  = (ev.clientY - rect.top) + "px";
    var correct = t >= w0 && t <= w1;
    if (correct) {
      ring.className = "beat-ring ok show";
      endGame(true, t);
    } else {
      attempts--;
      ring.className = "beat-ring bad show";
      setTimeout(function () { ring.classList.remove("show"); }, 500);
      if (attempts > 0) {
        note.textContent = (t < w0 ? ui("tooEarly") : ui("tooLate")) + " · " + ui("oneMoreTry");
      } else {
        endGame(false, t);
      }
    }
  });
}

/* ---------- Spot the Detail (hotspot on a freeze frame) ---------- */
function showSpotCheck(i, check) {
  var zone = check.zones[0];   /* one target zone for now */
  quizEl.innerHTML =
    '<div class="quiz-inner quiz-inner-wide">' +
      quizKicker(i) +
      '<h2 class="quiz-q">' + check.prompt + '</h2>' +
      '<div class="spot-frame">' +
        '<video class="spot-video" src="' + REELS[i].src + '" playsinline webkit-playsinline preload="auto" muted></video>' +
        '<div class="spot-zone"></div>' +
        '<div class="spot-ring"></div>' +
      '</div>' +
      '<p class="beat-note">' + ui("spotNote") + '</p>' +
      '<p class="quiz-why"></p>' +
      '<button class="btn-gold quiz-continue" style="visibility:hidden">' + ui("continueBtn") + '</button>' +
    '</div>';
  quizEl.classList.add("show");
  quizEl.setAttribute("aria-hidden", "false");

  var video  = quizEl.querySelector(".spot-video");
  var frame  = quizEl.querySelector(".spot-frame");
  var ring   = quizEl.querySelector(".spot-ring");
  var zoneEl = quizEl.querySelector(".spot-zone");
  var note   = quizEl.querySelector(".beat-note");
  var attempts = 2;
  var done = false;

  function freeze() { video.currentTime = check.at; }
  video.addEventListener("loadedmetadata", freeze);
  video.addEventListener("seeked", function () { video.pause(); });
  if (video.readyState >= 1) freeze();

  function layoutZone() {
    var r = frame.getBoundingClientRect();
    zoneEl.style.left   = (zone.x * r.width) + "px";
    zoneEl.style.top    = (zone.y * r.height) + "px";
    zoneEl.style.width  = zoneEl.style.height = (zone.r * 2 * r.width) + "px";
  }

  frame.addEventListener("pointerdown", function (ev) {
    if (done) return;
    var r = frame.getBoundingClientRect();
    var px = ev.clientX - r.left, py = ev.clientY - r.top;
    ring.style.left = px + "px";
    ring.style.top  = py + "px";
    var dx = (px / r.width  - zone.x);
    var dy = (py / r.height - zone.y);
    var distFrac = Math.sqrt(dx * dx + dy * dy * (r.height / r.width) * (r.height / r.width));
    var correct = distFrac <= zone.r;
    if (correct) {
      done = true;
      note.textContent = "";
      ring.className = "spot-ring ok show";
      layoutZone();
      zoneEl.classList.add("show");
      finishCheck(i, true, "zone", check.why, check.prompt);
    } else {
      attempts--;
      ring.className = "spot-ring bad show";
      setTimeout(function () { ring.classList.remove("show"); }, 500);
      if (attempts > 0) note.textContent = ui("spotMiss") + " · " + ui("oneMoreTry");
      else { done = true; layoutZone(); zoneEl.classList.add("show"); finishCheck(i, false, "miss", check.why, check.prompt); }
    }
  });
}

/* ============================================================
   Assessment — the true measure, after the exercise portion
   Modes: "all" = retake the whole assessment ·
          "wrongOnly" = retake only the questions you missed
   Attempts and per-question results report to the LMS.
   ============================================================ */
function finishExercise() {
  if ((ENTRY === "reels" || ENTRY === "assessment") && ASSESS && !assessState.passed) showAssessIntro();
  else showComplete();
}

function assessQuestionsThisTry() {
  if (assessState.tries > 0 && ASSESS.retryMode === "wrongOnly") {
    return ASSESS.questions
      .map(function (q, n) { return { q: q, n: n }; })
      .filter(function (it) { return !assessState.correct[it.n]; });
  }
  return ASSESS.questions.map(function (q, n) { return { q: q, n: n }; });
}

function showAssessIntro() {
  assessOpen = true;
  reels.forEach(function (r) { if (r.video) r.video.pause(); });
  var baseline = isBaseline();
  var qCount = ASSESS.questions.length;
  var triesLeft = ASSESS.maxTries === 0 ? ui("unlimited") : (ASSESS.maxTries - assessState.tries);
  var meta = '<li><b>' + qCount + '</b> ' + ui("assessQuestions") + '</li>';
  if (!baseline) meta +=
    '<li><b>' + ASSESS.passMark + '%</b> ' + ui("passMark") + '</li>' +
    '<li><b>' + triesLeft + '</b> ' + ui("triesLeft") + '</li>';
  assessEl.innerHTML =
    '<div class="quiz-inner">' +
      '<div class="quiz-kicker"><span class="quiz-rule"></span><span>' + ui(baseline ? "preKicker" : "assessKicker") + '</span></div>' +
      '<h2 class="quiz-q">' + ui(baseline ? "preTitle" : "assessTitle") + '</h2>' +
      '<ul class="assess-meta">' + meta + '</ul>' +
      '<p class="assess-mode">' + (baseline ? ui("preDesc")
        : (ASSESS.retryMode === "wrongOnly" ? ui("modeWrongDesc") : ui("modeAllDesc"))) + '</p>' +
      '<button class="btn-gold quiz-continue" style="visibility:visible">' + ui("beginAssess") + '</button>' +
    '</div>';
  assessEl.classList.add("show");
  assessEl.setAttribute("aria-hidden", "false");
  assessEl.querySelector(".quiz-continue").addEventListener("click", function () {
    askAssessQuestion(assessQuestionsThisTry(), 0);
  });
}

function askAssessQuestion(list, idx) {
  var it = list[idx];
  var q = it.q;
  qShownAt = Date.now();   /* per-question timer starts as the options render */
  assessEl.innerHTML =
    '<div class="quiz-inner">' +
      '<div class="quiz-kicker"><span class="quiz-rule"></span><span>' +
        ui("assessKicker") + ' · ' + ui("question") + ' ' + (idx + 1) + ' / ' + list.length + '</span></div>' +
      (q.img ? '<div class="assess-img-wrap"><img class="assess-img" src="' + q.img + '" alt=""></div>' : "") +
      '<h2 class="quiz-q">' + q.q + '</h2>' +
      '<div class="quiz-options">' +
        q.options.map(function (opt, n) {
          return '<button class="quiz-opt assess-opt" data-n="' + n + '"><span class="quiz-letter">' + "ABC"[n] + '</span><span>' + opt + '</span></button>';
        }).join("") +
      '</div>' +
    '</div>';

  var answered = false;
  assessEl.querySelectorAll(".assess-opt").forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (answered) return;
      answered = true;
      var chosen = parseInt(btn.getAttribute("data-n"), 10);
      var correct = chosen === q.answer;
      /* no reveal during the assessment — mark selection, move on */
      btn.classList.add(correct ? "correct" : "wrong");
      if (!correct) {
        /* acknowledge the miss silently; the recap explains it at the end */
        btn.classList.add("dim");
      }
      if (assessState.tries === 0 || ASSESS.retryMode === "all") {
        assessState.correct[it.n] = correct;
      } else if (correct) {
        assessState.correct[it.n] = true;   /* wrongOnly: keep earlier passes, fix misses */
      }
      reportQ({
        id     : isBaseline()
          ? "pre-q" + (it.n + 1)
          : "assess-q" + (it.n + 1) + "-try" + (assessState.tries + 1),
        chosen : "ABC"[chosen],
        correct: "ABC"[q.answer],
        result : correct ? "correct" : "wrong"
      }, { text: q.q, topic: q.topic || null, try: assessState.tries + 1,
           chosenText: q.options[chosen], correctText: q.options[q.answer] });
      setTimeout(function () {
        if (idx + 1 < list.length) askAssessQuestion(list, idx + 1);
        else gradeAssessment();
      }, 450);
    });
  });
}

function gradeAssessment() {
  assessState.tries++;
  var total = ASSESS.questions.length;
  var correctCount = assessState.correct.filter(Boolean).length;
  var pct = Math.round((correctCount / total) * 100);

  /* pre-assessment: baseline capture only — no pass/fail, no score to the LMS,
     no retry. The course then continues into the exercise reels. */
  if (isBaseline()) {
    state.preScore = pct;
    reportQ({
      id     : "pre-assessment",
      chosen : String(pct),
      correct: "baseline",
      result : "neutral"
    }, { kind: "summary", score: pct });
    MOScorm.report(state);
    showPreResult(pct);
    return;
  }

  var passed = pct >= ASSESS.passMark;
  assessState.passed = passed;
  assessState.best = Math.max(assessState.best, pct);

  /* the assessment carries the LMS score + status when enabled */
  state.score = pct;
  state.assess = { tries: assessState.tries, passed: passed, best: assessState.best };
  state.lessonStatus = passed ? "passed"
    : (ASSESS.maxTries > 0 && assessState.tries >= ASSESS.maxTries ? "failed" : "incomplete");

  reportQ({
    id     : "assessment-try-" + assessState.tries,
    chosen : String(pct),
    correct: String(ASSESS.passMark),
    result : passed ? "correct" : "wrong"
  }, { kind: "summary", score: pct, try: assessState.tries, passed: passed });
  MOScorm.report(state);
  if (passed) MOXapi.passed(pct);
  else if (ASSESS.maxTries > 0 && assessState.tries >= ASSESS.maxTries) MOXapi.failed(pct);

  showAssessResult(pct, passed);
}

/* pre-assessment result: baseline captured, then into the exercise reels */
function showPreResult(pct) {
  var recap = ASSESS.questions.map(function (q, n) {
    var ok = !!assessState.correct[n];
    return '<li class="as-recap ' + (ok ? "ok" : "bad") + '">' +
      '<span class="as-mark">' + (ok ? "✓" : "✗") + '</span>' +
      '<span class="as-text">' + q.q + (ok ? "" : ' <em>' + q.why + '</em>') + '</span>' +
    '</li>';
  }).join("");

  assessEl.innerHTML =
    '<div class="quiz-inner">' +
      '<div class="quiz-kicker"><span class="quiz-rule"></span><span>' + ui("preKicker") + '</span></div>' +
      '<h2 class="quiz-q">' + ui("preDone") + '</h2>' +
      '<div class="assess-score"><span>' + pct + '</span><em>%</em></div>' +
      '<p class="assess-passmark">' + ui("preNote") + '</p>' +
      '<ul class="assess-recap">' + recap + '</ul>' +
      '<button class="btn-gold quiz-continue" style="visibility:visible" id="preContinue">' + ui("continueBtn") + '</button>' +
    '</div>';

  assessEl.querySelector("#preContinue").addEventListener("click", function () {
    if (ENTRY === "preOnly") {
      /* pre-assessment only: the baseline is the whole course — report it and finish */
      state.score = pct;
      state.completed = true;
      state.lessonStatus = "completed";
      MOScorm.report(state);
      closeAssess();
      showComplete();
      return;
    }
    closeAssess();
    index = 0;
    setActive();
    reels[0].video.play().catch(function(){});
    setTimeout(hideHint, 5000);
  });
}

function showAssessResult(pct, passed) {
  var unlim = ASSESS.maxTries === 0;
  var triesLeft = unlim ? 1 : ASSESS.maxTries - assessState.tries;
  var recap = ASSESS.questions.map(function (q, n) {
    var ok = !!assessState.correct[n];
    return '<li class="as-recap ' + (ok ? "ok" : "bad") + '">' +
      '<span class="as-mark">' + (ok ? "✓" : "✗") + '</span>' +
      '<span class="as-text">' + q.q + (ok ? "" : ' <em>' + q.why + '</em>') + '</span>' +
    '</li>';
  }).join("");

  var actions = "";
  if (passed) {
    actions = '<button class="btn-gold quiz-continue" style="visibility:visible" id="asFinish">' + ui("continueBtn") + '</button>';
  } else if (unlim || triesLeft > 0) {
    actions = '<button class="btn-gold quiz-continue" style="visibility:visible" id="asRetry">' +
      (ASSESS.retryMode === "wrongOnly" ? ui("retryWrong") : ui("retryAll")) + '</button>' +
      '<p class="assess-tries">' + (unlim ? ui("unlimited") : triesLeft) + ' ' + ui("triesLeft") + '</p>';
  } else {
    actions = '<p class="assess-tries">' + ui("noTries") + '</p>';
  }

  assessEl.innerHTML =
    '<div class="quiz-inner">' +
      '<div class="quiz-kicker"><span class="quiz-rule"></span><span>' + ui("assessKicker") + '</span></div>' +
      '<h2 class="quiz-q">' + (passed ? ui("assessPassed") : ui("assessFailed")) + '</h2>' +
      '<div class="assess-score"><span>' + pct + '</span><em>%</em></div>' +
      '<p class="assess-passmark">' + ui("passMark") + ' ' + ASSESS.passMark + '% · ' +
        ui("tryWord") + ' ' + assessState.tries + ' / ' + (unlim ? "∞" : ASSESS.maxTries) + '</p>' +
      '<ul class="assess-recap">' + recap + '</ul>' +
      actions +
    '</div>';

  var finish = assessEl.querySelector("#asFinish");
  if (finish) finish.addEventListener("click", function () {
    closeAssess();
    showComplete();
  });
  var retry = assessEl.querySelector("#asRetry");
  if (retry) retry.addEventListener("click", function () {
    askAssessQuestion(assessQuestionsThisTry(), 0);
  });
}

function closeAssess() {
  assessOpen = false;
  assessEl.classList.remove("show");
  assessEl.setAttribute("aria-hidden", "true");
}

/* ---------- tips carousel (IG-style photo cards) ---------- */
function reelTips(i) {
  if (COURSE) {
    /* packaged/authored course — only its own tip cards, never the demo's */
    return (COURSE.reels && COURSE.reels[i] && COURSE.reels[i].tips) || [];
  }
  var demo = MOI18N.EN.reels[i];
  return (demo && demo.tips) || [];
}

// After the knowledge check (or straight after the reel if there is none):
// offer the tip cards once per reel, then move on.
function afterGate(i) {
  if (!state.tipsSeen) state.tipsSeen = [];
  if (!state.tipsSeen[i]) {
    var tips = reelTips(i);
    if (tips.length) { showTips(i, tips); return; }
  }
  if (state.completed) finishExercise();
  else goTo(i + 1, false);
}

function showTips(i, tips) {
  tipsOpen = true;
  state.tipsSeen[i] = true;
  MOScorm.report(state);

  var cards = tips.map(function (tip, n) {
    return '<figure class="tip-card">' +
      '<img src="' + tip.img + '" alt="" draggable="false">' +
      '<figcaption class="tip-body">' +
        '<span class="tip-num">' + String(n + 1).padStart(2, "0") + '</span>' +
        '<h3 class="tip-title">' + tip.title + '</h3>' +
        '<p class="tip-text">' + tip.text + '</p>' +
      '</figcaption>' +
    '</figure>';
  }).join("");

  tipsEl.innerHTML =
    '<div class="tips-inner">' +
      '<div class="quiz-kicker"><span class="quiz-rule"></span><span>' + ui("houseTips") + ' · ' + ui("standard") + ' ' + String(i+1).padStart(2,"0") + '</span></div>' +
      '<div class="tips-viewport"><div class="tips-track">' + cards + '</div></div>' +
      '<div class="tips-foot">' +
        '<button class="tips-arrow" data-dir="-1" aria-label="Previous tip">‹</button>' +
        '<div class="tips-dots">' + tips.map(function (_, n) { return '<span class="tips-dot' + (n === 0 ? " on" : "") + '"></span>'; }).join("") + '</div>' +
        '<button class="tips-arrow" data-dir="1" aria-label="Next tip">›</button>' +
      '</div>' +
      '<button class="btn-gold tips-continue">' + ui("continueBtn") + '</button>' +
    '</div>';
  tipsEl.classList.add("show");
  tipsEl.setAttribute("aria-hidden", "false");

  var viewport = tipsEl.querySelector(".tips-viewport");
  var dots = tipsEl.querySelectorAll(".tips-dot");

  function syncDots() {
    var n = Math.round(viewport.scrollLeft / viewport.clientWidth);
    dots.forEach(function (d, k) { d.classList.toggle("on", k === n); });
  }
  viewport.addEventListener("scroll", syncDots, { passive: true });

  tipsEl.querySelectorAll(".tips-arrow").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var dir = parseInt(btn.getAttribute("data-dir"), 10);
      viewport.scrollBy({ left: dir * viewport.clientWidth, behavior: "smooth" });
    });
  });

  tipsEl.querySelector(".tips-continue").addEventListener("click", function () {
    closeTips();
    if (state.completed) finishExercise();
    else goTo(i + 1, false);
  });
}

function closeTips() {
  tipsOpen = false;
  tipsEl.classList.remove("show");
  tipsEl.setAttribute("aria-hidden", "true");
}

/* ---------- navigation ---------- */
function goTo(next, viaUser) {
  if (animating || next === index || quizOpen || tipsOpen || assessOpen || menuOpen) return;
  if (next < 0) next = 0;
  if (next >= reels.length) {
    var last = reels.length - 1;
    if (state.completed) finishExercise();
    else if (reels[last].watched && state.answers[last] == null) showQuiz(last);
    else toast(ui("finishGate"));
    return;
  }
  if (viaUser && next > index && !state.completed) {
    if (CONFIG.requireWatch && !reels[index].watched) {
      toast(ui("watchGate"));
      return;
    }
    if (state.answers[index] == null) {
      showQuiz(index);
      return;
    }
  }

  animating = true;
  hideHint();

  beatEl.classList.add("on");
  setTimeout(function () {
    reels[index].video.pause();
    index = next;
    track.style.transform = "translateY(-" + (index * 100) + "%)";
    counterEl.innerHTML = String(index + 1).padStart(2, "0") + "&nbsp;/&nbsp;" + String(reels.length).padStart(2, "0");
    setActive();
    setTimeout(function () {
      beatEl.classList.remove("on");
      animating = false;
    }, 120);
  }, CONFIG.beatMs);
}

function setActive() {
  reels.forEach(function (r, i) {
    r.el.classList.toggle("active", i === index);
    if (i !== index) { r.video.pause(); }
  });
  var v = reels[index].video;
  if (CONFIG.autoPlay && started && !menuOpen) {
    v.play().catch(function(){});
  }
  stage.classList.remove("paused");
}

/* ---------- gestures ---------- */
function wireGestures() {
  var startY = null, startT = 0;

  stage.addEventListener("touchstart", function (e) {
    startY = e.touches[0].clientY;
    startT = Date.now();
  }, { passive: true });

  stage.addEventListener("touchend", function (e) {
    if (menuOpen || quizOpen || tipsOpen || assessOpen) return;
    if (startY === null) return;
    var dy = startY - e.changedTouches[0].clientY;
    var dt = Date.now() - startT;
    startY = null;
    if (Math.abs(dy) > 55) {
      goTo(index + (dy > 0 ? 1 : -1), true);
    } else if (dt < 250) {
      togglePause();
    }
  }, { passive: true });

  var wheelLock = false;
  stage.addEventListener("wheel", function (e) {
    if (menuOpen || quizOpen || tipsOpen || assessOpen) return;
    if (wheelLock || Math.abs(e.deltaY) < 24) return;
    wheelLock = true;
    setTimeout(function(){ wheelLock = false; }, 700);
    goTo(index + (e.deltaY > 0 ? 1 : -1), true);
  }, { passive: true });

  document.addEventListener("keydown", function (e) {
    if (tipsOpen) {
      var vp = tipsEl.querySelector(".tips-viewport");
      if (vp && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        vp.scrollBy({ left: (e.key === "ArrowRight" ? 1 : -1) * vp.clientWidth, behavior: "smooth" });
      }
      return;
    }
    if (menuOpen || quizOpen || assessOpen) return;
    if (e.key === "ArrowDown" || e.key === "PageDown") goTo(index + 1, true);
    if (e.key === "ArrowUp"   || e.key === "PageUp")   goTo(index - 1, true);
    if (e.key === " ") { e.preventDefault(); togglePause(); }
  });

  stage.addEventListener("click", function (e) {
    if (menuOpen || quizOpen || tipsOpen || assessOpen) return;
    if (e.target.closest("button") || e.target.closest(".complete")) return;
    togglePause();
  });
}

function togglePause() {
  var v = reels[index].video;
  if (v.paused) { v.play().catch(function(){}); stage.classList.remove("paused"); }
  else { v.pause(); stage.classList.add("paused"); }
}

/* ---------- rail buttons ---------- */
function wireButtons() {
  $("btnNext").addEventListener("click", function(){ goTo(index + 1, true); });
  $("btnPrev").addEventListener("click", function(){ goTo(index - 1, true); });

  $("btnReplay").addEventListener("click", function () {
    var v = reels[index].video;
    v.currentTime = 0;
    v.play().catch(function(){});
    stage.classList.remove("paused");
  });

  $("btnSound").addEventListener("click", function () {
    var muted = !reels[index].video.muted;
    reels.forEach(function (r) { r.video.muted = muted; });
    document.querySelector(".ic-muted").style.display = muted ? "" : "none";
    document.querySelector(".ic-sound").style.display = muted ? "none" : "";
    $("soundLabel").textContent = muted ? ui("sound") : ui("muted");
  });

  $("btnRewatch").addEventListener("click", function () {
    completeEl.classList.remove("show");
    completeEl.setAttribute("aria-hidden", "true");
    goTo(0, false);
  });

  $("btnExit").addEventListener("click", function () {
    MOScorm.finish();
    window.close();
  });

  var duetBtn = $("btnDuet");
  if (duetBtn) duetBtn.addEventListener("click", function () {
    MOScorm.finish();
    location.href = "duet.html";
  });

  var resetBtn = $("btnReset");
  if (resetBtn) resetBtn.addEventListener("click", function () {
    MOScorm.reset();
    location.reload();
  });
}

/* ---------- toast / hint ---------- */
var toastTimer = null;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function(){ toastEl.classList.remove("show"); }, 1800);
}

function hideHint() {
  if (hintEl) hintEl.classList.add("hidden");
}

/* ---------- completion ---------- */
function showComplete() {
  $("scoreVal").textContent = state.score;
  $("completeSub").textContent = ui("series");
  var statusEl = $("lmsStatus");
  if (MOScorm.isLMS()) {
    statusEl.textContent = ui("completeLms") + state.score + "%";
    statusEl.classList.add("ok");
  } else {
    statusEl.textContent = ui("completePreview");
  }
  MOScorm.report(state);
  MOXapi.completed(state.score);
  MOXapi.flush();
  completeEl.classList.add("show");
  completeEl.setAttribute("aria-hidden", "false");
}

/* ---------- boot ---------- */
function boot() {
  applyCourse(loadCourse());
  build();
  MOXapi.init(COURSE && COURSE.title);   /* xAPI launch params → statements stream to the LRS */
  if (MOXapi.isActive()) {
    /* xAPI mode: isolate preview progress per course activity — Docebo serves
       every package from one CDN origin, so a shared key would leak a
       "completed" state from one course into all the others */
    var dbg = MOXapi.debug();
    MOScorm.setStoreKey("mo_sim_" + (dbg.activityId || "").replace(/[^a-z0-9]+/gi, "_").slice(-60));
  }
  MOScorm.init();

  var saved = MOScorm.loadProgress();
  if (saved) {
    if (Array.isArray(saved.watched)) {
      saved.watched.forEach(function (w, i) {
        if (w && reels[i]) {
          reels[i].watched = true;
          reels[i].el.classList.add("watched");
          reels[i].seg.classList.add("done");
          reels[i].segFill.style.width = "100%";
        }
      });
      state.watched = saved.watched;
    }
    if (Array.isArray(saved.answers)) state.answers = saved.answers;
    if (Array.isArray(saved.tipsSeen)) state.tipsSeen = saved.tipsSeen;
    if (saved.assess) {
      assessState.tries   = saved.assess.tries   || 0;
      assessState.passed  = !!saved.assess.passed;
      assessState.best    = saved.assess.best    || 0;
      state.assess = saved.assess;
      if (saved.lessonStatus) state.lessonStatus = saved.lessonStatus;
    }
    if (saved.lang) selectedLang = saved.lang;
    updateScore();
  }

  counterEl.innerHTML = "01&nbsp;/&nbsp;" + String(reels.length).padStart(2, "0");

  var langM = location.search.match(/[?&]lang=([\w-]+)/);
  if (langM) selectedLang = langM[1];

  // draft preview: skip the menu and start immediately
  if (isDraft) {
    applyLang(selectedLang).then(function () {
      closeMenu();
      started = true;
      if (ENTRY === "assessment" || isBaseline()) { showAssessIntro(); return; }
      setActive();
      var v = reels[0].video;
      if (v) v.play().catch(function(){});
    });
    return;
  }

  applyLang(selectedLang).then(function () {
    renderMenu();

    // QA hooks
    if (/[?&]qa=quiz/.test(location.search)) {
      started = true;
      closeMenu();
      markWatched(0);
      showQuiz(0);
    } else if (/[?&]qa=tips/.test(location.search)) {
      started = true;
      closeMenu();
      markWatched(0);
      state.answers[0] = REELS[0].answer;
      updateScore();
      afterGate(0);
    } else if (/[?&]qa=beat/.test(location.search)) {
      started = true;
      closeMenu();
      markWatched(0);
      showQuiz(0);
    } else if (/[?&]qa=spot/.test(location.search)) {
      started = true;
      closeMenu();
      markWatched(1);
      showQuiz(1);
    } else if (/[?&]qa=assess/.test(location.search)) {
      started = true;
      closeMenu();
      for (var k = 0; k < reels.length; k++) state.answers[k] = REELS[k].answer;
      for (var m = 0; m < reels.length; m++) markWatched(m);   /* last one fires finishExercise */
    } else if (/[?&]qa=reel/.test(location.search)) {
      started = true;
      closeMenu();
    }
  });

  setInterval(function(){ MOScorm.report(state); }, 30000);
  window.addEventListener("beforeunload", function(){ MOScorm.finish(); });
}

document.addEventListener("DOMContentLoaded", boot);
