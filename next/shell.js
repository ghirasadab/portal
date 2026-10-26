/* بورتال غراس: ربط الشريط الجانبي بصفحة المدير، دون تعديل app.js. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var AV = $("adminView"), tabs = document.querySelector(".admin-tabs");
  if (!AV || !tabs) return;

  // اسم الرابط المباشر ← اسم التبويب في البوابة
  var ROUTES = { today: "today", stats: "stats", salaries: "pay", money: "money", evals: "evals", archive: "arch", invoices: "invoices", holidays: "holidays" };
  var NAME = {}; Object.keys(ROUTES).forEach(function (k) { NAME[ROUTES[k]] = k; });

  [["العمل اليومي", "today"], ["التقارير", "stats"], ["الطلاب", "evals"], ["المالية والإدارة", "invoices"]].forEach(function (g) {
    var b = tabs.querySelector('[data-atab="' + g[1] + '"]');
    if (b) b.insertAdjacentHTML("beforebegin", '<div class="nav-grp">' + g[0] + "</div>");
  });
  document.body.insertAdjacentHTML("beforeend", '<div id="navScrim"></div>');

  function close() { document.body.classList.remove("nav-open"); }
  function route() {
    var t = ROUTES[(location.hash || "").slice(1)];
    var cur = tabs.querySelector(".tab.on");
    if (!t || (cur && cur.getAttribute("data-atab") === t)) return;
    var b = tabs.querySelector('[data-atab="' + t + '"]');
    if (b) b.click();
  }
  function sync() {
    var on = !AV.hidden;
    document.body.classList.toggle("is-admin", on);
    if (!on) close(); else route();
  }
  new MutationObserver(sync).observe(AV, { attributes: true, attributeFilter: ["hidden"] });
  sync();
  window.addEventListener("hashchange", function () { if (!AV.hidden) route(); });

  tabs.addEventListener("click", function (e) {
    var b = e.target.closest("[data-atab]"); if (!b) return;
    var n = NAME[b.getAttribute("data-atab")];
    if (n) { try { history.replaceState(null, "", "#" + n); } catch (x) {} }
    close();
  });
  $("navBtn").addEventListener("click", function () { document.body.classList.toggle("nav-open"); });
  $("navScrim").addEventListener("click", close);

  // البحث الشامل: ينقل إلى الأرشيف ويشغّل البحث الموجود فيه
  $("gSearch").addEventListener("keydown", function (e) {
    if (e.key !== "Enter") return;
    var q = this.value.trim(); if (!q) return;
    tabs.querySelector('[data-atab="arch"]').click();
    $("aQ").value = q; $("aGo").click();
  });
})();
