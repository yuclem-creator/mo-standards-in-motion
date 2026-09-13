/* ============================================================
   MOauth — shared Supabase auth gate for the Studio pages

   One baked-in project (the same Supabase project as the rest of
   the MO toolchain). Pages include this script, then call:
     MOAuth.require(function (user) { … boot the page … });
   Signed-in? callback fires immediately with the user.
   Not signed in? a full-screen gate asks for email + password.
   The cloud lanes read window.MOSB (the shared client) and
   window.MOUser (the signed-in user).
   ============================================================ */
(function (global) {
  "use strict";

  var SB_URL = "https://akcypiuealhfqspiwebp.supabase.co";
  var SB_KEY = "sb_publishable_h1lL2W5wJt3DOz2nr4IoAQ_20TPGTtF";

  var client = null;
  var user = null;

  function sb() {
    if (!client && global.supabase) {
      client = global.supabase.createClient(SB_URL, SB_KEY);
      global.MOSB = client;
    }
    return client;
  }

  /* ---------------- gate overlay ---------------- */
  function buildGate(onDone) {
    var el = document.createElement("div");
    el.id = "moAuthGate";
    el.innerHTML =
      '<div class="mo-auth-card">' +
        '<div class="mo-auth-mark">M O</div>' +
        '<h1 class="mo-auth-title">Standards in Motion</h1>' +
        '<p class="mo-auth-sub">Content Studio — sign in with your Studio account</p>' +
        '<label class="mo-auth-fld"><span>Email</span>' +
          '<input type="email" id="moAuthEmail" autocomplete="username"></label>' +
        '<label class="mo-auth-fld"><span>Password</span>' +
          '<input type="password" id="moAuthPass" autocomplete="current-password"></label>' +
        '<p class="mo-auth-err" id="moAuthErr" hidden></p>' +
        '<button class="mo-auth-btn" id="moAuthGo">Sign in</button>' +
        '<p class="mo-auth-note">Access is by invitation — ask your L&D administrator for an account.</p>' +
      '</div>';
    document.body.appendChild(el);

    var err = el.querySelector("#moAuthErr");
    function go() {
      err.hidden = true;
      var email = el.querySelector("#moAuthEmail").value.trim();
      var pass = el.querySelector("#moAuthPass").value;
      if (!email || !pass) { err.textContent = "Enter both email and password."; err.hidden = false; return; }
      var btn = el.querySelector("#moAuthGo");
      btn.disabled = true; btn.textContent = "Signing in…";
      sb().auth.signInWithPassword({ email: email, password: pass }).then(function (res) {
        btn.disabled = false; btn.textContent = "Sign in";
        if (res.error) { err.textContent = res.error.message; err.hidden = false; return; }
        user = res.data.user;
        global.MOUser = user;
        el.remove();
        onDone(user);
      });
    }
    el.querySelector("#moAuthGo").addEventListener("click", go);
    el.addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
    setTimeout(function () { el.querySelector("#moAuthEmail").focus(); }, 50);
  }

  /* ---------------- header chip ---------------- */
  function showWho() {
    var el = document.getElementById("moAuthWho");
    if (!el || !user) return;
    el.hidden = false;
    el.innerHTML = "";
    el.appendChild(document.createTextNode(user.email || "Signed in"));
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = "Sign out";
    b.addEventListener("click", signOut);
    el.appendChild(b);
  }

  /* ---------------- public API ---------------- */
  function require(onDone) {
    if (!sb()) { onDone(null); return; }   /* SDK missing — stay in local mode */
    sb().auth.getSession().then(function (res) {
      var sess = res.data && res.data.session;
      if (sess && sess.user) {
        user = sess.user;
        global.MOUser = user;
        showWho();
        onDone(user);
      } else {
        buildGate(function (u) { showWho(); onDone(u); });
      }
    });
  }

  function signOut() {
    if (!sb()) return;
    sb().auth.signOut().then(function () { location.reload(); });
  }

  global.MOAuth = {
    require: require,
    signOut: signOut,
    user: function () { return user; },
    client: sb,
    config: { url: SB_URL, key: SB_KEY }
  };
})(window);
