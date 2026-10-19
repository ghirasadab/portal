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
  function sessionsWord(n) { return n === 1 ? "مجلس واحد" : n === 2 ? "مجلسان" : (n >= 3 && n <= 10 ? n + " مجالس" : n + " مجلسًا"); }
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
      $("loading").hidden = true; $("gate").hidden = true; $("app").hidden = false; $("myStats").hidden = true; $("myStatsBtn").hidden = false;
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
    $("evalBox").hidden = !D.hasEval;
    var ne = Number((D.evals || {})[dateKey]) || 0;
    $("evalCount").textContent = ne ? "تقييمات هذا اليوم: " + ne : "";
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
    $("empty").hidden = true; $("form").hidden = false; $("evalForm").hidden = true;
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
      $("existing").innerHTML = "مسجَّل في الجدول لهذا اليوم: " + u.members.map(function (m, k) {
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
    $("form").hidden = true; $("evalForm").hidden = true; $("empty").hidden = false;
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
    $("save").textContent = held ? "حفظ المجلس والتقرير" : "حفظ";
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
      if (ms.minutes && !(Number(members[i].minutes) > 0)) throw new Error("اكتب مدة المجلس بالدقائق" + (group ? " لـ" + members[i].name : "") + ".");
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
      $("confirm").textContent = "لم تكتب تقريرًا لهذا المجلس. اضغط «حفظ» مرة أخرى لتسجيل المجلس دون تقرير.";
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
      $("savedLine").textContent = res.reportSaved ? "✓ سُجّل المجلس في جدولك، وحُفظ التقرير في الأرشيف." : "✓ سُجّل المجلس في جدولك.";
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
  // تقييم طالب جديد
  function segVal(id) { var b = $(id).querySelector("button.on"); return b ? b.getAttribute("data-v") : ""; }
  ["evGender", "evCat"].forEach(function (id) {
    $(id).addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      $(id).querySelectorAll("button").forEach(function (x) { x.classList.toggle("on", x === b); });
    });
  });
  $("evalOpen").addEventListener("click", function () {
    if (unit) closeUnit();
    $("empty").hidden = true; $("form").hidden = true; $("evalForm").hidden = false;
    $("evDate").textContent = weekdayOf(dateKey) + " " + fmtDate(dateKey);
    $("evName").focus();
  });
  $("evBack").addEventListener("click", closeUnit);
  $("evSave").addEventListener("click", function () {
    var p = { month: D.month, date: dateKey, name: $("evName").value.trim(), gender: segVal("evGender"), age: $("evAge").value.trim(), category: segVal("evCat"), report: $("evReport").value.trim() };
    if (!p.name) return showMsg("⚠ اكتب اسم الطالب.", false);
    if (!p.gender) return showMsg("⚠ اختر نوع الطالب.", false);
    if (!p.category) return showMsg("⚠ اختر الفئة.", false);
    if (!p.report) return showMsg("⚠ اكتب تقرير التقييم.", false);
    var btn = $("evSave"); btn.disabled = true; btn.textContent = "جارٍ الحفظ…";
    api("addEval", p).then(function (r) {
      D.evals = D.evals || {}; D.evals[dateKey] = r.count;
      ["evName", "evAge", "evReport"].forEach(function (k) { $(k).value = ""; });
      ["evGender", "evCat"].forEach(function (id) { $(id).querySelectorAll("button").forEach(function (x) { x.classList.remove("on"); }); });
      closeUnit(); renderUnits();
      showMsg("✓ حُفظ تقييم " + p.name + "، وأُرسل إلى الإدارة.", true);
    }).catch(function (e) { showMsg("⚠ " + e.message, false); }).then(function () { btn.disabled = false; btn.textContent = "حفظ التقييم"; });
  });
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
    $("adminView").hidden = false; $("myStats").hidden = true; $("myStatsBtn").hidden = true;
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
    document.querySelectorAll(".mLbl").forEach(function (x) { x.textContent = o.month; });
    function kpi(k, v, sub, cls) { return '<div class="kpi' + (cls ? " " + cls : "") + '"><div class="k">' + k + '</div><div class="v">' + v + "</div>" + (sub ? '<div class="s">' + sub + "</div>" : "") + "</div>"; }
    var r = o.money.report;
    $("aMoney").innerHTML = r ? [
      kpi("مجموع الوارد", both(r.income, r.incomeUsd), "الدفعات المسجلة عن الشهر"),
      kpi("رواتب المعلمين", money(r.salaries)),
      kpi("المتبقي للأسر", both(r.familiesCredit, r.familiesCreditUsd), "مجالس مدفوعة لم تُعقد بعد"),
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
    if (!o.isCurrent) $("aToday").innerHTML = '<div class="note">متابعة اليوم متاحة للشهر الحالي فقط.</div>';
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
      }).join("") : '<div class="note">لا توجد مجالس مجدولة اليوم حسب «أيام الدرس» في الجداول.</div>';
    }

    renderStats(o); renderPay(o);
  }

  var CNT = ["done", "makeup", "absent", "pTeacher", "pStudent"];
  function cnt(t, k) { return t.counts ? (t.counts[k] || 0) : 0; }
  function badgesOf(t) { return (t.onLeave ? '<span class="badge">إجازة</span>' : "") + (t.stopAfter ? '<span class="badge warn">يتوقف بعد ' + esc(t.stopAfter) + "</span>" : ""); }
  function tBtn(t, attr) { return '<button type="button" class="tname" ' + attr + '="' + esc(t.name) + '">' + esc(t.name) + "</button>" + badgesOf(t); }

  // الإحصاءات: لكل معلم عدد المجالس والساعات والتقييمات والحالات
  function renderStats(o) {
    var ok = o.teachers.filter(function (t) { return t.ok; });
    var tot = { s: 0, h: 0, e: 0 }; CNT.forEach(function (k) { tot[k] = 0; });
    $("sTable").querySelector("tbody").innerHTML = o.teachers.map(function (t) {
      if (!t.ok) return "<tr><td>" + tBtn(t, "data-t") + '</td><td colspan="9" class="note">⚠ ' + esc(t.error || "") + "</td></tr>";
      tot.s += t.sessions; tot.h += t.hours; tot.e += t.evaluations;
      CNT.forEach(function (k) { tot[k] += cnt(t, k); });
      var stale = o.isCurrent && t.lastRecord && daysBetween(t.lastRecord, o.today) > 5;
      return "<tr><td>" + tBtn(t, "data-st") + "</td><td>" + numf(t.sessions) + "</td><td>" + numf(t.hours, 2) + "</td><td>" + numf(t.evaluations) + "</td>" +
        CNT.map(function (k) { var v = cnt(t, k); return "<td" + (v && (k === "absent" || k === "pTeacher") ? ' class="warn-t"' : "") + ">" + (v || "—") + "</td>"; }).join("") +
        "<td>" + (t.lastRecord ? (stale ? '<span class="badge warn">' : "") + esc(fmtDate(t.lastRecord)) + (stale ? "</span>" : "") : "—") + "</td></tr>";
    }).join("");
    $("sTable").querySelector("tfoot").innerHTML = "<tr><td>الإجمالي</td><td>" + numf(tot.s) + "</td><td>" + numf(tot.h, 2) + "</td><td>" + numf(tot.e) + "</td>" +
      CNT.map(function (k) { return "<td>" + numf(tot[k]) + "</td>"; }).join("") + "<td></td></tr>";
    var planned = tot.done + tot.makeup + tot.absent + tot.pTeacher + tot.pStudent;
    $("sKpis").innerHTML = [
      kpi("ساعات التدريس", numf(tot.h, 1), sessionsWord(tot.s) + " لدى " + ok.length + " معلمًا"),
      kpi("التقييمات", numf(tot.e)),
      kpi("نسبة انعقاد المجالس", planned ? Math.round((tot.done + tot.makeup) * 100 / planned) + "%" : "—", "من المجالس المسجَّلة بأي حالة"),
      kpi("غياب دون تنبيه", numf(tot.absent), "", tot.absent ? "warn" : ""),
      kpi("تأجيل من المعلم", numf(tot.pTeacher), "", tot.pTeacher ? "warn" : ""),
      kpi("تأجيل من الطالب", numf(tot.pStudent))
    ].join("");
  }

  // الرواتب: تفصيل أجر كل معلم وحافز الإنترنت
  function renderPay(o) {
    var f = $("pFilter").value, ok = o.teachers.filter(function (t) { return t.ok; });
    var got = ok.filter(function (t) { return t.bonus > 0; });
    var rows = ok.filter(function (t) { return f === "all" || (f === "yes" ? t.bonus > 0 : !(t.bonus > 0)); });
    var tot = { s: 0, h: 0, e: 0, a: 0, b: 0, p: 0 };
    $("pTable").querySelector("tbody").innerHTML = rows.map(function (t) {
      tot.s += t.sessions; tot.h += t.hours; tot.e += t.evaluations; tot.a += t.beforeBonus || 0; tot.b += t.bonus; tot.p += t.salary;
      var note = t.bonus > 0 ? '<span class="badge">✓ حصل على الحافز</span>'
        : (t.bonusLimit ? '<span class="badge warn">ينقصه ' + sessionsWord(Math.max(t.bonusLimit - t.sessions, 0)) + "</span>" : "—");
      return "<tr><td>" + tBtn(t, "data-st") + "</td><td>" + numf(t.sessions) + "</td><td>" + numf(t.hours, 2) + "</td><td>" + numf(t.evaluations) + "</td><td>" +
        money(t.beforeBonus) + "</td><td>" + (t.bonusLimit ? sessionsWord(t.bonusLimit) : "—") + "</td><td>" + (t.bonus ? money(t.bonus) : "—") + "</td><td><b>" + money(t.salary) + "</b></td><td>" + note + "</td></tr>";
    }).join("") || '<tr><td colspan="9" class="note">لا يوجد معلمون في هذا التصنيف.</td></tr>';
    $("pTable").querySelector("tfoot").innerHTML = "<tr><td>الإجمالي (" + rows.length + ")</td><td>" + numf(tot.s) + "</td><td>" + numf(tot.h, 2) + "</td><td>" + numf(tot.e) + "</td><td>" +
      money(tot.a) + "</td><td></td><td>" + money(tot.b) + "</td><td>" + money(tot.p) + "</td><td></td></tr>";
    var all = ok.reduce(function (a, t) { return a + t.salary; }, 0), bon = got.reduce(function (a, t) { return a + t.bonus; }, 0);
    $("pKpis").innerHTML = [
      kpi("إجمالي الرواتب", money(all), ok.length + " معلمًا"),
      kpi("حافز الإنترنت", got.length + " من " + ok.length, "مجموعه " + money(bon)),
      kpi("متوسط الأجر", money(ok.length ? all / ok.length : 0)),
      kpi("متوسط أجر الساعة", money(ok.reduce(function (a, t) { return a + t.hours; }, 0) ? (all - bon) / ok.reduce(function (a, t) { return a + t.hours; }, 0) : 0), "دون الحافز")
    ].join("");
  }
  function kpi(k, v, sub, cls) { return '<div class="kpi' + (cls ? " " + cls : "") + '"><div class="k">' + k + '</div><div class="v">' + v + "</div>" + (sub ? '<div class="s">' + sub + "</div>" : "") + "</div>"; }

  // جدول طلاب معلم: حضور وتعويض وغياب وتأجيل لكل طالب
  function studentsTable(list) {
    var lbl = { done: "حضر", makeup: "تعويض", absent: "غياب دون تنبيه", pTeacher: "تأجيل من المعلم", pStudent: "تأجيل من الطالب" };
    return '<div class="table-wrap"><table class="tbl"><thead><tr><th>الطالب</th>' + CNT.map(function (k) { return "<th>" + lbl[k] + "</th>"; }).join("") +
      "<th>الدقائق</th><th>آخر حضور</th></tr></thead><tbody>" + list.map(function (x) {
        return "<tr><td><b>" + esc(x.name) + '</b> <span class="note">' + esc(x.code || "") + "</span></td>" +
          CNT.map(function (k) { return "<td" + (x[k] && (k === "absent" || k === "pStudent") && x[k] >= 2 ? ' class="warn-t"' : "") + ">" + (x[k] || "—") + "</td>"; }).join("") +
          "<td>" + numf(x.minutes) + "</td><td>" + (x.last ? esc(fmtDate(x.last)) : '<span class="badge warn">لم يحضر</span>') + "</td></tr>";
      }).join("") + "</tbody></table></div>";
  }
  function statsCards(t) {
    return '<div class="cards">' + [
      kpi("المجالس", numf(t.sessions)), kpi("ساعات التدريس", numf(t.hours, 2)), kpi("التقييمات", numf(t.evaluations)),
      kpi("غياب دون تنبيه", numf(cnt(t, "absent"))), kpi("التأجيل", numf(cnt(t, "pTeacher") + cnt(t, "pStudent")), "من المعلم: " + cnt(t, "pTeacher") + " — من الطلاب: " + cnt(t, "pStudent")),
      kpi("إجمالي الأجر", money(t.salary), t.bonus > 0 ? "منه حافز الإنترنت " + money(t.bonus) : (t.bonusLimit ? "يبقى لحافز الإنترنت " + sessionsWord(Math.max(t.bonusLimit - t.sessions, 0)) : ""), "hl")
    ].join("") + "</div>";
  }

  // المدير: إحصاءات طلاب معلم معيّن
  function showDetail(name) {
    var box = $("sDetail"); box.hidden = false;
    box.innerHTML = "<h2>" + esc(name) + '</h2><div class="loading">جارٍ التحميل…</div>';
    box.scrollIntoView({ behavior: "smooth" });
    api("stats", { month: $("aMonth").value, as: name }).then(function (r) {
      var t = r.stats;
      box.innerHTML = '<div class="min-row" style="justify-content:space-between"><h2 style="margin:0">' + esc(name) + '</h2><button type="button" class="link-btn" data-t="' + esc(name) + '">فتح مجالسه ←</button></div>' +
        (t.ok ? statsCards(t) + studentsTable(t.list || []) : '<div class="note">⚠ ' + esc(t.error || "") + "</div>");
    }).catch(function (e) { box.innerHTML = '<div class="note">⚠ ' + esc(e.message) + "</div>"; });
  }

  // المعلم: إحصاءاته
  function showMyStats() {
    $("app").hidden = true; $("myStats").hidden = false;
    $("msMonth").textContent = $("month").value || "";
    $("msBody").innerHTML = '<div class="loading">جارٍ التحميل…</div>';
    api("stats", { month: $("month").value }).then(function (r) {
      var t = r.stats; $("msMonth").textContent = t.month;
      $("msBody").innerHTML = t.ok ? statsCards(t) + '<section class="card"><h2>طلابي</h2>' + studentsTable(t.list || []) + "</section>" : '<div class="note">⚠ ' + esc(t.error || "") + "</div>";
    }).catch(function (e) { $("msBody").innerHTML = '<div class="note">⚠ ' + esc(e.message) + "</div>"; });
  }
  $("myStatsBtn").addEventListener("click", showMyStats);
  $("msBack").addEventListener("click", function () { $("myStats").hidden = true; $("app").hidden = false; });
  $("pFilter").addEventListener("change", function () { if (OV) renderPay(OV); });
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
    var st = e.target.closest("[data-st]"); if (st) return showDetail(st.getAttribute("data-st"));
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
      var own = t === "arch" || t === "evals";
      $("aSum").hidden = own; $("aArch").hidden = t !== "arch"; $("aEvals").hidden = t !== "evals";
      $("aMonth").hidden = own; $("aFresh").hidden = own;
      if (t === "evals") loadEvals();
      document.querySelectorAll("[data-sec]").forEach(function (x) { x.hidden = x.getAttribute("data-sec") !== t; });
      if (t === "arch") $("aQ").focus();
    });
  });
  // تقييمات الطلاب الجدد وتوزيعهم
  var EV = null;
  function loadEvals() {
    $("evList").innerHTML = '<div class="loading">جارٍ التحميل…</div>';
    api("evals", {}).then(function (r) { EV = r; renderEvals(); })
      .catch(function (e) { $("evList").innerHTML = '<div class="note">⚠ ' + esc(e.message) + "</div>"; });
  }
  function renderEvals() {
    var f = $("evFilter").value;
    var list = EV.evals.filter(function (x) { return !f || x.status === f; });
    var opts = function (sel) { return '<option value="">— المعلم —</option>' + EV.teachers.map(function (n) { return "<option" + (n === sel ? " selected" : "") + ">" + esc(n) + "</option>"; }).join(""); };
    $("evList").innerHTML = list.length ? list.map(function (x) {
      return '<div class="ev-item" data-id="' + esc(x.id) + '"><div class="hd">' + esc(x.name) + ' <span class="badge">' + esc(x.gender) + "</span>" +
        (x.age ? ' <span class="badge">' + esc(x.age) + "</span>" : "") + ' <span class="badge">' + esc(x.category) + "</span>" +
        ' <span class="badge' + (x.status === "جديد" ? " warn" : "") + '">' + esc(x.status) + (x.assigned ? ": " + esc(x.assigned) : "") + "</span></div>" +
        '<div class="note">قيّمه ' + esc(x.teacher) + " — " + esc(fmtDate(x.date)) + "</div>" +
        '<div class="rep">' + esc(x.report) + "</div>" +
        '<div class="asg"><select class="date-sel evT">' + opts(x.assigned) + '</select><input class="evN" placeholder="ملاحظة (اختياري)" value="' + esc(x.assignNote || "") + '" style="flex:1;min-width:120px">' +
        (x.status !== "وُزّع" ? '<button type="button" class="primary small" data-reg="1">➕ تسجيله وإضافته إلى معلم</button>' : "") +
        '<button type="button" class="ghost small" data-ev="وُزّع">توزيع فقط</button><button type="button" class="ghost small" data-ev="لم يلتحق">لم يلتحق</button>' +
        (x.status !== "جديد" ? '<button type="button" class="ghost small" data-ev="جديد">إعادة إلى الجديد</button>' : "") + "</div></div>";
    }).join("") : '<div class="note">لا توجد تقييمات في هذا التصنيف.</div>';
  }
  $("evFilter").addEventListener("change", function () { if (EV) renderEvals(); });

  // نموذج تسجيل الطالب المقيَّم وإضافته إلى معلم
  var EVS = null;
  function regForm(x) {
    var cat = x.category === "تأسيس" ? "مجلس تأسيس" : "مجلس فردي";
    return '<div class="reg-form card">' +
      '<div class="row2"><div class="field"><label>اسم الطالب</label><input class="rf-name" value="' + esc(x.name) + '"></div>' +
      '<div class="field"><label>العمر</label><input class="rf-age" value="' + esc(x.age || "") + '"></div></div>' +
      '<div class="field"><label>ولي الأمر</label><input class="rf-parent" list="rfFamilies" placeholder="اكتب اسم ولي الأمر أو اختر أسرة مسجَّلة">' +
      '<label class="chk"><input type="checkbox" class="rf-new"> أسرة جديدة</label></div>' +
      '<div class="row2"><div class="field"><label>الباقة (عدد المجالس)</label><input class="rf-pkg" inputmode="decimal"></div>' +
      '<div class="field"><label>سعر المجلس</label><input class="rf-price" inputmode="decimal" placeholder="0 = تطوّع"></div></div>' +
      '<div class="field"><label>المعلم</label><select class="rf-teacher date-sel"><option value="">— اختر —</option>' + (EVS ? EVS.teachers.map(function (n) { return "<option>" + esc(n) + "</option>"; }).join("") : "") + "</select></div>" +
      '<div class="field"><label>طريقة الإضافة</label><select class="rf-mode date-sel"><option value="single">مجلس فردي</option><option value="newgroup">مجموعة جديدة</option>' +
      '<option value="join">إلى مجموعة موجودة</option><option value="pair">مع طالب فردي ليصيرا مجموعة</option></select>' +
      '<select class="rf-target date-sel" hidden></select></div>' +
      '<div class="rf-new-unit"><div class="row2"><div class="field"><label>فئة المجلس</label><input class="rf-cat" value="' + esc(cat) + '" data-single="' + esc(cat) + '" data-group="مجموعة ' + esc(x.category) + '"></div>' +
      '<div class="field"><label>المواعيد</label><input class="rf-days" placeholder="مثال: الأحد والأربعاء 5:00م"></div></div>' +
      '<div class="field"><label>أجر الساعة للمعلم (اختياري)</label><input class="rf-rate" inputmode="decimal"></div></div>' +
      '<div class="actions"><button type="button" class="primary small" data-regsave="1">تسجيل الطالب وإضافته</button> <button type="button" class="ghost small" data-regclose="1">إلغاء</button></div></div>';
  }
  function setupReady(cb) {
    if (EVS) return cb();
    api("evalSetup", {}).then(function (r) {
      EVS = r;
      var dl = document.getElementById("rfFamilies") || document.body.appendChild(Object.assign(document.createElement("datalist"), { id: "rfFamilies" }));
      dl.innerHTML = r.families.map(function (f) { return '<option value="' + esc(f.name) + '">' + esc(f.id) + "</option>"; }).join("");
      cb();
    }).catch(function (e) { showMsg("⚠ " + e.message, false); });
  }
  function rfModeUI(f) {
    var mode = f.querySelector(".rf-mode").value, tg = f.querySelector(".rf-target"), info = f._info;
    tg.hidden = !(mode === "join" || mode === "pair");
    f.querySelector(".rf-new-unit").hidden = mode === "join";
    f.querySelector(".rf-days").closest(".field").hidden = mode === "pair";
    var cat = f.querySelector(".rf-cat");
    cat.value = mode === "single" ? cat.getAttribute("data-single") : cat.getAttribute("data-group");
    if (!tg.hidden) {
      var items = !info ? [] : mode === "join" ? info.groups.map(function (g) { return [g.start, g.label]; }) : info.singles.map(function (x) { return [x.code, x.label]; });
      tg.innerHTML = info ? (items.length ? items.map(function (i) { return '<option value="' + esc(i[0]) + '">' + esc(i[1]) + "</option>"; }).join("") : "<option value=''>لا يوجد</option>") : "<option value=''>اختر المعلم أولًا</option>";
    }
  }
  $("evList").addEventListener("change", function (e) {
    var f = e.target.closest(".reg-form"); if (!f) return;
    if (e.target.classList.contains("rf-mode")) rfModeUI(f);
    if (e.target.classList.contains("rf-teacher")) {
      f._info = null; rfModeUI(f);
      if (!e.target.value) return;
      api("evalTeacherInfo", { teacher: e.target.value }).then(function (r) { f._info = r; rfModeUI(f); })
        .catch(function (e2) { showMsg("⚠ " + e2.message, false); });
    }
  });
  $("evList").addEventListener("click", function (e) {
    var rg = e.target.closest("[data-reg]");
    if (rg) {
      var item = rg.closest(".ev-item");
      if (item.querySelector(".reg-form")) return;
      var x0 = EV.evals.filter(function (y) { return y.id === item.getAttribute("data-id"); })[0];
      return setupReady(function () { item.insertAdjacentHTML("beforeend", regForm(x0)); rfModeUI(item.querySelector(".reg-form")); });
    }
    if (e.target.closest("[data-regclose]")) return e.target.closest(".reg-form").remove();
    var sv = e.target.closest("[data-regsave]");
    if (sv) return regSave(sv);
    var b = e.target.closest("[data-ev]"); if (!b) return;
    var it = b.closest(".ev-item"), st = b.getAttribute("data-ev"), teacher = it.querySelector(".evT").value;
    if (st === "وُزّع" && !teacher) return showMsg("⚠ اختر المعلم الذي يُوزَّع إليه الطالب.", false);
    b.disabled = true;
    api("assignEval", { id: it.getAttribute("data-id"), status: st, teacher: st === "جديد" ? "" : teacher, note: it.querySelector(".evN").value }).then(function () {
      var x = EV.evals.filter(function (y) { return y.id === it.getAttribute("data-id"); })[0];
      x.status = st; x.assigned = st === "جديد" ? "" : teacher; x.assignNote = it.querySelector(".evN").value;
      renderEvals(); showMsg("✓ " + (st === "وُزّع" ? "وُزّع " + x.name + " إلى " + teacher + ". ثم أضِف الطالب إلى جدول المعلم من صفحة الإدارة بعد تسجيله." : "حُدّثت حالة " + x.name + "."), true);
    }).catch(function (e2) { b.disabled = false; showMsg("⚠ " + e2.message, false); });
  });

  function regSave(btn) {
    var f = btn.closest(".reg-form"), it = btn.closest(".ev-item"), q = function (c) { return f.querySelector(c).value.trim(); };
    var mode = q(".rf-mode"), p = { id: it.getAttribute("data-id"), name: q(".rf-name"), age: q(".rf-age"), parent: q(".rf-parent"),
      newFamily: f.querySelector(".rf-new").checked, package: q(".rf-pkg"), price: q(".rf-price"), teacher: q(".rf-teacher"), mode: mode,
      category: q(".rf-cat"), days: q(".rf-days"), rate: q(".rf-rate"), note: it.querySelector(".evN").value };
    if (mode === "join") p.groupStart = q(".rf-target");
    if (mode === "pair") p.pairCode = q(".rf-target");
    if (!p.parent) return showMsg("⚠ اكتب اسم ولي الأمر.", false);
    if (p.price === "") return showMsg("⚠ اكتب سعر المجلس (0 إن كان تطوّعًا).", false);
    if (!p.teacher) return showMsg("⚠ اختر المعلم.", false);
    if ((mode === "join" && !p.groupStart) || (mode === "pair" && !p.pairCode)) return showMsg("⚠ اختر " + (mode === "join" ? "المجموعة" : "الطالب الفردي") + ".", false);
    btn.disabled = true; btn.textContent = "جارٍ التسجيل… قد يستغرق ذلك دقيقة";
    api("evalRegister", p).then(function (r) {
      var x = EV.evals.filter(function (y) { return y.id === p.id; })[0];
      x.status = "وُزّع"; x.assigned = p.teacher; x.assignNote = "الكود " + r.code;
      renderEvals();
      showMsg("✓ " + (r.existed ? "كان مسجَّلًا من قبل بالكود " + r.code + (r.filled.length ? "، وأُكملت بياناته: " + r.filled.join("، ") : "") : "سُجّل " + p.name + " بالكود " + r.code + " في الأسرة " + r.familyId) + ".\n" + r.message, true);
    }).catch(function (e) { btn.disabled = false; btn.textContent = "تسجيل الطالب وإضافته"; showMsg("⚠ " + e.message, false); });
  }

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
