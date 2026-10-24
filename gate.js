"use strict";
/* ---------------- SIGN-IN GATE ----------------
   This is the only part of the app that is public. It signs the person in (Supabase Auth, the same session the app uses), asks the
   database for the decryption key (app_bundle_key(): only a signed-in person whose Dealership Command access is on gets it), then
   downloads the encrypted app package, decrypts it in memory and starts it. Without a valid sign-in there is no key, so the
   package (all the app's code, screens and forms) is unreadable. tools/publish.js builds the package. */
(function(){
  var SB_URL = "https://tbptlrewwxhggxxfdiks.supabase.co";
  var SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRicHRscmV3d3hoZ2d4eGZkaWtzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2OTYzMTksImV4cCI6MjEwNTI3MjMxOX0.lYDOQbBWj4ZEHD2VkBfKtl1mTnSXlIGmkPb2dt6B4lU";
  /* a password-reset link: remember it before supabase-js clears the address (the app shows "Reset your password") */
  window.__DCC_RECOVERY = /(^|[#&?])type=recovery/.test(String(location.hash) + String(location.search));
  var sb = (window.supabase && window.supabase.createClient) ? window.supabase.createClient(SB_URL, SB_KEY) : null;
  var box = document.getElementById("gate");
  var esc = function(t){ return String(t === undefined || t === null ? "" : t).replace(/[&<>"]/g, function(c){ return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]; }); };

  /* The page is the app's own landing page (logo, headline, feature tiles) with the sign-in card in it. */
  var benefits = '<div class="axl-ben"><div>' + axi("shield") + '<span>Secure<br>Access</span></div><div>' + axi("people") + '<span>Dealer<br>Focused</span></div><div>' + axi("bars") + '<span>Greater<br>Tomorrow</span></div></div>';
  function frame(card){ box.innerHTML = axLanding(card); }
  function waitView(msg){ frame('<div class="axl-card axl-wait"><div class="axl-spin"></div><h2>Signing you in</h2><p class="axl-sub" id="gMsg"></p></div>'); document.getElementById("gMsg").textContent = msg || "Restoring your secure session…"; }
  function errorView(msg){
    frame('<div class="axl-card"><h2>Couldn\'t open the app</h2><div class="axl-err" id="gErr" role="alert"></div><button type="button" class="axl-btn" id="gRetry">Try again</button></div>');
    document.getElementById("gErr").textContent = msg; document.getElementById("gRetry").onclick = function(){ start(); };
  }
  function loginView(err, ok){
    var remember = true; try { remember = localStorage.getItem("axiom_remember") !== "0"; } catch (e) {}
    frame('<form class="axl-card" id="gForm" novalidate><h2>Welcome Back</h2><p class="axl-sub">Sign in to Dealership Command</p>' +
      (err ? '<div class="axl-err" role="alert" id="gErr"></div>' : '') + (ok ? '<div class="axl-ok" role="status" id="gOk"></div>' : '') +
      '<div class="axl-field">' + axi("user") + '<input type="text" id="gEmail" placeholder="Email or username" autocomplete="username" spellcheck="false" autocapitalize="none" aria-label="Email or username"></div>' +
      '<div class="axl-field">' + axi("lock") + '<input type="password" id="gPw" placeholder="Password" autocomplete="current-password" aria-label="Password"><button type="button" class="axl-eye" id="gEye" aria-label="Show or hide password">' + axi("eye") + '</button></div>' +
      '<div class="axl-row"><label class="axl-check"><input type="checkbox" id="gRem" ' + (remember ? "checked" : "") + '><span class="bx"></span>Remember me</label><button type="button" class="axl-link" id="gForgot">Forgot password?</button></div>' +
      '<button type="submit" class="axl-btn" id="gGo">Sign In</button>' + benefits + '</form>');
    if (err) document.getElementById("gErr").textContent = err; if (ok) document.getElementById("gOk").textContent = ok;
    var pw = document.getElementById("gPw");
    document.getElementById("gEye").onclick = function(){ pw.type = pw.type === "password" ? "text" : "password"; };
    document.getElementById("gForgot").onclick = function(){ forgotView(); };
    document.getElementById("gForm").onsubmit = function(ev){ ev.preventDefault(); doLogin(); };
    document.getElementById("gEmail").focus();
  }
  function forgotView(msg){
    frame('<form class="axl-card" id="gForm" novalidate><h2>Reset your password</h2><p class="axl-sub">Enter your work email and we\'ll send you a reset link.</p>' + (msg ? '<div class="axl-ok" role="status" id="gOk"></div>' : '') +
      '<div class="axl-field">' + axi("user") + '<input type="text" id="gReset" placeholder="Email" autocomplete="email" spellcheck="false" autocapitalize="none" aria-label="Email"></div>' +
      '<button type="submit" class="axl-btn" id="gGo">Send reset link</button><p class="axl-sub" style="margin:14px 0 0;font-size:12px">Salespeople: ask your manager to reset your password.</p>' +
      '<div class="axl-row" style="justify-content:center;margin:12px 0 0"><button type="button" class="axl-link" id="gBack">Back to sign in</button></div></form>');
    if (msg) document.getElementById("gOk").textContent = msg;
    document.getElementById("gBack").onclick = function(){ loginView(); };
    document.getElementById("gForm").onsubmit = function(ev){
      ev.preventDefault();
      var v = document.getElementById("gReset").value.trim(), btn = document.getElementById("gGo");
      if (!/^\S+@\S+\.\S+$/.test(v)) { forgotView("Enter a valid email address."); return; }
      btn.disabled = true; btn.textContent = "Sending…";
      fetch(SB_URL + "/functions/v1/request-password-reset", { method:"POST", headers:{ "Content-Type":"application/json", apikey:SB_KEY }, body:JSON.stringify({ email:v, app:"command" }) })
        .then(function(){ forgotView("If that email is registered, we've sent a reset link. Check your inbox (and spam folder). It expires in 24 hours."); },
          function(){ forgotView("We couldn't send that right now. Try again in a moment, or ask your administrator to reset it."); });
    };
    document.getElementById("gReset").focus();
  }

  function doLogin(){
    var email = document.getElementById("gEmail").value.trim().toLowerCase(), pw = document.getElementById("gPw").value;
    if (!email || !pw) return loginView("Enter your email and password.");
    if (!sb) return loginView("The sign-in service couldn't load. Check your connection and refresh.");
    var rem = document.getElementById("gRem");
    try { localStorage.setItem("axiom_remember", rem && !rem.checked ? "0" : "1"); sessionStorage.setItem("axiom_active", "1"); } catch (e) {}
    var btn = document.getElementById("gGo"); btn.disabled = true; btn.textContent = "Signing in…";
    sb.auth.signInWithPassword({ email:email, password:pw }).then(function(r){
      if (r.error) return loginView(/invalid login|banned|not found/i.test(r.error.message) ? "That email and password don't match an active account." : r.error.message);
      return openApp();
    }, function(){ loginView("We couldn't reach the sign-in service. Check your connection and try again."); });
  }

  /* ---- the encrypted app package ---- */
  function unb64(s){ var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  function decrypt(buf, keyB64){
    var u = new Uint8Array(buf);
    return crypto.subtle.importKey("raw", unb64(keyB64), "AES-GCM", false, ["decrypt"]).then(function(key){
      return crypto.subtle.decrypt({ name:"AES-GCM", iv:u.slice(0, 12) }, key, u.slice(12));
    }).then(function(plain){
      if (typeof DecompressionStream === "undefined") throw new Error("This browser is too old to open the app. Please update it.");
      return new Response(new Blob([plain]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
    }).then(function(text){ return JSON.parse(text); });
  }
  function run(bundle){
    ["gate-css", "gate-css2"].forEach(function(id){ var l = document.getElementById(id); if (l) l.remove(); });
    box.remove();
    window.__DCC_ASSETS = bundle.assets || {};
    (bundle.css || []).forEach(function(c){ var s = document.createElement("style"); s.setAttribute("data-src", c.name); s.textContent = c.text; document.head.appendChild(s); });
    (bundle.js || []).forEach(function(f){ var s = document.createElement("script"); s.textContent = f.text + "\n//# sourceURL=" + f.name; document.head.appendChild(s); });
  }
  function openWithKey(keyB64){
    return fetch("latest.json", { cache:"no-store" }).then(function(r){ if (!r.ok) throw new Error("the app package isn't published"); return r.json(); }).then(function(meta){
      return fetch(meta.file).then(function(r){ if (!r.ok) throw new Error("the app package couldn't be downloaded"); return r.arrayBuffer(); });
    }).then(function(buf){ return decrypt(buf, keyB64); }).then(run);
  }
  function openApp(){
    waitView("Opening Dealership Command…");
    return sb.rpc("app_bundle_key").then(function(r){
      if (r.error){
        if (r.status === 401 || r.status === 403 || /jwt|expired|not authori/i.test(String(r.error.message || ""))) return sb.auth.signOut().then(function(){ loginView("Please sign in again."); }, function(){ loginView("Please sign in again."); });
        return errorView("We couldn't reach the server (" + r.error.message + "). Check your connection and try again.");
      }
      if (!r.data) return sb.auth.signOut().then(function(){ loginView("This account doesn't have Dealership Command access. If you use Mahan-EX Pulse, sign in there. Otherwise ask your administrator."); }, function(){});
      return openWithKey(r.data).catch(function(e){ errorView("The app couldn't start (" + (e && e.message ? e.message : e) + "). Refresh the page; if it keeps happening, tell your administrator."); });
    }, function(e){ errorView("We couldn't reach the server. Check your connection and try again."); });
  }
  /* A reset / invite link from our emails: ?token_hash=...&type=recovery. The token is only used when the person presses the button,
     because email security scanners open links automatically and would otherwise use up the one-time token first. */
  var LINK = (function(){ try { var q = new URLSearchParams(location.search); var h = q.get("token_hash"), t = q.get("type"); return h && /^(recovery|invite|magiclink)$/.test(t || "") ? { hash:h, type:t } : null; } catch (e) { return null; } })();
  var LINK_ERR = /error_code=(otp_expired|access_denied)|error=access_denied/.test(String(location.hash) + String(location.search));
  function clearUrl(){ try { history.replaceState(null, "", location.pathname); } catch (e) {} }
  function linkView(err){
    frame('<div class="axl-card axl-wait"><h2>Set your password</h2><p class="axl-sub">Press the button to set a password for your account.</p>' + (err ? '<div class="axl-err" role="alert" id="gErr"></div>' : '') +
      '<button type="button" class="axl-btn" id="gLink">Continue</button></div>');
    if (err) document.getElementById("gErr").textContent = err;
    document.getElementById("gLink").onclick = function(){
      var btn = this; btn.disabled = true; btn.textContent = "Checking…";
      sb.auth.verifyOtp({ token_hash:LINK.hash, type:LINK.type }).then(function(r){
        if (r.error) { clearUrl(); return loginView("That link has expired or was already used. Use “Forgot password?” to get a new one."); }
        window.__DCC_RECOVERY = true; clearUrl();
        try { sessionStorage.setItem("axiom_active", "1"); } catch (e) {}
        return openApp();
      }, function(){ linkView("We couldn't reach the server. Check your connection and try again."); });
    };
  }
  function start(){
    if (!sb) return errorView("The sign-in service couldn't load. Check your connection and refresh.");
    if (LINK) return linkView();
    if (LINK_ERR) { clearUrl(); return loginView("That link has expired or was already used. Use “Forgot password?” to get a new one."); }
    waitView("Restoring your secure session…");
    return startSession();
  }
  function startSession(){
    if (!sb) return errorView("The sign-in service couldn't load. Check your connection and refresh.");
    waitView("Restoring your secure session…");
    /* "Remember me" unticked = the session lasts only until the browser is closed (same rule the app uses) */
    var forget = false;
    try { forget = !window.__DCC_RECOVERY && localStorage.getItem("axiom_remember") === "0" && !sessionStorage.getItem("axiom_active"); } catch (e) {}
    sb.auth.getSession().then(function(r){
      var session = r.data && r.data.session;
      if (session && forget) return sb.auth.signOut().then(function(){ loginView(); });
      if (session){ try { sessionStorage.setItem("axiom_active", "1"); } catch (e) {} return openApp(); }
      loginView();
    }, function(){ loginView(); });
  }
  window.DCCGate = { openWithKey:openWithKey };
  start();
})();
