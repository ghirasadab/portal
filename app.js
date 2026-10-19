/* بوابة المعلمين — غراس الأدب */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var TOKEN_KEY = "ga-portal-token";
  var D = null;            // بيانات الشهر من الخادم
  var dateKey = "";        // اليوم المختار
  var unit = null;         // المجلس المختار
  var status = "";         // حالة المجلس المختارة
  var saving = false, armed = false, lastSaved = null, pendingOverwrite = false;
  var AD = null, OV = null, asTeacher = "";   // وضع المدير

  /* ---------------- الاتصال بالخادم ---------------- */
  function api(action, payload) {
    payload = payload || {};
    payload.action = action;
    payload.token = getToken();
    if (asTeacher && !payload.as) payload.as = asTeacher;
    if (window.PORTAL_DEMO) return window.PORTAL_DEMO(payload);
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 45000);
    return fetch(window.PORTAL_API, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) { return r.json(); })
      .then(function (res) {
        clearTimeout(timer);
        if (!res.ok) throw new Error(res.error || "حدث خطأ غير متوقع");
        return res;
      }, function (e) {
        clearTimeout(timer);
        if (e && e.name === "AbortError") throw new Error("لم يصل رد من الخادم. تحقق من الاتصال وأعد المحاولة.");
        if (e && /fetch|network|json/i.test(String(e.message || e))) throw new Error("تعذّر الاتصال بالخادم. تحقق من الإنترنت وأعد المحاولة.");
        throw e;
      });
  }

  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return window.__tok || ""; }
  }
  function takeTokenFromUrl() {
    var m = location.search.match(/[?&]t=([A-Za-z0-9_-]+)/);
    if (!m) return;
    try { localStorage.setItem(TOKEN_KEY, m[1]); } catch (e) { window.__tok = m[1]; }
    // إخفاء الرمز من شريط العنوان
    try { history.replaceState(null, "", location.pathname + location.search.replace(/([?&])t=[^&]*&?/, "$1").replace(/[?&]$/, "") + location.hash); } catch (e) {}
  }

  /* ---------------- أدوات ---------------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function norm(s) {
    return String(s || "").replace(/[ً-ْٰ]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
      .replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 0x0660; }).replace(/\s+/g, " ").trim().toLowerCase();
  }
  function digits(s) { return String(s || "").replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 0x0660; }).replace(/[٫,]/g, ".").trim(); }
  function showMsg(text, ok) { var m = $("msg"); m.textContent = text; m.className = "msg " + (ok ? "ok" : "err"); m.hidden = false; window.scrollTo({ top: 0, behavior: "smooth" }); }
  function clearMsg() { $("msg").hidden = true; }
  function stMeta(key) { return D.statuses.filter(function (s) { return s.key === key; })[0]; }
  function dateIdx(key) { for (var i = 0; i < D.dates.length; i++) if (D.dates[i].key === key) return i; return -1; }
  function fmtDate(key) { var p = key.split("-"); return Number(p[2]) + "/" + Number(p[1]) + "/" + p[0]; }
  function weekdayOf(key) { var i = dateIdx(key); return i === -1 ? "" : D.dates[i].weekday; }
  function sessionsWord(n) { return n === 1 ? "حصة واحدة" : n === 2 ? "حصتان" : (n >= 3 && n <= 10 ? n + " حصص" : n + " حصة"); }
  function variants(day) {
    var v = norm(day);
    return v === "الاثنين" ? ["الاثنين", "الاتنين", "الإثنين"].map(norm) : [v];
  }
  function isUnitToday(u, key) {
    var wd = weekdayOf(key);
    if (!wd || !u.days) return false;
    var days = norm(u.days);
    return variants(wd).some(function (v) { return days.indexOf(v) !== -1; });
  }
  function unitRecorded(u, key) {
    var i = dateIdx(key);
    return i !== -1 && u.members.some(function (m) { return m.cells[i] && m.cells[i][1]; });
  }
  // آخر مدة مسجلة للطالب في هذا الشهر قبل اليوم المختار
  function lastMinutes(m, key) {
    var i = dateIdx(key);
    for (var j = (i === -1 ? m.cells.length : i) - 1; j >= 0; j--) {
      var c = m.cells[j];
      if (c && c[0] !== "" && Number(c[0]) > 0) return Number(c[0]);
    }
    return "";
  }

  /* ---------------- التحميل ---------------- */
  function load(month, keepUnitKey) {
    $("loading").hidden = false;
    api("init", { month: month || "" }).then(function (d) {
      if (d.adminHome) { showAdminHome(d); return; }
      D = d;
      $("adminView").hidden = true;
      $("asBar").hidden = !d.admin;
      if (d.admin) fillAsSel();
      $("loading").hidden = true; $("gate").hidden = true; $("app").hidden = false;
      $("who").textContent = d.teacher;
      $("leaveNote").hidden = !d.onLeave;
      var ms = $("month");
      ms.innerHTML = d.months.map(function (m) { return "<option" + (m === d.month ? " selected" : "") + ">" + esc(m) + "</option>"; }).join("");
      ms.hidden = d.months.length < 2;
      $("date").innerHTML = d.dates.map(function (x) { return '<option value="' + x.key + '">' + esc(x.weekday + " " + fmtDate(x.key)) + "</option>"; }).join("");
      if (!dateKey || dateIdx(dateKey) === -1) dateKey = dateIdx(d.today) !== -1 ? d.today : (d.dates.length ? d.dates[d.dates.length - 1].key : "");
      $("date").value = dateKey;
      renderDayChips();
      renderUnits();
      if (keepUnitKey) {
        var u = D.units.filter(function (x) { return x.key === keepUnitKey; })[0];
        if (u) openUnit(u, true); else closeUnit();
      }
    }).catch(function (e) {
      $("loading").hidden = true;
      var m = String(e.message || e);
      if (m.indexOf("AUTH:") === 0) {
        try { localStorage.removeItem(TOKEN_KEY); } catch (x) {}
        $("app").hidden = true; $("gate").hidden = false; $("gateText").textContent = m.slice(5).trim();
      } else {
        if (asTeacher && AD) { backHome(); }
        showMsg("⚠ " + m, false);
      }
    });
  }

  function renderDayChips() {
    var y = yesterdayKey(D.today);
    document.querySelectorAll("[data-day]").forEach(function (b) {
      var k = b.getAttribute("data-day") === "today" ? D.today : y;
      b.classList.toggle("on", k === dateKey);
      b.disabled = dateIdx(k) === -1;
    });
  }
  function yesterdayKey(key) {
    var p = key.split("-"), d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] - 1));
    return d.getUTCFullYear() + "-" + ("0" + (d.getUTCMonth() + 1)).slice(-2) + "-" + ("0" + d.getUTCDate()).slice(-2);
  }

  function renderUnits() {
    if (!D) return;
    var q = norm($("q").value);
    var list = D.units.filter(function (u) {
      if (!q) return true;
      return norm(u.title + " " + u.cat + " " + u.members.map(function (m) { return m.code + " " + m.parent; }).join(" ")).indexOf(q) !== -1;
    });
    var today = list.filter(function (u) { return isUnitToday(u, dateKey); });
    var other = list.filter(function (u) { return !isUnitToday(u, dateKey); });
    function li(u) {
      var done = unitRecorded(u, dateKey);
      return '<li tabindex="0" data-key="' + esc(u.key) + '"' + (unit && unit.key === u.key ? ' class="sel"' : "") + '><div><div class="nm">' + esc(u.title) +
        '</div><div class="mt">' + esc(u.cat) + (u.days ? " — " + esc(u.days) : "") + '</div></div><span class="dot' + (done ? " done" : "") + '" title="' + (done ? "مسجَّل" : "غير مسجَّل") + '"></span></li>';
    }
    $("todayHead").textContent = "مجالس " + (dateKey === D.today ? "اليوم" : "يوم " + weekdayOf(dateKey));
    $("unitsToday").innerHTML = today.length ? today.map(li).join("") : '<li class="empty">لا توجد مجالس مجدولة في هذا اليوم.</li>';
    $("unitsOther").innerHTML = other.length ? other.map(li).join("") : '<li class="empty">—</li>';
    $("otherHead").hidden = !other.length && !q;
  }

  /* ---------------- فتح المجلس ---------------- */
  function openUnit(u, keepInputs) {
    unit = u; armed = false; lastSaved = null;
    clearMsg();
    $("app").classList.add("picked");
    $("empty").hidden = true; $("form").hidden = false;
    $("uCat").textContent = u.cat;
    $("uTitle").textContent = u.title;
    var parents = u.members.map(function (m) { return m.parent; }).filter(Boolean);
    parents = parents.filter(function (p, i) { return parents.indexOf(p) === i; });
    $("uMeta").textContent = [u.days ? "أيام الدرس: " + u.days : "", parents.length ? "ولي الأمر: " + parents.join("، ") : ""].filter(Boolean).join(" — ");
    $("dateLabel").textContent = weekdayOf(dateKey) + " " + fmtDate(dateKey);
    $("rPerfLbl").textContent = u.type === "group" ? "أداء الطلاب في المجلس" : "أداء الطالب في المجلس";
    $("rIndWrap").hidden = u.type !== "group";
    renderLast();

    // الحالة الحالية في الشيت لهذا اليوم
    var i = dateIdx(dateKey);
    var cur = u.members.map(function (m) { return m.cells[i] || ["", ""]; });
    var recorded = cur.some(function (c) { return c[1]; });
    if (recorded) {
      $("existing").hidden = false;
      $("existing").innerHTML = "مسجَّل في الشيت لهذا اليوم: " + u.members.map(function (m, k) {
        var c = cur[k];
        if (!c[1]) return esc(m.name) + ": لا شيء";
        var st = stMeta(c[1]);
        return esc(m.name) + ": " + esc(st ? st.label : "لون غير معروف") + (c[0] !== "" ? " (" + esc(c[0]) + " د)" : "");
      }).join("، ") + ". الحفظ سيستبدل هذا التسجيل.";
    } else {
      $("existing").hidden = true;
    }

    if (!keepInputs) {
      ["rStudied", "rPerf", "rNotes", "rHome", "rInd"].forEach(function (k) { $(k).value = ""; });
      // الحالة الافتراضية: المسجّلة إن وُجدت، وإلا "حضر"
      var known = cur.map(function (c) { return c[1]; }).filter(function (s) { return s && stMeta(s); });
      status = known.length ? known[0] : "done";
      var m0 = u.members[0];
      $("minutes").value = cur[0][0] !== "" ? cur[0][0] : lastMinutes(m0, dateKey);
    }
    renderStatuses();
    renderMembers(cur, keepInputs);
    updateBoxes();
    $("sendBox").hidden = true;
    resetSave();
    document.querySelectorAll("#unitsToday li, #unitsOther li").forEach(function (li) { li.classList.toggle("sel", li.getAttribute("data-key") === u.key); });
    if (window.innerWidth <= 860) window.scrollTo({ top: 0 });
  }

  function closeUnit() {
    unit = null;
    $("app").classList.remove("picked");
    $("form").hidden = true; $("empty").hidden = false;
    renderUnits();
  }

  function renderLast() {
    var r = D.lastReports && D.lastReports[unit.key];
    $("historyBody").innerHTML = "";
    if (!r) { $("lastBox").hidden = true; return; }
    $("lastBox").hidden = false; $("lastBox").open = false;
    $("lastDate").textContent = "(" + fmtDate(r.date) + ")";
    $("lastBody").innerHTML = reportHtml(r);
  }
  function reportHtml(r) {
    var rows = [["ما درسناه", r.studied], ["الأداء", r.performance], ["ملاحظات", r.notes], ["التكليف", r.homework], ["ملاحظات فردية", r.individual]];
    return rows.filter(function (x) { return String(x[1] || "").trim(); })
      .map(function (x) { return '<div class="ln"><b>' + x[0] + ":</b> " + esc(x[1]).replace(/\n/g, "<br>") + "</div>"; }).join("");
  }

  function renderStatuses() {
    $("statuses").innerHTML = D.statuses.map(function (s) {
      return '<button type="button" class="st-btn' + (s.key === status ? " on" : "") + '" data-st="' + s.key + '"><span class="sw" style="background:' +
        (s.color || "#ffffff") + '"></span>' + esc(s.label) + "</button>";
    }).join("");
  }

  // في المجموعة: لكل طالب حالة ومدة
  function renderMembers(cur, keep) {
    var group = unit.type === "group";
    $("membersBox").hidden = true;
    if (!group) { $("members").innerHTML = ""; return; }
    var prev = {};
    if (keep) document.querySelectorAll("#members .mrow").forEach(function (r) {
      prev[r.getAttribute("data-col")] = { st: r.querySelector("select").value, min: r.querySelector("input").value };
    });
    var opts = D.statuses.filter(function (s) { return ["done", "absent", "pStudent"].indexOf(s.key) !== -1; });
    $("members").innerHTML = unit.members.map(function (m, k) {
      var c = cur[k] || ["", ""];
      var p = prev[m.col];
      var st = p ? p.st : (c[1] === "absent" || c[1] === "pStudent" ? c[1] : "done");
      var mins = p ? p.min : (c[0] !== "" ? c[0] : lastMinutes(m, dateKey));
      return '<div class="mrow" data-col="' + m.col + '"><div><div class="mn">' + esc(m.name) + '</div><div class="mc">' + esc(m.code || "") + "</div></div>" +
        '<select class="st-sel" aria-label="حالة ' + esc(m.name) + '">' + opts.map(function (s) {
          return '<option value="' + s.key + '"' + (s.key === st ? " selected" : "") + ">" + esc(s.label) + "</option>";
        }).join("") + '</select><input type="text" inputmode="numeric" value="' + esc(mins) + '" aria-label="دقائق ' + esc(m.name) + '" placeholder="د"></div>';
    }).join("");
    syncMemberInputs();
  }
  function syncMemberInputs() {
    document.querySelectorAll("#members .mrow").forEach(function (r) {
      var st = stMeta(r.querySelector("select").value);
      r.querySelector("input").disabled = !(st && st.minutes);
    });
  }

  // إظهار المدة والطلاب والتقرير حسب الحالة
  function updateBoxes() {
    var st = stMeta(status);
    var group = unit.type === "group";
    var held = status === "done" || status === "makeup";
    $("minutesBox").hidden = group || !(st && st.minutes);
    $("membersBox").hidden = !(group && st && st.minutes);
    $("members").classList.toggle("all-absent", status === "absent");
    $("reportBox").hidden = !held;
  }

  function resetSave() {
    armed = false; pendingOverwrite = false;
    $("confirm").hidden = true;
    $("save").classList.remove("confirming");
    $("save").disabled = false;
    var held = status === "done" || status === "makeup";
    $("save").textContent = held ? "حفظ الحصة والتقرير" : "حفظ";
  }

  /* ---------------- الحفظ ---------------- */
  function collect() {
    var group = unit.type === "group";
    var st = stMeta(status);
    var held = status === "done" || status === "makeup";
    var members;
    if (group && st.minutes) {
      members = [].map.call(document.querySelectorAll("#members .mrow"), function (r) {
        var col = Number(r.getAttribute("data-col"));
        var m = unit.members.filter(function (x) { return x.col === col; })[0];
        var s = status === "absent" ? "absent" : r.querySelector("select").value;
        // من حضر في مجلس "تعويض" يأخذ لون التعويض
        if (s === "done" && status === "makeup") s = "makeup";
        return { col: col, name: m.name, code: m.code, status: s, minutes: digits(r.querySelector("input").value) };
      });
    } else {
      var mins = digits($("minutes").value);
      members = unit.members.map(function (m) {
        return { col: m.col, name: m.name, code: m.code, status: status, minutes: st.minutes ? mins : "" };
      });
    }
    for (var i = 0; i < members.length; i++) {
      var ms = stMeta(members[i].status);
      if (ms.minutes && !(Number(members[i].minutes) > 0)) throw new Error("اكتب مدة الحصة بالدقائق" + (group ? " لـ" + members[i].name : "") + ".");
    }
    var report = held ? {
      studied: $("rStudied").value, performance: $("rPerf").value, notes: $("rNotes").value,
      homework: $("rHome").value, individual: group ? $("rInd").value : ""
    } : null;
    return { members: members, report: report };
  }

  function save(overwrite) {
    if (saving || !unit) return;
    clearMsg();
    var data;
    try { data = collect(); } catch (e) { return showMsg("⚠ " + e.message, false); }
    var held = status === "done" || status === "makeup";
    var empty = held && !["studied", "performance", "notes", "homework"].some(function (k) { return String(data.report[k] || "").trim(); });
    if (empty && !armed && !overwrite) {
      armed = true;
      $("confirm").hidden = false;
      $("confirm").textContent = "لم تكتب تقريرًا لهذه الحصة. اضغط «حفظ» مرة أخرى لتسجيل الحصة دون تقرير.";
      $("save").classList.add("confirming"); $("save").textContent = "حفظ دون تقرير";
      return;
    }
    saving = true;
    $("save").disabled = true; $("save").textContent = "جارٍ الحفظ…";
    var u = unit, key = dateKey;
    api("save", {
      month: D.month, date: key, unitKey: u.key, unitTitle: (u.type === "group" ? u.cat + ": " : "") + u.title,
      members: data.members, report: data.report, overwrite: !!overwrite || !$("existing").hidden
    }).then(function (res) {
      saving = false;
      if (res.conflict) {
        resetSave();
        armed = true;
        $("confirm").hidden = false;
        $("confirm").textContent = "يوجد تسجيل سابق في هذا اليوم لـ: " + res.existing.join("، ") + ". اضغط «استبدال» لتأكيد الحفظ فوقه.";
        $("save").classList.add("confirming"); $("save").textContent = "استبدال";
        pendingOverwrite = true;
        return;
      }
      // تحديث الخانات محليًا
      var i = dateIdx(key);
      u.members.forEach(function (m) { if (res.cells[m.col] && i !== -1) m.cells[i] = res.cells[m.col]; });
      if (res.reportSaved) {
        D.lastReports = D.lastReports || {};
        D.lastReports[u.key] = { date: key, studied: data.report.studied, performance: data.report.performance, notes: data.report.notes, homework: data.report.homework, individual: data.report.individual };
      }
      lastSaved = { unit: u, date: key, report: data.report, members: data.members, status: status };
      renderUnits();
      $("save").textContent = "تم الحفظ ✓"; $("save").disabled = true;
      $("confirm").hidden = true;
      $("existing").hidden = true;
      $("sendBox").hidden = false;
      $("savedLine").textContent = res.reportSaved ? "✓ سُجّلت الحصة في شيتك، وحُفظ التقرير في الأرشيف." : "✓ سُجّلت الحصة في شيتك.";
      var hasReport = data.report && ["studied", "performance", "notes", "homework", "individual"].some(function (k) { return String(data.report[k] || "").trim(); });
      $("wa").hidden = !hasReport; $("copy").hidden = !hasReport;
      if (hasReport) $("wa").focus();
    }).catch(function (e) {
      saving = false; resetSave();
      showMsg("⚠ " + (e.message || e), false);
    });
  }

  /* ---------------- رسالة واتساب ---------------- */
  function waText() {
    var s = lastSaved; if (!s) return "";
    var u = s.unit, r = s.report || {};
    var lines = [];
    lines.push("*تقرير المجلس — " + weekdayOf(s.date) + " " + fmtDate(s.date) + "*");
    lines.push((u.type === "group" ? "*المجموعة:* " : "*الطالب:* ") + u.title);
    var absent = s.members.filter(function (m) { return m.status !== "done" && m.status !== "makeup"; });
    if (u.type === "group" && absent.length) {
      lines.push("*الغياب:* " + absent.map(function (m) { var st = stMeta(m.status); return m.name + " (" + st.label + ")"; }).join("، "));
    }
    function sec(icon, title, txt) { if (String(txt || "").trim()) { lines.push(""); lines.push(icon + " *" + title + ":*"); lines.push(String(txt).trim()); } }
    sec("📖", "ما درسناه", r.studied);
    sec("⭐", u.type === "group" ? "أداء الطلاب" : "أداء الطالب", r.performance);
    sec("⚠️", "ملاحظات وتنبيهات", r.notes);
    sec("📝", "التكليف", r.homework);
    sec("👤", "ملاحظات فردية", r.individual);
    lines.push("");
    lines.push(D.teacher + " — غراس الأدب");
    return lines.join("\n");
  }

  /* ---------------- الأحداث ---------------- */
  function onUnitClick(e) {
    var li = e.target.closest("li[data-key]"); if (!li) return;
    var u = D.units.filter(function (x) { return x.key === li.getAttribute("data-key"); })[0];
    if (u) openUnit(u);
  }
  $("unitsToday").addEventListener("click", onUnitClick);
  $("unitsOther").addEventListener("click", onUnitClick);
  ["unitsToday", "unitsOther"].forEach(function (id) {
    $(id).addEventListener("keydown", function (e) { if (e.key === "Enter") onUnitClick(e); });
  });
  $("q").addEventListener("input", renderUnits);
  $("date").addEventListener("change", function () { setDate($("date").value); });
  document.querySelectorAll("[data-day]").forEach(function (b) {
    b.addEventListener("click", function () { setDate(b.getAttribute("data-day") === "today" ? D.today : yesterdayKey(D.today)); });
  });
  function setDate(k) {
    if (dateIdx(k) === -1) return;
    dateKey = k; $("date").value = k;
    renderDayChips(); renderUnits();
    if (unit) openUnit(unit);
  }
  $("statuses").addEventListener("click", function (e) {
    var b = e.target.closest("[data-st]"); if (!b) return;
    status = b.getAttribute("data-st");
    if (unit.type !== "group" && stMeta(status).minutes && !$("minutes").value) $("minutes").value = lastMinutes(unit.members[0], dateKey);
    renderStatuses(); updateBoxes(); resetSave(); $("sendBox").hidden = true;
  });
  $("members").addEventListener("change", function () { syncMemberInputs(); resetSave(); });
  $("members").addEventListener("input", resetSave);
  document.querySelectorAll("[data-min]").forEach(function (b) {
    b.addEventListener("click", function () { $("minutes").value = b.getAttribute("data-min"); resetSave(); });
  });
  ["minutes", "rStudied", "rPerf", "rNotes", "rHome", "rInd"].forEach(function (k) {
    $(k).addEventListener("input", function () { if (!saving && $("save").disabled && lastSaved) { $("sendBox").hidden = true; } resetSave(); });
  });
  $("save").addEventListener("click", function () { save(pendingOverwrite); });
  $("back").addEventListener("click", closeUnit);
  $("month").addEventListener("change", function () { dateKey = ""; unit = null; closeUnit(); load($("month").value); });
  $("refresh").addEventListener("click", function () {
    if (AD && !asTeacher) { loadOverview(true); return; }
    load(D ? D.month : "", unit ? unit.key : "");
  });
  $("theme").addEventListener("click", function () {
    var dark = document.documentElement.classList.toggle("ga-dark");
    try { localStorage.setItem("ga-theme", dark ? "dark" : "light"); } catch (e) {}
  });
  $("wa").addEventListener("click", function () {
    window.open("https://wa.me/?text=" + encodeURIComponent(waText()), "_blank", "noopener");
  });
  $("copy").addEventListener("click", function () {
    var t = waText();
    var done = function () { $("copy").textContent = "✓ نُسخ النص"; setTimeout(function () { $("copy").textContent = "نسخ نص التقرير"; }, 2000); };
    if (navigator.clipboard) navigator.clipboard.writeText(t).then(done, function () { fallbackCopy(t); done(); });
    else { fallbackCopy(t); done(); }
  });
  function fallbackCopy(t) {
    var a = document.createElement("textarea"); a.value = t; document.body.appendChild(a); a.select();
    try { document.execCommand("copy"); } catch (e) {}
    a.remove();
  }
  $("historyBtn").addEventListener("click", function () {
    $("historyBody").innerHTML = '<div class="note">جارٍ التحميل…</div>';
    api("history", { unitKey: unit.key }).then(function (res) {
      $("historyBody").innerHTML = res.reports.length ? res.reports.map(function (r) {
        return '<div class="hist-item"><b>' + esc(fmtDate(r.date)) + "</b> — " + esc(r.status) + reportHtml(r) + "</div>";
      }).join("") : '<div class="note">لا توجد تقارير سابقة.</div>';
    }).catch(function (e) { $("historyBody").innerHTML = '<div class="note">⚠ ' + esc(e.message) + "</div>"; });
  });

  /* ---------------- صفحة المدير ---------------- */
  function money(n, usd) { n = Number(n) || 0; return n.toLocaleString("en-US", { maximumFractionDigits: usd ? 2 : 0 }) + (usd ? " $" : " ج"); }
  // مبلغ بالجنيه ومعه الدولار إن وُجد
  function both(egp, usd) { return money(egp) + (Number(usd) ? '<span class="usd">+ ' + money(usd, true) + "</span>" : ""); }
  function numf(n, d) { n = Number(n) || 0; return n.toLocaleString("en-US", { maximumFractionDigits: d || 0 }); }

  function showAdminHome(d) {
    AD = d; asTeacher = ""; D = null; unit = null;
    $("loading").hidden = true; $("gate").hidden = true; $("app").hidden = true; $("asBar").hidden = true;
    $("adminView").hidden = false;
    $("who").textContent = "المدير";
    $("month").hidden = true;
    $("aMonth").innerHTML = d.months.map(function (m) { return "<option>" + esc(m) + "</option>"; }).join("");
    if (OV) renderOverview(); else loadOverview(false);
  }

  function loadOverview(fresh) {
    $("aLoading").hidden = false; $("aBody").hidden = true;
    api("overview", { month: $("aMonth").value, fresh: !!fresh }).then(function (o) {
      OV = o; renderOverview();
    }).catch(function (e) { $("aLoading").hidden = true; showMsg("⚠ " + (e.message || e), false); });
  }

  function renderOverview() {
    var o = OV;
    $("aLoading").hidden = true; $("aBody").hidden = false;
    $("aUpdated").textContent = "آخر قراءة للأرقام: " + o.updated + (o.cached ? " (محفوظة مؤقتًا، اضغط «تحديث الأرقام» لقراءة جديدة)" : "");
    $("aMoneyMonth").textContent = o.month;
    $("aTeachMonth").textContent = o.month;
    function kpi(k, v, sub, cls) { return '<div class="kpi' + (cls ? " " + cls : "") + '"><div class="k">' + k + '</div><div class="v">' + v + "</div>" + (sub ? '<div class="s">' + sub + "</div>" : "") + "</div>"; }
    var r = o.money.report;
    $("aMoney").innerHTML = r ? [
      kpi("مجموع الوارد", both(r.income, r.incomeUsd), "الدفعات المسجلة عن الشهر"),
      kpi("رواتب المعلمين", money(r.salaries)),
      kpi("المتبقي للأسر", both(r.familiesCredit, r.familiesCreditUsd), "حصص مدفوعة لم تُعطَ بعد"),
      kpi("صافي المال", money(r.net), r.incomeUsd ? "بالجنيه فقط؛ الدولار: " + money((r.incomeUsd || 0) - (r.familiesCreditUsd || 0), true) : "", "hl")
    ].join("") : '<div class="note">لا يوجد صف لهذا الشهر في «التقرير المالي».</div>';
    var fm = o.money.families;
    if (fm && fm.egp) {
      var e = fm.egp, d = fm.usd || {};
      $("aFamilies").innerHTML = [
        kpi("فواتير الشهر", both(e.invoices, d.invoices), (e.families + (d.families || 0)) + " أسرة" + (d.families ? " (منها " + d.families + " بالدولار)" : "")),
        kpi("المدفوع", both(e.paid, d.paid)),
        kpi("المتبقي على الأسر", both(e.due, d.due), "لم تدفع: " + (e.unpaid + (d.unpaid || 0)) + " — دفعت جزءًا: " + (e.partial + (d.partial || 0)), (e.due + (d.due || 0)) > 0 ? "warn" : ""),
        kpi("أرصدة مقدّمة للأسر", both(e.credit, d.credit))
      ].join("");
    } else {
      $("aFamilies").innerHTML = o.money.financialMonth ? '<div class="note">تحصيل الأسر يظهر للشهر المالي الحالي (' + esc(o.money.financialMonth) + ") فقط.</div>" : "";
    }

    // متابعة اليوم
    var withToday = o.teachers.filter(function (t) { return t.ok && t.today; });
    $("aTodayCard").hidden = !o.isCurrent;
    $("aTodayHead").textContent = "متابعة اليوم — " + o.todayWeekday;
    if (o.isCurrent) {
      var rows = withToday.filter(function (t) { return t.today.scheduled || t.today.extra; })
        .sort(function (a, b) { return (a.today.scheduled - a.today.recorded) < (b.today.scheduled - b.today.recorded) ? 1 : -1; });
      $("aToday").innerHTML = rows.length ? rows.map(function (t) {
        var left = t.today.scheduled - t.today.recorded;
        return '<div class="today-row"><div><button type="button" class="tname-link" data-t="' + esc(t.name) + '">' + esc(t.name) + "</button>" +
          (t.onLeave ? '<span class="badge">إجازة</span>' : "") +
          (t.today.pending.length ? '<div class="pend">لم يُسجَّل: ' + esc(t.today.pending.join(" | ")) + "</div>" : "") +
          (t.today.extra ? '<div class="pend">وسجّل ' + t.today.extra + " مجلسًا خارج جدول اليوم</div>" : "") +
          '</div><div class="cnt ' + (left > 0 ? "no" : "ok") + '">' + t.today.recorded + " / " + t.today.scheduled + "</div></div>";
      }).join("") : '<div class="note">لا توجد مجالس مجدولة اليوم حسب «أيام الدرس» في الشيتات.</div>';
    }

    // جدول المعلمين
    var tot = { s: 0, h: 0, e: 0, b: 0, p: 0 };
    $("aTable").querySelector("tbody").innerHTML = o.teachers.map(function (t) {
      var badges = (t.onLeave ? '<span class="badge">إجازة</span>' : "") + (t.stopAfter ? '<span class="badge warn">يتوقف بعد ' + esc(t.stopAfter) + "</span>" : "");
      if (!t.ok) return '<tr><td><button type="button" class="tname" data-t="' + esc(t.name) + '">' + esc(t.name) + "</button>" + badges + '</td><td colspan="6" class="note">⚠ ' + esc(t.error || "") + "</td></tr>";
      tot.s += t.sessions; tot.h += t.hours; tot.e += t.evaluations; tot.b += t.bonus; tot.p += t.salary;
      var stale = o.isCurrent && t.lastRecord && daysBetween(t.lastRecord, o.today) > 5;
      return '<tr><td><button type="button" class="tname" data-t="' + esc(t.name) + '">' + esc(t.name) + "</button>" + badges + "</td><td>" + numf(t.sessions) + "</td><td>" + numf(t.hours, 2) +
        "</td><td>" + numf(t.evaluations) + "</td><td>" + (t.bonus ? money(t.bonus) : "—") + "</td><td>" + money(t.salary) + "</td><td>" +
        (t.lastRecord ? (stale ? '<span class="badge warn">' : "") + esc(fmtDate(t.lastRecord)) + (stale ? "</span>" : "") : "—") + "</td></tr>";
    }).join("");
    $("aTable").querySelector("tfoot").innerHTML = "<tr><td>الإجمالي</td><td>" + numf(tot.s) + "</td><td>" + numf(tot.h, 2) + "</td><td>" + numf(tot.e) + "</td><td>" + money(tot.b) + "</td><td>" + money(tot.p) + "</td><td></td></tr>";
  }
  function daysBetween(a, b) {
    var pa = a.split("-"), pb = b.split("-");
    return Math.round((Date.UTC(+pb[0], +pb[1] - 1, +pb[2]) - Date.UTC(+pa[0], +pa[1] - 1, +pa[2])) / 86400000);
  }

  function openAs(name) {
    if (!name) return;
    asTeacher = name; dateKey = ""; unit = null; lastSaved = null;
    $("adminView").hidden = true; $("app").hidden = true; clearMsg();
    closeUnit();
    load("");
  }
  function fillAsSel() {
    if (!AD) return;
    $("asSel").innerHTML = AD.teachers.filter(function (t) { return t.allowWrite; }).map(function (t) {
      return "<option" + (t.name === asTeacher ? " selected" : "") + ">" + esc(t.name) + "</option>";
    }).join("");
  }
  function backHome() {
    asTeacher = ""; D = null; unit = null;
    $("app").hidden = true; $("asBar").hidden = true; $("month").hidden = true; clearMsg();
    showAdminHome(AD);
  }

  $("adminView").addEventListener("click", function (e) {
    var b = e.target.closest("[data-t]"); if (b) openAs(b.getAttribute("data-t"));
  });
  $("asSel").addEventListener("change", function () { openAs($("asSel").value); });
  $("asHome").addEventListener("click", backHome);
  $("aFresh").addEventListener("click", function () { loadOverview(true); });
  $("aMonth").addEventListener("change", function () { loadOverview(false); });
  document.querySelectorAll("[data-atab]").forEach(function (b) {
    b.addEventListener("click", function () {
      var t = b.getAttribute("data-atab");
      document.querySelectorAll("[data-atab]").forEach(function (x) { x.classList.toggle("on", x === b); });
      $("aSum").hidden = t !== "sum"; $("aArch").hidden = t !== "arch";
      $("aMonth").hidden = t !== "sum"; $("aFresh").hidden = t !== "sum";
      if (t === "arch") $("aQ").focus();
    });
  });
  function archSearch() {
    var q = $("aQ").value.trim();
    if (q.length < 2) return showMsg("⚠ اكتب حرفين على الأقل للبحث.", false);
    clearMsg();
    $("aResults").innerHTML = '<div class="note">جارٍ البحث…</div>';
    api("search", { q: q }).then(function (res) {
      $("aResults").innerHTML = res.reports.length ? res.reports.map(function (r) {
        return '<div class="arch-item"><div class="hd">' + esc(fmtDate(r.date)) + " — " + esc(r.unit) + "</div>" +
          '<div class="note">' + esc(r.teacher) + " — " + esc(r.status) + (r.minutes ? " — " + esc(r.minutes) + " د" : "") + (r.by === "المدير" ? " — سجّله المدير" : "") + "</div>" + reportHtml(r) + "</div>";
      }).join("") : '<div class="note">لا توجد تقارير مطابقة.</div>';
    }).catch(function (e) { $("aResults").innerHTML = '<div class="note">⚠ ' + esc(e.message) + "</div>"; });
  }
  $("aGo").addEventListener("click", archSearch);
  $("aQ").addEventListener("keydown", function (e) { if (e.key === "Enter") archSearch(); });

  /* ---------------- البدء ---------------- */
  takeTokenFromUrl();
  if (!window.PORTAL_DEMO && (!window.PORTAL_API || window.PORTAL_API.indexOf("http") !== 0)) {
    $("loading").hidden = true; $("gate").hidden = false;
    $("gateText").textContent = "البوابة قيد الإعداد. يرجى المحاولة لاحقًا.";
  } else if (!getToken() && !window.PORTAL_DEMO) {
    $("loading").hidden = true; $("gate").hidden = false;
  } else {
    load("");
  }
})();
