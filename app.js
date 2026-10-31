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
    var isLong = /^(evalRegister|paySave|stuRegister|stuAdd|stuMove|stCall)$/.test(action);   // التسجيل والإضافة إلى جداول المعلمين قد تستغرق دقيقة
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, isLong ? 150000 : 45000);
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
        if (e && e.name === "AbortError") throw new Error(isLong ? "لم يصل الرد بعد. قد تكون العملية قد تمّت، فتحقق (من قائمة التقييمات أو جدول المعلم) قبل إعادة المحاولة." : "لم يصل رد من الخادم. تحقق من الاتصال وأعد المحاولة.");
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
  // مواعيد اليوم من الكالندر (إن وُجد للمعلم كالندر)
  function dayEvents(key) { return D && D.schedule ? (D.schedule[key] || []) : null; }
  function unitTime(u, key) {
    var ev = dayEvents(key); if (!ev) return "";
    return ev.filter(function (e) { return e.unitKey === u.key; }).map(function (e) { return fmtTime(e.from) + (e.kind === "makeup" ? " (تعويض)" : ""); }).join("، ");
  }
  function fmtTime(t) {
    var p = String(t || "").split(":"), h = +p[0], m = p[1] || "00";
    return (h % 12 || 12) + ":" + m + (h < 12 ? "ص" : "م");
  }
  function isUnitToday(u, key) {
    var ev = dayEvents(key);
    if (ev) return ev.some(function (e) { return e.unitKey === u.key; });
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
    var firstTime = function (u) { var ev = dayEvents(dateKey) || []; var e = ev.filter(function (x) { return x.unitKey === u.key; })[0]; return e ? e.from : "99"; };
    today.sort(function (a, b) { return firstTime(a) < firstTime(b) ? -1 : 1; });
    var other = list.filter(function (u) { return !isUnitToday(u, dateKey); });
    function li(u) {
      var done = unitRecorded(u, dateKey);
      return '<li tabindex="0" data-key="' + esc(u.key) + '"' + (unit && unit.key === u.key ? ' class="sel"' : "") + '><div><div class="nm">' + esc(u.title) +
        '</div><div class="mt">' + (unitTime(u, dateKey) ? '<b class="tm">' + esc(unitTime(u, dateKey)) + "</b> — " : "") + esc(u.cat) + (u.days && !dayEvents(dateKey) ? " — " + esc(u.days) : "") + (finishedOf(u).length === u.members.length ? " — ⚠ انتهت الباقة" : finishedOf(u).length ? " — ⚠ انتهت باقة " + finishedOf(u).length : "") + '</div></div><span class="dot' + (done ? " done" : "") + '" title="' + (done ? "مسجَّل" : "غير مسجَّل") + '"></span></li>';
    }
    $("evalBox").hidden = !D.hasEval;
    var ne = Number((D.evals || {})[dateKey]) || 0;
    $("evalCount").textContent = ne ? "تقييمات هذا اليوم: " + ne : "";
    $("todayHead").textContent = "مجالس " + (dateKey === D.today ? "اليوم" : "يوم " + weekdayOf(dateKey));
    // مواعيد الكالندر غير المرتبطة بمجلس، والتقييمات
    var extra = (dayEvents(dateKey) || []).filter(function (e) { return !e.unitKey; }).map(function (e) {
      if (e.kind === "eval") return '<li class="cal-ev" data-eval="' + esc(e.name) + '"><div><div class="nm">تقييم: ' + esc(e.name) + '</div><div class="mt"><b class="tm">' + esc(fmtTime(e.from)) + '</b> — اضغط لكتابة التقييم</div></div><span class="ev-ic">📝</span></li>';
      return '<li class="cal-ev muted"><div><div class="nm">' + esc(e.title) + '</div><div class="mt"><b class="tm">' + esc(fmtTime(e.from)) + "</b> — موعد في الكالندر لم يُربط بمجلس</div></div></li>";
    }).join("");
    $("unitsToday").innerHTML = (today.length ? today.map(li).join("") : (extra ? "" : '<li class="empty">لا توجد مجالس مجدولة في هذا اليوم.</li>')) + extra;
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
    renderFinished(u);

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

  // طلاب انتهت باقاتهم ولم تعد لهم مجالس (من «الأسر والطلاب»)
  function finishedOf(u) { return u.members.filter(function (m) { return m.finished; }); }
  function renderFinished(u) {
    var box = $("finishedNote");
    if (!box) {
      $("existing").insertAdjacentHTML("beforebegin", '<div class="existing" id="finishedNote" hidden></div>');
      box = $("finishedNote");
    }
    var f = finishedOf(u);
    box.hidden = !f.length;
    if (!f.length) return;
    box.innerHTML = f.length === 1
      ? "انتهت باقة <b>" + esc(f[0].name) + "</b> (" + esc(f[0].done) + " من " + esc(f[0].pkg) + ") ولم تعد له مجالس متبقية. راجع الإدارة قبل تسجيل مجلس جديد."
      : "انتهت باقات: <b>" + f.map(function (m) { return esc(m.name); }).join("، ") + "</b> ولم تعد لهم مجالس متبقية. راجع الإدارة قبل تسجيل مجلس جديد.";
  }

  // آخر مجلس في باقة الشهر: المجالس المحتسبة قبل اليوم (حضر أو تعويض أو غياب دون تنبيه) + هذا المجلس = الباقة
  function usedBefore(m, key) {
    var i = dateIdx(key), n = 0;
    m.cells.forEach(function (c, j) { if (j !== i && c && (c[1] === "done" || c[1] === "makeup" || c[1] === "absent")) n++; });
    return n;
  }
  function lastOfPackage(u) {
    return u.members.filter(function (m) {
      if (!(m.pkg > 0) || usedBefore(m, dateKey) + 1 !== m.pkg) return false;
      var row = document.querySelector('#members .mrow[data-col="' + m.col + '"] select');
      return !(row && row.value === "pStudent");
    });
  }
  function renderLastNote() {
    var box = $("lastSessionNote");
    if (!box) {
      $("reportBox").insertAdjacentHTML("beforebegin", '<div class="existing" id="lastSessionNote" hidden></div>');
      box = $("lastSessionNote");
    }
    var f = unit && !$("form").hidden && (status === "done" || status === "makeup") ? lastOfPackage(unit) : [];
    box.hidden = !f.length;
    if (!f.length) return;
    box.innerHTML = "هذا آخر مجلس في باقة هذا الشهر لـ<b>" + f.map(function (m) { return esc(m.name); }).join("، ") + "</b> (" + f[0].pkg + " من " + f[0].pkg + "). " +
      "نبّه ولي الأمر في التقرير إلى انتهاء الباقة. " +
      '<button type="button" class="ghost small" id="lastNoteAdd">إضافة التنبيه إلى الملاحظات</button>';
  }
  document.addEventListener("click", function (e) {
    if (!e.target || e.target.id !== "lastNoteAdd") return;
    var t = "تنبيه: كان هذا آخر مجلس في باقة هذا الشهر، ونرجو تجديد الباقة.";
    var n = $("rNotes");
    if (n.value.indexOf(t) === -1) n.value = (n.value.trim() ? n.value.trim() + "\n" : "") + t;
    n.dispatchEvent(new Event("input"));
    e.target.disabled = true;
  });

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
    renderLastNote();
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
  $("unitsToday").addEventListener("click", function (e) {
    var ev = e.target.closest("[data-eval]"); if (!ev) return;
    e.stopPropagation(); $("evalOpen").click(); $("evName").value = ev.getAttribute("data-eval");
  }, true);
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
  $("members").addEventListener("change", function () { syncMemberInputs(); resetSave(); renderLastNote(); });
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
    loadReady();
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

  // جدول طلاب معلم: صف واحد لكل طالب يجمع أعمدته (الفردي والمجموعات) بالكود، وطلاب المجموعة الواحدة متجاورون
  function studentsTable(list) {
    var lbl = { done: "حضر", makeup: "تعويض", absent: "غياب دون تنبيه", pTeacher: "تأجيل من المعلم", pStudent: "تأجيل من الطالب" };
    var byKey = {}, all = [], groups = {}, gOrder = [];
    list.forEach(function (x) {
      var key = x.code || ("#" + x.name), s = byKey[key];
      if (!s) {
        s = byKey[key] = { name: x.name, code: x.code, minutes: 0, last: "", single: 0, group: 0, hasSingle: false, inGroup: false };
        CNT.forEach(function (k) { s[k] = 0; });
        all.push(s);
      }
      if (String(x.name).length > String(s.name).length) s.name = x.name;
      CNT.forEach(function (k) { s[k] += x[k] || 0; });
      s.minutes += x.minutes || 0;
      if (x.last && x.last > s.last) s.last = x.last;
      var met = (x.done || 0) + (x.makeup || 0);
      if (x.gk) {
        s.group += met; s.inGroup = true;
        if (!groups[x.gk]) { groups[x.gk] = []; gOrder.push(x.gk); }
        if (groups[x.gk].indexOf(s) === -1) groups[x.gk].push(s);
      } else { s.single += met; s.hasSingle = true; }
    });
    function head(t) { return '<tr><td colspan="8" style="background:var(--beige);font-weight:700;font-size:12.5px">' + t + "</td></tr>"; }
    function row(s) {
      var split = s.hasSingle && s.inGroup ? '<div class="note" style="margin-top:2px">فردي: ' + s.single + " — في مجموعة: " + s.group + "</div>" : "";
      return "<tr><td><b>" + esc(s.name) + '</b> <span class="note">' + esc(s.code || "") + "</span>" + split + "</td>" +
        CNT.map(function (k) { return "<td" + (s[k] && (k === "absent" || k === "pStudent") && s[k] >= 2 ? ' class="warn-t"' : "") + ">" + (s[k] || "—") + "</td>"; }).join("") +
        "<td>" + numf(s.minutes) + "</td><td>" + (s.last ? esc(fmtDate(s.last)) : '<span class="badge warn">لم يحضر</span>') + "</td></tr>";
    }
    var placed = [], body = "";
    gOrder.forEach(function (gk) {
      var mem = groups[gk], rest = mem.filter(function (s) { return placed.indexOf(s) === -1; });
      if (!rest.length) return;
      body += head("مجموعة: " + mem.map(function (s) { return esc(s.name); }).join("، ")) + rest.map(row).join("");
      placed = placed.concat(rest);
    });
    var singles = all.filter(function (s) { return placed.indexOf(s) === -1; });
    if (singles.length) body += (gOrder.length ? head("مجالس فردية") : "") + singles.map(row).join("");
    return '<div class="table-wrap"><table class="tbl"><thead><tr><th>الطالب</th>' + CNT.map(function (k) { return "<th>" + lbl[k] + "</th>"; }).join("") +
      "<th>الدقائق</th><th>آخر حضور</th></tr></thead><tbody>" + body + "</tbody></table></div>";
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
  /* ---------- العطل العامة ---------- */
  var HOL = [];
  function holTxt(k) { var p = String(k).split(" "); return fmtDate(p[0]) + " " + fmtTime(p[1]); }
  (function buildHolidayTab() {
    var tabs = document.querySelector(".admin-tabs"), sp = tabs && tabs.querySelector(".spacer");
    if (!tabs) return;
    sp.insertAdjacentHTML("beforebegin", '<button type="button" class="tab" data-atab="holidays">العطل</button>');
    $("adminView").insertAdjacentHTML("beforeend",
      '<div id="aHol" hidden><section class="card"><h2>العطل العامة</h2>' +
      '<div class="note">حدّد بداية العطلة ونهايتها بالتاريخ والوقت. اليوم الذي تغطيه العطلة كاملًا يُلوَّن في جداول جميع المعلمين باللون المخصص لـ«عطلة عامة»، واليوم الذي تغطيه جزئيًا تُلوَّن فيه المجالس التي يقع موعدها في الكالندر ضمن الوقت المحدد فقط. يُلوَّن الفارغ من الخانات فقط، فلا يُمسّ أي مجلس مسجَّل.</div>' +
      '<div class="row2"><div class="field"><label for="holStart">بداية العطلة</label><input id="holStart" type="datetime-local"></div>' +
      '<div class="field"><label for="holEnd">نهاية العطلة</label><input id="holEnd" type="datetime-local"></div></div>' +
      '<div class="min-row"><input id="holName" type="text" placeholder="اسم العطلة (اختياري)" style="flex:1;min-width:140px">' +
      '<button type="button" class="ghost small" id="holFull">يوم كامل</button>' +
      '<button type="button" class="primary small" id="holAdd">إضافة عطلة عامة</button></div>' +
      '<div id="holResult"></div></section>' +
      '<section class="card"><h2>العطل المسجَّلة</h2><div id="holList"><div class="loading">جارٍ التحميل…</div></div></section></div>');
    $("holFull").addEventListener("click", function () {
      var d = ($("holStart").value || ($("holEnd").value) || (AD && AD.today) || "").slice(0, 10);
      if (!d) return showMsg("⚠ اختر تاريخ البداية أولًا.", false);
      $("holStart").value = d + "T00:00"; $("holEnd").value = ($("holEnd").value && $("holEnd").value.slice(0, 10) > d ? $("holEnd").value.slice(0, 10) : d) + "T23:59";
    });
    $("holStart").addEventListener("change", function () {
      if ($("holStart").value && !$("holEnd").value) $("holEnd").value = $("holStart").value.slice(0, 10) + "T23:59";
    });
    $("holAdd").addEventListener("click", function () {
      var st = $("holStart").value, en = $("holEnd").value;
      if (!st || !en) return showMsg("⚠ حدّد بداية العطلة ونهايتها.", false);
      if (en <= st) return showMsg("⚠ يجب أن تكون نهاية العطلة بعد بدايتها.", false);
      holRun("holidayAdd", { start: st, end: en, name: $("holName").value }, "جارٍ تلوين جداول المعلمين… قد يستغرق ذلك دقائق إن طالت العطلة.");
    });
    $("holList").addEventListener("click", function (e) {
      var b = e.target.closest("[data-hs]"); if (!b) return;
      var act = b.getAttribute("data-act");
      if (act === "remove" && !window.confirm("تُزال العطلة ويُزال لونها من الخانات الفارغة في جداول المعلمين. هل تتابع؟")) return;
      holRun(act === "remove" ? "holidayRemove" : "holidayAdd", { start: b.getAttribute("data-hs"), end: b.getAttribute("data-he") }, "جارٍ تحديث جداول المعلمين…");
    });
  })();
  function loadHolidays() {
    api("holidayList", {}).then(function (r) { HOL = r.holidays || []; renderHolidays(); })
      .catch(function (e) { $("holList").innerHTML = '<div class="note">⚠ ' + esc(e.message) + "</div>"; });
  }
  function renderHolidays() {
    $("holList").innerHTML = HOL.length ? HOL.map(function (h) {
      return '<div class="inv-family-row"><span class="inv-fname">' + esc(h.name) + " — من " + esc(holTxt(h.start)) + " إلى " + esc(holTxt(h.end)) + '</span>' +
        '<button type="button" class="ghost small" data-act="add" data-hs="' + esc(h.start) + '" data-he="' + esc(h.end) + '">إعادة التطبيق</button> ' +
        '<button type="button" class="ghost small" data-act="remove" data-hs="' + esc(h.start) + '" data-he="' + esc(h.end) + '">إلغاء</button></div>';
    }).join("") : '<div class="note">لا توجد عطل مسجَّلة.</div>';
  }
  function holRun(action, payload, wait) {
    var box = $("holResult");
    box.innerHTML = '<div class="loading">' + esc(wait) + "</div>";
    document.querySelectorAll("#aHol button").forEach(function (b) { b.disabled = true; });
    api(action, payload).then(function (r) {
      var removed = action === "holidayRemove";
      box.innerHTML = '<div class="note">✓ ' + (removed ? "أُلغيت العطلة" : (r.already ? "العطلة مسجَّلة من قبل، وأُعيد تطبيقها" : "أُضيفت العطلة")) +
        ": " + (removed ? "أُزيل اللون من " : "لُوِّن ") + numf(r.cells) + " خانة في جداول " + numf(r.teachers) + " معلمًا." +
        (r.kept && !removed ? "<br>تُركت " + numf(r.kept) + " خانة لأن فيها مجلسًا أو حالة مسجَّلة." : "") +
        (r.skipped && r.skipped.length ? "<br>⚠ " + r.skipped.map(esc).join("<br>⚠ ") : "") + "</div>";
      OV = null;
      loadHolidays();
    }).catch(function (e) { box.innerHTML = '<div class="note">⚠ ' + esc(e.message) + "</div>"; })
      .then(function () { document.querySelectorAll("#aHol button").forEach(function (b) { b.disabled = false; }); });
  }

  /* ---------- تسجيل الدفعات (منقولة من صفحة الإدارة) ---------- */
  var PAY = null, PDUE = null, pDueTab = "none", pSel = null, pStat = null, pSaving = false, pPending = "", pTok = "", pTokKey = "";
  function pmoney(n, usd) { n = Number(n) || 0; return n.toLocaleString("en-US", { maximumFractionDigits: 2 }) + (usd ? " $" : " ج"); }
  (function buildPayTab() {
    var tabs = document.querySelector(".admin-tabs"), inv = tabs && tabs.querySelector('[data-atab="invoices"]');
    if (!tabs || !inv) return;
    inv.insertAdjacentHTML("beforebegin", '<button type="button" class="tab" data-atab="payments">الدفعات</button>');
    $("adminView").insertAdjacentHTML("beforeend",
      '<div id="aPay" hidden>' +
      '<section class="card" id="pySearchCard"><h2>تسجيل دفعة — <span id="pyCur"></span></h2>' +
      '<div class="field"><label for="pyQ">ابحث عن ولي الأمر (بالاسم أو اسم الطالب أو المعرّف)</label>' +
      '<input id="pyQ" type="search" autocomplete="off" placeholder="مثال: أماني أو حمزة أو س.0001" style="width:100%"></div>' +
      '<div id="pyResults"></div></section>' +
      '<section class="card" id="pyDueCard"><h2>متابعة التحصيل — الشهر الحالي</h2>' +
      '<div class="min-row"><button type="button" class="chip on" data-pdue="none">لم تدفع بعد <span id="pyCNone">…</span></button>' +
      '<button type="button" class="chip" data-pdue="part">دفعت جزءًا <span id="pyCPart">…</span></button></div>' +
      '<div class="note" id="pyDueTotal"></div><div id="pyDueList"><div class="loading">جارٍ التحميل…</div></div></section>' +
      '<section class="card" id="pyFamCard" hidden>' +
      '<div class="min-row" style="justify-content:space-between"><div><h2 style="margin:0" id="pyName"></h2><div class="note" id="pyMeta" style="margin:2px 0 0"></div></div>' +
      '<button type="button" class="link-btn" id="pyChange">تغيير</button></div>' +
      '<div class="cards" style="margin-top:10px;grid-template-columns:repeat(2,minmax(0,1fr))">' +
      '<div class="kpi"><div class="k">فاتورة الشهر</div><div class="v" id="pyInv">–</div></div>' +
      '<div class="kpi"><div class="k">رصيد من الشهر السابق</div><div class="v" id="pyPrev">–</div></div>' +
      '<div class="kpi"><div class="k">المدفوع عن الشهر</div><div class="v" id="pyPaid">–</div></div>' +
      '<div class="kpi hl"><div class="k">المتبقي</div><div class="v" id="pyRem">–</div></div></div>' +
      '<span class="badge" id="pyStatus"></span>' +
      '<div class="note" id="pyFirstNote" hidden>أول شهر في النظام: «المتبقي» لا يشمل رصيد سبتمبر، فاعتمد على الفاتورة التي أُرسلت إلى الأسرة.</div>' +
      '<div class="field"><label for="pyAmount" id="pyAmountLbl">المبلغ</label>' +
      '<div class="min-row"><input id="pyAmount" type="text" inputmode="decimal" placeholder="0" style="flex:1;width:auto;min-width:0">' +
      '<button type="button" class="ghost small" id="pyFill" style="white-space:nowrap">المتبقي كله</button></div></div>' +
      '<div class="row2"><div class="field"><label for="pyMonth">عن شهر</label><select id="pyMonth" class="date-sel" style="width:100%"></select></div>' +
      '<div class="field"><label for="pyMethod">طريقة الدفع</label><select id="pyMethod" class="date-sel" style="width:100%"></select></div></div>' +
      '<div class="field"><label for="pyNotes">ملاحظات (اختياري)</label><textarea id="pyNotes" rows="2" placeholder="مثال: رقم التحويل أو اسم المحوِّل"></textarea></div>' +
      '<div class="confirm" id="pyConfirm" hidden></div>' +
      '<div class="actions"><button type="button" class="primary" id="pySave">تسجيل الدفعة</button></div></section>' +
      '<section class="card" id="pyHistCard" hidden><h2>آخر الدفعات المسجَّلة لهذه الأسرة</h2><div id="pyHist"></div></section>' +
      '</div>');

    $("pyQ").addEventListener("input", payResults);
    $("pyQ").addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      var f = $("pyResults").querySelector("[data-pf]"); if (f) paySelect(f.getAttribute("data-pf"));
    });
    $("aPay").addEventListener("click", function (e) {
      var r = e.target.closest("[data-pf]"); if (r) return paySelect(r.getAttribute("data-pf"));
      var c = e.target.closest("[data-pdue]");
      if (c) {
        pDueTab = c.getAttribute("data-pdue");
        document.querySelectorAll("[data-pdue]").forEach(function (x) { x.classList.toggle("on", x === c); });
        payDueRender();
      }
    });
    $("pyChange").addEventListener("click", payBack);
    $("pyFill").addEventListener("click", function () {
      if (pStat && pStat.remaining > 0) { $("pyAmount").value = pStat.remaining; payResetConfirm(); }
    });
    $("pySave").addEventListener("click", paySave);
    ["pyAmount", "pyMonth", "pyMethod"].forEach(function (k) { $(k).addEventListener("input", payResetConfirm); $(k).addEventListener("change", payResetConfirm); });
  })();
  function loadPay() {
    if (PAY) { payDueLoad(); return; }
    $("pyResults").innerHTML = '<div class="loading">جارٍ تحميل الأسر…</div>';
    api("payInit", {}).then(function (d) {
      PAY = d;
      d.families.forEach(function (f) { f._k = norm(f.name + " " + f.id + " " + f.kids); });
      $("pyCur").textContent = d.currentMonth;
      $("pyMonth").innerHTML = d.months.map(function (m) { return "<option" + (m === d.currentMonth ? " selected" : "") + ">" + esc(m) + "</option>"; }).join("");
      $("pyMethod").innerHTML = d.methods.map(function (m) { return "<option>" + esc(m) + "</option>"; }).join("");
      $("pyResults").innerHTML = "";
      payResults();
      $("pyQ").focus();
    }).catch(function (e) { $("pyResults").innerHTML = '<div class="note">⚠ ' + esc(e.message) + "</div>"; });
    payDueLoad();
  }
  function payResults() {
    if (!PAY) return;
    var q = norm($("pyQ").value), box = $("pyResults");
    if (!q) { box.innerHTML = ""; return; }
    var words = q.split(" ");
    var hits = PAY.families.filter(function (f) { return words.every(function (w) { return f._k.indexOf(w) !== -1; }); }).slice(0, 8);
    box.innerHTML = hits.length ? hits.map(function (f) {
      return '<div class="inv-family-row" data-pf="' + esc(f.id) + '"><span class="inv-fname"><b>' + esc(f.name) + "</b><br><small>" + esc(f.id) + (f.kids ? " — " + esc(f.kids) : "") + "</small></span></div>";
    }).join("") : '<div class="note">لا توجد نتائج.</div>';
  }
  function payDueLoad() {
    api("payDue", {}).then(function (r) { PDUE = r.list || []; payDueRender(); })
      .catch(function (e) { $("pyDueList").innerHTML = '<div class="note">⚠ ' + esc(e.message) + "</div>"; });
  }
  function payDueRender() {
    if (!PDUE) return;
    var none = PDUE.filter(function (f) { return f.none; }), part = PDUE.filter(function (f) { return !f.none; });
    $("pyCNone").textContent = "(" + none.length + ")"; $("pyCPart").textContent = "(" + part.length + ")";
    var list = pDueTab === "none" ? none : part;
    var totE = list.reduce(function (t, f) { return t + (f.usd ? 0 : f.remaining); }, 0);
    var totU = list.reduce(function (t, f) { return t + (f.usd ? f.remaining : 0); }, 0);
    $("pyDueTotal").textContent = list.length ? "إجمالي المتبقي: " + pmoney(totE) + (totU ? " + " + pmoney(totU, true) : "") : "";
    $("pyDueList").innerHTML = list.length ? list.map(function (f) {
      return '<div class="inv-family-row" data-pf="' + esc(f.id) + '"><span class="inv-fname"><b>' + esc(f.name) + "</b><br><small>" + esc(f.id) +
        (f.paid > 0 ? " — دفعت " + pmoney(f.paid, f.usd) + " من " + pmoney(f.invoice + f.previous, f.usd) : " — الفاتورة " + pmoney(f.invoice + f.previous, f.usd)) +
        '</small></span><span class="inv-rem">' + pmoney(f.remaining, f.usd) + "</span></div>";
    }).join("") : '<div class="note">لا توجد أسر في هذه القائمة.</div>';
  }
  function paySelect(id) {
    if (pSaving || !PAY) return;
    pSel = PAY.families.filter(function (f) { return f.id === id; })[0];
    if (!pSel) return;
    clearMsg();
    $("pySearchCard").hidden = true; $("pyDueCard").hidden = true;
    $("pyName").textContent = pSel.name;
    $("pyMeta").textContent = pSel.id + (pSel.kids ? " — " + pSel.kids : "");
    ["pyInv", "pyPrev", "pyPaid", "pyRem"].forEach(function (k) { $(k).textContent = "…"; });
    $("pyStatus").textContent = ""; $("pyStatus").hidden = true;
    $("pyFamCard").hidden = false; $("pyHistCard").hidden = true;
    $("pyFirstNote").hidden = !PAY.firstMonthNote;
    $("pyAmount").value = ""; $("pyNotes").value = "";
    pStat = null; payResetConfirm();
    window.scrollTo({ top: 0, behavior: "smooth" });
    payStatus(id, 1);
  }
  function payStatus(id, attempt) {
    api("payStatus", { familyId: id }).then(payRender).catch(function (e) {
      if (attempt < 2) return payStatus(id, attempt + 1);
      showMsg("⚠ " + e.message, false);
    });
  }
  function payRender(s) {
    if (!s || !pSel || s.id !== pSel.id) return;
    pStat = s;
    var u = !!s.usd;
    $("pyAmountLbl").textContent = u ? "المبلغ بالدولار ($)" : "المبلغ بالجنيه";
    $("pyAmount").placeholder = u ? "0 $" : "0 ج";
    $("pyInv").textContent = pmoney(s.invoice, u); $("pyPrev").textContent = pmoney(s.previous, u);
    $("pyPaid").textContent = pmoney(s.paid, u); $("pyRem").textContent = pmoney(s.remaining, u);
    $("pyStatus").textContent = s.status || ""; $("pyStatus").hidden = !s.status;
    var h = s.payments || [];
    $("pyHist").innerHTML = h.map(function (p) {
      return '<div class="inv-family-row" style="cursor:default"><span class="inv-fname">' + esc(p.date || "—") + " · " + esc(p.month) + (p.method ? " · " + esc(p.method) : "") +
        (p.notes ? "<br><small>" + esc(p.notes) + "</small>" : "") + '</span><b>' + pmoney(p.amount, u) + "</b></div>";
    }).join("");
    $("pyHistCard").hidden = !h.length;
  }
  function payBack() {
    if (pSaving) return;
    pSel = null; pStat = null;
    $("pyFamCard").hidden = true; $("pyHistCard").hidden = true;
    $("pySearchCard").hidden = false; $("pyDueCard").hidden = false;
    $("pyQ").value = ""; payResults(); payDueRender(); $("pyQ").focus();
  }
  function payResetConfirm() {
    pPending = ""; $("pyConfirm").hidden = true;
    if (!pSaving) { $("pySave").textContent = "تسجيل الدفعة"; $("pySave").classList.remove("confirming"); }
  }
  function paySetSaving(on, label) {
    pSaving = on; $("pySave").disabled = on; $("pySave").classList.remove("confirming");
    $("pySave").textContent = label || (on ? "جارٍ التسجيل…" : "تسجيل الدفعة");
  }
  function paySave() {
    if (pSaving || !pSel) return;
    clearMsg();
    var amount = parseFloat(digits($("pyAmount").value));
    if (!(amount > 0)) return showMsg("⚠ اكتب مبلغًا صحيحًا أكبر من صفر.", false);
    var month = $("pyMonth").value, key = pSel.id + "|" + amount + "|" + month;
    if (pPending !== key) {
      pPending = key;
      $("pyConfirm").textContent = "سيُسجَّل " + pmoney(amount, pStat && pStat.usd) + " من " + pSel.name + " عن " + month + ". اضغط مرة أخرى للتأكيد.";
      $("pyConfirm").hidden = false;
      $("pySave").textContent = "تأكيد التسجيل"; $("pySave").classList.add("confirming");
      return;
    }
    payResetConfirm();
    // رقم مميّز للدفعة: إن أُعيد إرسالها بعد انقطاع لا تُسجَّل مرتين
    if (pTokKey !== key) { pTokKey = key; pTok = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10); }
    paySend({ familyId: pSel.id, amount: amount, month: month, method: $("pyMethod").value, notes: $("pyNotes").value, payToken: pTok }, pSel, 1);
  }
  function paySend(p, fam, attempt) {
    paySetSaving(true, attempt > 1 ? "الشيت مشغول بتحديث المجالس… جارٍ إعادة المحاولة (" + attempt + ")" : "جارٍ التسجيل…");
    api("paySave", p).then(function (s) {
      paySetSaving(false);
      pTokKey = ""; pTok = "";
      if (pSel && pSel.id === fam.id) { $("pyAmount").value = ""; $("pyNotes").value = ""; }
      payRender(s);
      payDueLoad();
      showMsg((s.alreadySaved ? "✓ هذه الدفعة مسجَّلة من قبل ولم تُكرَّر: " : "✓ سُجّلت دفعة ") + pmoney(p.amount, s.usd) + " من " + fam.name + "، والمتبقي الآن " + pmoney(s.remaining, s.usd) + ".", true);
    }).catch(function (e) {
      var m = String(e.message || e);
      if (m.indexOf("BUSY:") === 0 && attempt < 4) { setTimeout(function () { paySend(p, fam, attempt + 1); }, 6000); return; }
      paySetSaving(false);
      if (m.indexOf("DUP:") === 0) {
        // دفعة مطابقة مسجَّلة من قبل: لا تُسجَّل إلا بتأكيد صريح
        $("pyConfirm").innerHTML = "⚠ توجد دفعة مسجَّلة لهذه الأسرة بالمبلغ نفسه (" + esc(pmoney(p.amount, pStat && pStat.usd)) + ") وعن الشهر نفسه (" + esc(p.month) + ") " + esc(m.slice(4)) +
          "، فلم تُسجَّل هذه الدفعة.<br>إن كانت دفعة جديدة فعلًا فاضغط الزر التالي." +
          '<div class="actions"><button type="button" class="ghost small" id="pyForce">سجّلها دفعة جديدة</button></div>';
        $("pyConfirm").hidden = false;
        $("pyForce").addEventListener("click", function () { $("pyConfirm").hidden = true; p.force = true; paySend(p, fam, 1); });
        return showMsg("⚠ لم تُسجَّل الدفعة: يبدو أنها مكررة.", false);
      }
      showMsg("⚠ " + (m.indexOf("BUSY:") === 0 ? m.slice(5).trim() : m) + " إن لم تتأكد من وصول الدفعة فاضغط «تسجيل الدفعة» مرة أخرى بالبيانات نفسها، ولن تُكرَّر.", false);
    });
  }

  /* ---------- طالب جديد، وإضافة طالب إلى معلم أو نقله (منقولة من صفحة الإدارة) ---------- */
  var STU = null, stBusy = false, stArmed = "", stRegTok = "", stRegKey = "", stFam = null, stPick = null, stInfo = null, stPrevT = null;
  function stTok() { return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10); }
  function stOpts(sel) { return '<option value="">— اختر —</option>' + (STU ? STU.teachers.map(function (n) { return "<option" + (n === sel ? " selected" : "") + ">" + esc(n) + "</option>"; }).join("") : ""); }
  (function buildStuTab() {
    var tabs = document.querySelector(".admin-tabs"), ev = tabs && tabs.querySelector('[data-atab="evals"]');
    if (!tabs || !ev) return;
    ev.insertAdjacentHTML("afterend", '<button type="button" class="tab" data-atab="students">تسجيل ونقل</button>');
    var unit = function (p) {
      return '<div class="field"><label for="' + p + 'Teacher" id="' + p + 'TeacherLbl">المعلم</label><select id="' + p + 'Teacher" class="date-sel" style="width:100%"></select></div>' +
        '<div class="confirm" id="' + p + 'Has" hidden>الطالب مسجَّل بالفعل لدى هذا المعلم في الشهر الحالي.</div>' +
        '<div class="field"><label for="' + p + 'Mode">طريقة الإضافة</label><select id="' + p + 'Mode" class="date-sel" style="width:100%"><option value="single">مجلس فردي</option><option value="newgroup">مجموعة جديدة</option>' +
        '<option value="join">إلى مجموعة موجودة</option><option value="pair">مع طالب فردي ليصيرا مجموعة</option></select>' +
        '<select id="' + p + 'Target" class="date-sel" style="width:100%;margin-top:6px" hidden></select></div>' +
        '<div id="' + p + 'NewUnit"><div class="row2"><div class="field"><label for="' + p + 'Cat">فئة المجلس</label><input id="' + p + 'Cat" placeholder="مجلس فردي"></div>' +
        '<div class="field"><label for="' + p + 'Rate">أجر الساعة للمعلم</label><input id="' + p + 'Rate" inputmode="decimal" value="70"></div></div>' +
        '<div class="field" id="' + p + 'DaysWrap"><label for="' + p + 'Days">المواعيد (اختياري)</label><input id="' + p + 'Days" placeholder="مثال: الأحد والأربعاء 5:00م"></div></div>';
    };
    $("adminView").insertAdjacentHTML("beforeend",
      '<style>#aStu .row2{grid-template-columns:repeat(2,minmax(0,1fr))}#aStu input:not([type=checkbox]),#aStu select{width:100%;box-sizing:border-box}</style>' +
      '<div id="aStu" hidden><section class="card"><div class="seg" id="stSeg"><button type="button" class="on" data-stm="new">🆕 طالب جديد</button><button type="button" data-stm="add">➕ إضافة إلى معلم</button><button type="button" data-stm="move">🔁 نقل إلى معلم آخر</button></div></section>' +
      '<div id="stLoading" class="loading">جارٍ تحميل الطلاب والأسر…</div>' +
      // طالب جديد
      '<section class="card" id="stNew" hidden><h2>تسجيل طالب جديد</h2>' +
      '<div class="row2"><div class="field"><label for="snName">اسم الطالب</label><input id="snName" placeholder="مثال: يوسف أحمد"></div>' +
      '<div class="field"><label for="snAge">العمر (اختياري)</label><input id="snAge" placeholder="مثال: 9 سنوات"></div></div>' +
      '<div class="field"><label>الأسرة</label><div class="seg" id="snFamSeg"><button type="button" class="on" data-fk="old">أسرة موجودة</button><button type="button" data-fk="new">أسرة جديدة</button></div></div>' +
      '<div id="snFamOld"><input id="snFamQ" type="search" autocomplete="off" placeholder="ابحث باسم ولي الأمر أو المعرّف أو اسم طالب" style="width:100%;margin-top:8px"><div id="snFamRes"></div><div class="note" id="snFamPicked" hidden></div></div>' +
      '<div id="snFamNew" hidden><input id="snParent" placeholder="اسم ولي الأمر كما سيُكتب في الشيت" style="width:100%;margin-top:8px"><div class="note">يُولَّد المعرّف (س.) تلقائيًا، ويُضاف «أ. » قبل الاسم.</div></div>' +
      '<div class="row2"><div class="field"><label for="snPkg">الباقة الشهرية</label><input id="snPkg" inputmode="decimal" placeholder="عدد المجالس، مثال: 8"></div>' +
      '<div class="field"><label for="snPrice">سعر المجلس</label><input id="snPrice" inputmode="decimal" placeholder="0 = تطوّع"></div></div>' +
      '<div class="row2"><div class="field"><label for="snStart">تاريخ أول مجلس</label><input id="snStart" type="date"></div>' +
      '<div class="field"><label for="snPDays">أيام الدرس</label><input id="snPDays" placeholder="مثال: الأحد والأربعاء"></div></div>' +
      '<div class="field"><label for="snFee">رسوم التقييم المدفوعة (اختياري)</label><input id="snFee" inputmode="decimal" placeholder="مثال: 50"></div>' +
      '<div class="note" id="snPrev">اكتب الباقة وتاريخ أول مجلس وأيام الدرس، فيُحسب عدد مجالس هذا الشهر وفاتورته. اترك التاريخ فارغًا لتسجيل الباقة كاملة.</div>' +
      '<h2 style="margin-top:16px">إضافته إلى معلم (اختياري)</h2><div class="note">اترك المعلم فارغًا لتسجيله في «الأسر والطلاب» فقط، ثم أضِفه لاحقًا من «إضافة إلى معلم».</div>' + unit("sn") +
      '<div class="confirm" id="snConfirm" hidden></div><div class="actions"><button type="button" class="primary" id="snSave">تسجيل الطالب</button></div></section>' +
      '<section class="card" id="stDone" hidden><h2>✓ تم التسجيل</h2><div id="stDoneTxt"></div>' +
      '<div class="actions min-row" style="flex-wrap:wrap"><button type="button" class="primary small" id="stDoneAdd" hidden>➕ إضافته إلى معلم الآن</button><button type="button" class="ghost small" id="stDoneAgain">تسجيل طالب آخر</button></div></section>' +
      // إضافة أو نقل
      '<section class="card" id="stUnit" hidden><h2 id="stUnitHead">إضافة طالب إلى معلم</h2>' +
      '<div class="field"><label for="suQ">الطالب (بالاسم أو الكود أو ولي الأمر)</label><input id="suQ" type="search" autocomplete="off" placeholder="مثال: ط.0203 أو زين" style="width:100%"></div>' +
      '<div id="suRes"></div><div class="note" id="suPicked" hidden></div>' +
      '<div class="field" id="suFromWrap" hidden><label for="suFrom">من معلم</label><select id="suFrom" class="date-sel" style="width:100%"></select></div>' + unit("su") +
      '<div class="confirm" id="suConfirm" hidden></div><div class="actions"><button type="button" class="primary" id="suSave">إضافة</button></div>' +
      '<div class="note" id="suFoot"></div></section></div>');

    $("stSeg").addEventListener("click", function (e) { var b = e.target.closest("[data-stm]"); if (b && !stBusy) stMode(b.getAttribute("data-stm")); });
    $("snFamSeg").addEventListener("click", function (e) {
      var b = e.target.closest("[data-fk]"); if (!b) return;
      $("snFamSeg").querySelectorAll("button").forEach(function (x) { x.classList.toggle("on", x === b); });
      $("snFamOld").hidden = b.getAttribute("data-fk") !== "old"; $("snFamNew").hidden = b.getAttribute("data-fk") !== "new";
      stDisarm();
    });
    $("snFamQ").addEventListener("input", function () {
      var q = norm($("snFamQ").value), box = $("snFamRes");
      if (!q || !STU) { box.innerHTML = ""; return; }
      var w = q.split(" ");
      var hits = STU.families.filter(function (f) { return w.every(function (x) { return f._k.indexOf(x) !== -1; }); }).slice(0, 8);
      box.innerHTML = hits.length ? hits.map(function (f) {
        return '<div class="inv-family-row" data-sf="' + esc(f.id) + '"><span class="inv-fname"><b>' + esc(f.name) + "</b><br><small>" + esc(f.id) + (f.kids ? " — " + esc(f.kids) : "") + "</small></span></div>";
      }).join("") : '<div class="note">لا توجد أسرة بهذا الاسم. اختر «أسرة جديدة».</div>';
    });
    $("snFamRes").addEventListener("click", function (e) {
      var r = e.target.closest("[data-sf]"); if (!r) return;
      stFam = STU.families.filter(function (f) { return f.id === r.getAttribute("data-sf"); })[0];
      $("snFamRes").innerHTML = ""; $("snFamQ").value = "";
      $("snFamPicked").innerHTML = "✓ <b>" + esc(stFam.name) + "</b> — " + esc(stFam.id) + (stFam.kids ? "<br>" + esc(stFam.kids) : "");
      $("snFamPicked").hidden = false;
      if ($("snPrice").value === "" && stFam.price !== "" && stFam.price !== undefined && stFam.price !== null) $("snPrice").value = stFam.price;
      stDisarm(); stPreview();
    });
    ["snPkg", "snPrice", "snStart", "snPDays"].forEach(function (k) { $(k).addEventListener("input", stPreview); $(k).addEventListener("change", stPreview); });
    ["sn", "su"].forEach(function (p) {
      $(p + "Teacher").addEventListener("change", function () { stLoadInfo(p); stDisarm(); });
      $(p + "Mode").addEventListener("change", function () {
        var m = $(p + "Mode").value;
        if (m === "single") { $(p + "Rate").value = 70; $(p + "Cat").placeholder = "مجلس فردي"; }
        if (m === "newgroup" || m === "pair") { $(p + "Rate").value = 130; $(p + "Cat").placeholder = "مجموعة"; }
        stModeUI(p); stDisarm();
      });
    });
    $("aStu").addEventListener("input", function (e) { if (e.target.id !== "suQ" && e.target.id !== "snFamQ") stDisarm(); });
    $("snSave").addEventListener("click", stRegister);
    $("stDoneAgain").addEventListener("click", function () {
      ["snName", "snAge", "snParent", "snPkg", "snPrice", "snPDays", "snFee", "snCat", "snDays"].forEach(function (k) { $(k).value = ""; });
      $("snStart").value = (AD && AD.today) || ""; $("snTeacher").value = ""; $("snMode").value = "single"; $("snRate").value = 70;
      stFam = null; $("snFamPicked").hidden = true; stInfo = null; stModeUI("sn");
      $("stDone").hidden = true; $("stNew").hidden = false; $("snPrev").textContent = "اكتب الباقة وتاريخ أول مجلس وأيام الدرس، فيُحسب عدد مجالس هذا الشهر وفاتورته. اترك التاريخ فارغًا لتسجيل الباقة كاملة.";
      $("snName").focus();
    });
    $("stDoneAdd").addEventListener("click", function () { var c = $("stDoneAdd").getAttribute("data-code"); stMode("add"); suPick(c); });
    $("suQ").addEventListener("input", function () {
      var q = norm($("suQ").value), box = $("suRes");
      if (!q || !STU) { box.innerHTML = ""; return; }
      var w = q.split(" ");
      var hits = STU.students.filter(function (s) { return w.every(function (x) { return s._k.indexOf(x) !== -1; }); }).slice(0, 8);
      box.innerHTML = hits.length ? hits.map(function (s) {
        return '<div class="inv-family-row" data-sc="' + esc(s.code) + '"><span class="inv-fname"><b>' + esc(s.name) + "</b>" + (s.active === false ? " <small>(متوقف)</small>" : "") +
          "<br><small>" + esc(s.code) + " — " + esc(s.parent) + (s.teachers ? " — لدى: " + esc(s.teachers) : "") + "</small></span></div>";
      }).join("") : '<div class="note">لا توجد نتائج. إن كان طالبًا جديدًا فسجّله أولًا من «طالب جديد».</div>';
    });
    $("suRes").addEventListener("click", function (e) { var r = e.target.closest("[data-sc]"); if (r) suPick(r.getAttribute("data-sc")); });
    $("suFrom").addEventListener("change", stDisarm);
    $("suSave").addEventListener("click", suSave);
  })();
  function loadStu(force, cb, onErr) {
    if (STU && !force) { if (cb) cb(); else stShow(); return; }
    $("stLoading").hidden = false; $("stLoading").textContent = "جارٍ تحميل الطلاب والأسر…";
    api("stuData", {}).then(function (d) {
      STU = d;
      var kids = {};
      d.students.forEach(function (s) { s._k = norm(s.code + " " + s.name + " " + s.parent); (kids[s.fid] = kids[s.fid] || []).push(s.name); });
      d.families.forEach(function (f) { f.kids = (kids[f.id] || []).join("، "); f._k = norm(f.id + " " + f.name + " " + f.kids); });
      ["snTeacher", "suTeacher", "suFrom"].forEach(function (k) { var v = $(k).value; $(k).innerHTML = stOpts(v); });
      if (!$("snStart").value) $("snStart").value = (AD && AD.today) || "";
      $("stLoading").hidden = true;
      if (cb) cb(); else stShow();
    }).catch(function (e) { $("stLoading").textContent = "⚠ " + e.message; if (onErr) onErr(e.message); });
  }
  var stCur = "new";
  function stShow() {
    $("stNew").hidden = stCur !== "new" || !$("stDone").hidden;
    if (stCur !== "new") $("stDone").hidden = true;
    $("stUnit").hidden = stCur === "new";
  }
  function stMode(m) {
    stCur = m; clearMsg();
    $("stSeg").querySelectorAll("button").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-stm") === m); });
    if (m !== "new") {
      var mv = m === "move";
      $("stUnitHead").textContent = mv ? "نقل طالب إلى معلم آخر" : "إضافة طالب إلى معلم";
      $("suFromWrap").hidden = !mv; $("suTeacherLbl").textContent = mv ? "إلى معلم" : "المعلم";
      $("suFoot").textContent = mv
        ? "يُضاف إلى المعلم الجديد فورًا، ويبقى في تبويب الشهر الحالي لدى المعلم السابق حفاظًا على المجالس المسجَّلة، ثم يُحذف من تبويب الشهر القادم."
        : "يُضاف إلى تبويب الشهر الحالي، وإلى تبويب الشهر القادم إن كان قد أُنشئ.";
      suPreFrom();
    }
    stDisarm();
    if (STU) stShow();
  }
  function stModeUI(p) {
    var m = $(p + "Mode").value, tg = $(p + "Target");
    tg.hidden = !(m === "join" || m === "pair");
    $(p + "NewUnit").hidden = m === "join";
    $(p + "DaysWrap").hidden = m === "pair";
    if (!tg.hidden) {
      var info = p === "sn" ? stInfo : (stPick ? stPick._info : null);
      var items = !info ? [] : m === "join" ? info.groups.map(function (g) { return [g.start, g.label]; }) : info.singles.map(function (x) { return [x.code, x.label]; });
      tg.innerHTML = info ? (items.length ? items.map(function (i) { return '<option value="' + esc(i[0]) + '">' + esc(i[1]) + "</option>"; }).join("") : "<option value=''>لا يوجد</option>") : "<option value=''>اختر المعلم أولًا</option>";
    }
  }
  function stLoadInfo(p) {
    var t = $(p + "Teacher").value, code = p === "su" && stPick ? stPick.code : "";
    $(p + "Has").hidden = true;
    if (p === "sn") stInfo = null; else if (stPick) stPick._info = null;
    stModeUI(p);
    if (!t) return;
    $(p + "Target").innerHTML = "<option value=''>جارٍ التحميل…</option>";
    api("stuTeacherInfo", { teacher: t, code: code }).then(function (r) {
      if ($(p + "Teacher").value !== t) return;
      if (p === "sn") stInfo = r; else if (stPick) stPick._info = r;
      $(p + "Has").hidden = !(p === "su" && r.hasStudent);
      stModeUI(p);
    }).catch(function (e) { $(p + "Target").innerHTML = ""; showMsg("⚠ " + e.message, false); });
  }
  function stDisarm() {
    stArmed = "";
    $("snConfirm").hidden = true; $("suConfirm").hidden = true;
    if (!stBusy) {
      $("snSave").textContent = "تسجيل الطالب"; $("snSave").classList.remove("confirming");
      $("suSave").textContent = stCur === "move" ? "نقل" : "إضافة"; $("suSave").classList.remove("confirming");
    }
  }
  function stArm(btn, box, key, text) {
    if (stArmed === key) return true;
    stArmed = key; $(box).textContent = text + " اضغط مرة أخرى للتأكيد."; $(box).hidden = false;
    $(btn).textContent = "تأكيد"; $(btn).classList.add("confirming");
    return false;
  }
  function stPreview() {
    clearTimeout(stPrevT);
    stPrevT = setTimeout(function () {
      var pkg = digits($("snPkg").value), start = $("snStart").value, days = $("snPDays").value.trim(), box = $("snPrev");
      if (pkg === "" || isNaN(Number(pkg))) { box.textContent = "اكتب الباقة الشهرية أولًا."; return; }
      if (!start || !days) { box.textContent = "دون تاريخ بدء وأيام درس تُسجَّل الباقة كاملة (" + pkg + ")."; return; }
      box.textContent = "جارٍ الحساب…";
      api("evalPreview", { package: pkg, price: digits($("snPrice").value), startDate: start, firstDays: days })
        .then(function (r) { box.textContent = r.message || ""; }).catch(function (e) { box.textContent = "⚠ " + e.message; });
    }, 500);
  }
  function stUnitData(p) {
    var m = $(p + "Mode").value, d = { teacher: $(p + "Teacher").value, mode: m, category: $(p + "Cat").value.trim(), rate: digits($(p + "Rate").value), days: $(p + "Days").value.trim() };
    if (m === "join") d.groupStart = $(p + "Target").value;
    if (m === "pair") d.pairCode = $(p + "Target").value;
    return d;
  }
  function stUnitCheck(p, d) {
    if (!d.teacher) return "اختر المعلم.";
    if (d.mode === "join" && !d.groupStart) return "اختر المجموعة.";
    if (d.mode === "pair" && !d.pairCode) return "اختر الطالب الفردي.";
    if (d.mode !== "join" && (d.rate === "" || isNaN(Number(d.rate)))) return "اكتب أجر الساعة للمعلم (0 إن كان تطوّعًا).";
    return "";
  }
  function stUnitTxt(p, d) {
    return d.mode === "join" ? "ينضم إلى " + $(p + "Target").options[$(p + "Target").selectedIndex].text
      : d.mode === "pair" ? "مع " + $(p + "Target").options[$(p + "Target").selectedIndex].text + " ليصيرا مجموعة"
      : (d.mode === "newgroup" ? "مجموعة جديدة" : "مجلس فردي") + " بأجر " + d.rate + " للساعة";
  }
  function stRegister() {
    if (stBusy || !STU) return;
    clearMsg();
    var isNew = !$("snFamNew").hidden, name = $("snName").value.trim();
    var parent = isNew ? $("snParent").value.trim() : (stFam ? stFam.name : "");
    var pkg = digits($("snPkg").value), price = digits($("snPrice").value), start = $("snStart").value, pdays = $("snPDays").value.trim(), fee = digits($("snFee").value);
    if (!name) return showMsg("⚠ اكتب اسم الطالب.", false);
    if (!parent) return showMsg(isNew ? "⚠ اكتب اسم ولي الأمر." : "⚠ اختر الأسرة من القائمة، أو اختر «أسرة جديدة».", false);
    if (price === "" || isNaN(Number(price))) return showMsg("⚠ اكتب سعر المجلس (0 إن كان تطوّعًا).", false);
    if (pkg !== "" && isNaN(Number(pkg))) return showMsg("⚠ يجب أن تكون الباقة رقمًا.", false);
    if (pkg !== "" && start && !pdays) return showMsg("⚠ اكتب أيام الدرس لحساب مجالس هذا الشهر، أو أفرغ تاريخ أول مجلس لتسجيل الباقة كاملة.", false);
    if (fee !== "" && (isNaN(Number(fee)) || Number(fee) < 0)) return showMsg("⚠ يجب أن تكون رسوم التقييم رقمًا.", false);
    var u = stUnitData("sn");
    if (u.teacher) { var bad = stUnitCheck("sn", u); if (bad) return showMsg("⚠ " + bad, false); }
    var key = [name, $("snAge").value.trim(), parent, isNew, pkg, price, start, pdays, fee, JSON.stringify(u)].join("|");
    if (!stArm("snSave", "snConfirm", key, "سيُسجَّل " + name + " لدى " + (isNew ? "أسرة جديدة: " : "") + parent + "، الباقة الشهرية " + (pkg || "—") + "، سعر المجلس " +
      (Number(price) === 0 ? "0 (تطوّع)" : price) + (fee ? "، ورسوم التقييم المدفوعة " + fee + " تُضاف رصيدًا للأسرة" : "") +
      (u.teacher ? "، ثم يُضاف إلى " + u.teacher + " (" + stUnitTxt("sn", u) + ")." : "، دون إضافته إلى معلم."))) return;
    if (stRegKey !== key) { stRegKey = key; stRegTok = stTok(); }
    var p = { name: name, age: $("snAge").value.trim(), parent: parent, newFamily: isNew, package: pkg, price: price, startDate: start, firstDays: pdays, evalFee: fee, regToken: stRegTok };
    Object.keys(u).forEach(function (k) { p[k] = u[k]; });
    stSend("stuRegister", p, "snSave", 1, function (r) {
      stRegKey = "";
      var g = r.reg, fm = g.firstMonth;
      if (!STU.students.some(function (s) { return s.code === g.code; })) {
        var s = { code: g.code, name: g.name, parent: g.parent, fid: g.familyId, price: g.price, teachers: r.message ? u.teacher : "", active: true };
        s._k = norm(s.code + " " + s.name + " " + s.parent); STU.students.push(s);
      }
      if (!STU.families.some(function (f) { return f.id === g.familyId; })) {
        var f = { id: g.familyId, name: g.parent, price: g.price, kids: g.name }; f._k = norm(f.id + " " + f.name + " " + f.kids); STU.families.push(f);
      }
      var h = "";
      if (g.existed) h += '<div class="confirm">هذا الطالب مسجَّل من قبل، فلم يُكرَّر.' + (g.filled && g.filled.length ? "<br>✓ أُكملت بياناته الناقصة: " + esc(g.filled.join("، ")) : "") +
        (g.diffs && g.diffs.length ? "<br>⚠ تختلف عمّا كتبته ولم تُغيَّر: " + esc(g.diffs.join("، ")) + "، فعدّلها من الشيت إن لزم." : "") + "</div>";
      h += "<b>" + esc(g.name) + "</b><br>كود الطالب: <b>" + esc(g.code) + "</b><br>ولي الأمر: " + esc(g.parent) + " — <b>" + esc(g.familyId) + "</b>" +
        (fm && fm.applies ? "<br>مجالس هذا الشهر: <b>" + esc(fm.sessions) + "</b> من " + esc(fm.monthly) + " (فاتورته " + esc(fm.total) + ")" + (fm.sessions < fm.monthly ? "، وتعود الباقة الشهرية كاملة بعد قفل الشهر." : "") : "") +
        (g.evalFee ? "<br>رسوم التقييم: <b>" + esc(g.evalFee) + "</b> أُضيفت رصيدًا للأسرة." : "") + (g.evalFeeError ? "<br>⚠ " + esc(g.evalFeeError) : "");
      if (r.message) h += '<div class="note" style="white-space:pre-line">' + esc(r.message) + "</div>";
      if (r.addError) h += '<div class="confirm">⚠ سُجّل الطالب لكن لم يُضَف إلى ' + esc(u.teacher) + ": " + esc(r.addError) + "<br>اضغط «إضافته إلى معلم الآن» للمحاولة مرة أخرى.</div>";
      $("stDoneTxt").innerHTML = h;
      $("stDoneAdd").hidden = !!r.message; $("stDoneAdd").setAttribute("data-code", g.code);
      $("stNew").hidden = true; $("stDone").hidden = false;
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }
  function suPick(code) {
    stPick = STU.students.filter(function (s) { return s.code === code; })[0];
    if (!stPick) return;
    $("suRes").innerHTML = ""; $("suQ").value = "";
    $("suPicked").innerHTML = "✓ <b>" + esc(stPick.name) + "</b> — " + esc(stPick.code) + "<br>ولي الأمر: " + esc(stPick.parent) + (stPick.teachers ? " — المعلمون الحاليون: " + esc(stPick.teachers) : "");
    $("suPicked").hidden = false;
    suPreFrom(); stLoadInfo("su"); stDisarm();
  }
  function suPreFrom() {
    if (!stPick || stCur !== "move" || !STU) return;
    var cur = STU.teachers.filter(function (t) { return String(stPick.teachers).indexOf(t) !== -1; });
    if (cur.length === 1) $("suFrom").value = cur[0];
  }
  function suSave() {
    if (stBusy || !STU) return;
    clearMsg();
    if (!stPick) return showMsg("⚠ اختر الطالب أولًا.", false);
    var mv = stCur === "move", d = stUnitData("su"), bad = stUnitCheck("su", d);
    if (bad) return showMsg("⚠ " + bad, false);
    d.code = stPick.code;
    if (mv) {
      d.fromTeacher = $("suFrom").value;
      if (!d.fromTeacher) return showMsg("⚠ اختر المعلم المنقول منه.", false);
      if (d.fromTeacher === d.teacher) return showMsg("⚠ المعلم السابق والجديد هو المعلم نفسه.", false);
    }
    var key = JSON.stringify(d) + mv;
    if (!stArm("suSave", "suConfirm", key, (mv ? "سيُنقل " + stPick.name + " من " + d.fromTeacher + " إلى " + d.teacher : "سيُضاف " + stPick.name + " إلى " + d.teacher) + " (" + stUnitTxt("su", d) + ").")) return;
    var st = stPick;
    stSend(mv ? "stuMove" : "stuAdd", d, "suSave", 1, function (r) {
      var names = st.teachers ? String(st.teachers).split("، ") : [];
      if (names.indexOf(d.teacher) === -1) names.push(d.teacher);
      st.teachers = names.join("، ");
      showMsg(r.message, true);
      if (stPick === st) suPick(st.code);
    });
  }
  function stSend(action, p, btn, attempt, done) {
    stBusy = true; $(btn).disabled = true; $(btn).classList.remove("confirming");
    $(btn).textContent = attempt > 1 ? "الشيت مشغول… جارٍ إعادة المحاولة (" + attempt + ")" : "جارٍ التنفيذ… قد يستغرق ذلك دقيقة";
    api(action, p).then(function (r) {
      stBusy = false; $(btn).disabled = false; stDisarm(); done(r);
    }).catch(function (e) {
      var m = String(e.message || e);
      if (m.indexOf("BUSY:") === 0 && attempt < 4) { setTimeout(function () { stSend(action, p, btn, attempt + 1, done); }, 6000); return; }
      stBusy = false; $(btn).disabled = false; stDisarm();
      showMsg("⚠ " + (m.indexOf("BUSY:") === 0 ? m.slice(5).trim() : m), false);
    });
  }

  /* ---------- الحالة: إيقاف الطالب أو الأسرة وإعادة التفعيل، وحالة المعلمين، والفحص (منقولة من صفحة الإدارة) ---------- */
  var MONTHS_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
  var zCur = "student", zBusy = false, zArmed = "", zTok = "", zTokKey = "", zSt = null, zFam = null, zFSel = null, zFFam = null, zJustResumed = "", TCH = null, zCSt = null;
  var Z_PILL = { active: "✅ نشط", pending: "⏳ إيقاف معلّق", stopped: "⏸️ متوقف" };
  var T_PILL = { active: "✅ نشط", leave: "🏖️ في إجازة", stopping: "⏳ يتوقف بنهاية الشهر", stopped: "⏸️ متوقف" };
  var KIND_COLOR = { "حضر": "#ffffff", "تعويض": "#69db7b", "غياب دون تنبيه": "#ff6b6b", "تأجيل من المعلم": "#ffa94d", "تأجيل من الطالب": "#74c0fc", "انتهت مجالس الشهر": "#b096fb", "خانة غير مفهومة": "#eeeeee" };
  function nextLbl(l) {
    var p = String(l || "").trim().split(/\s+/), i = MONTHS_AR.indexOf(p[0]), y = Number(p[1]);
    if (i < 0 || !y) return "الشهر القادم";
    i++; if (i > 11) { i = 0; y++; }
    return MONTHS_AR[i] + " " + y;
  }
  function hs(n) {
    if (n === "" || n === null || n === undefined) return "—";
    n = Number(n);
    if (n === 1) return "مجلس واحد";
    if (n === 2) return "مجلسان";
    if (n >= 3 && n <= 10 && n === Math.floor(n)) return n + " مجالس";
    return n + " مجلسًا";
  }
  function zState(s) { return s.active === false ? "stopped" : (s.pending ? "pending" : "active"); }
  function zLn(k, v, cls) { return '<div class="ln' + (cls ? " " + cls : "") + '"><span>' + k + "</span><b>" + v + "</b></div>"; }
  function zBal(n, cu) { return n > 0 ? "عليها " + pmoney(n, cu) : (n < 0 ? "لها " + pmoney(-n, cu) : "مسدَّد بالكامل"); }
  function zCls(n) { return n > 0 ? "pos" : (n < 0 ? "neg" : ""); }
  function zStuHits(q, mark) {
    if (!q || !STU) return "";
    var w = norm(q).split(" ");
    var hits = STU.students.filter(function (s) { return w.every(function (x) { return s._k.indexOf(x) !== -1; }); }).slice(0, 8);
    return hits.length ? hits.map(function (s) {
      return '<div class="inv-family-row" data-zc="' + esc(s.code) + '"><span class="inv-fname"><b>' + esc(s.name) + "</b>" + (mark && zState(s) !== "active" ? " <small>(" + Z_PILL[zState(s)].replace(/^\S+\s/, "") + ")</small>" : "") +
        "<br><small>" + esc(s.code) + " — " + esc(s.parent) + (s.teachers ? " — لدى: " + esc(s.teachers) : "") + "</small></span></div>";
    }).join("") : '<div class="note">لا توجد نتائج.</div>';
  }
  (function buildStatusTab() {
    var tabs = document.querySelector(".admin-tabs"), after = tabs && tabs.querySelector('[data-atab="students"]');
    if (!tabs || !after) return;
    after.insertAdjacentHTML("afterend", '<button type="button" class="tab" data-atab="status">الحالة والفحص</button>');
    var when = function (p, nextTxt, nowTxt) {
      return '<div class="field"><label>يسري الإيقاف</label><div class="seg" id="' + p + 'When"><button type="button" class="on" data-w="next">' + nextTxt + '</button><button type="button" data-w="now">' + nowTxt + "</button></div>" +
        '<div class="note" id="' + p + 'WhenNote"></div></div>';
    };
    $("adminView").insertAdjacentHTML("beforeend",
      '<style>#aZ input:not([type=checkbox]),#aZ select{width:100%;box-sizing:border-box}#aZ .row2{grid-template-columns:repeat(2,minmax(0,1fr))}' +
      '#aZ .money{border:1px solid var(--line);border-radius:10px;padding:8px 10px;margin-top:8px;font-size:13.5px}#aZ .ln{display:flex;justify-content:space-between;gap:8px;padding:2px 0}' +
      '#aZ .ln b{font-variant-numeric:tabular-nums;white-space:nowrap}#aZ .res{border-top:1px dashed var(--line);margin-top:4px;padding-top:6px;font-weight:600}#aZ .pos{color:var(--danger)}#aZ .neg{color:var(--ok)}' +
      '#aZ .picked{background:var(--beige);border-radius:10px;padding:8px 10px;margin-top:8px;font-size:14px}#aZ .picked small{color:var(--muted)}' +
      '#aZ .verdict{font-weight:700;padding:6px 8px;border-radius:8px;margin-bottom:6px}#aZ .verdict.green{background:#e6f6ea;color:#1e6b34}#aZ .verdict.yellow{background:#fff4d6;color:#7a5a00}#aZ .verdict.red{background:#fde7e7;color:#a12a2a}' +
      '#aZ .evt{display:grid;grid-template-columns:82px 1fr auto;gap:6px;font-size:12.5px;padding:3px 0;border-top:1px dashed var(--line)}#aZ .evt .dt{display:inline-block;width:10px;height:10px;border-radius:3px;border:1px solid #ccc;margin-inline-end:4px;vertical-align:middle}' +
      '#aZ .chk-h{font-weight:700;font-size:13px;margin:8px 0 2px}#aZ .frow{display:grid;grid-template-columns:auto minmax(0,1fr) 70px 80px;gap:6px;align-items:center;padding:6px 0;border-top:1px dashed var(--line);font-size:14px}' +
      '#aZ .frow input[type=checkbox]{width:16px;height:16px}#aZ .seg button{min-width:0}</style>' +
      '<div id="aZ" hidden><section class="card"><div class="seg" id="zSeg"><button type="button" class="on" data-zm="student">طالب</button><button type="button" data-zm="family">أسرة كاملة</button>' +
      '<button type="button" data-zm="teacher">معلم</button><button type="button" data-zm="check">🔎 فحص</button></div></section>' +
      '<div id="zLoading" class="loading">جارٍ تحميل الطلاب والأسر…</div>' +
      // طالب
      '<section class="card" id="zStu" hidden><h2>إيقاف طالب أو إعادة تفعيله</h2>' +
      '<div class="field"><label for="zQ">الطالب (بالاسم أو الكود أو ولي الأمر)</label><input id="zQ" type="search" autocomplete="off" placeholder="مثال: ط.0203 أو زين"></div>' +
      '<div id="zRes"></div><div class="picked" id="zPicked" hidden></div><div class="money" id="zMoney" hidden></div>' +
      '<div id="zStopBox" hidden>' + when("zs", "من الشهر القادم", "من الآن") +
      '<div class="field"><label for="zReason">السبب (اختياري)</label><input id="zReason" placeholder="مثال: سفر، أو انتهاء الاشتراك"></div>' +
      '<div class="confirm" id="zStopConfirm" hidden></div><div class="actions"><button type="button" class="primary" id="zStopBtn">إيقاف الطالب</button></div>' +
      '<div class="note">يبقى عموده في تبويب الشهر الحالي لدى معلميه حفاظًا على المجالس المسجَّلة، ويُحذف من تبويب الشهر القادم، وتصير باقته صفرًا مع قفل الشهر.</div></div>' +
      '<div id="zPendBox" hidden><div class="confirm" id="zPendTxt"></div><div class="actions"><button type="button" class="primary" id="zCancelBtn">إلغاء الإيقاف</button></div></div>' +
      '<div id="zResumeBox" hidden><div class="row2"><div class="field"><label for="zPkg">الباقة (عدد المجالس)</label><input id="zPkg" inputmode="decimal" placeholder="مثال: 8"></div>' +
      '<div class="field"><label for="zPrice">سعر المجلس</label><input id="zPrice" inputmode="decimal" placeholder="0 = تطوّع"></div></div>' +
      '<div class="confirm" id="zResConfirm" hidden></div><div class="actions"><button type="button" class="primary" id="zResumeBtn">إعادة التفعيل</button></div>' +
      '<div class="note">تُضاف قيمة الباقة إلى فاتورة الأسرة لهذا الشهر. بعد التفعيل أضِفه إلى معلمه.</div></div>' +
      '<div class="actions"><button type="button" class="ghost small" id="zToTeacher" hidden>➕ إضافته إلى معلم الآن</button></div></section>' +
      // أسرة
      '<section class="card" id="zFamCard" hidden><h2>إيقاف أسرة كاملة أو إعادة تفعيلها</h2>' +
      '<div class="field"><label for="zfQ">الأسرة (باسم ولي الأمر أو المعرّف أو اسم طالب)</label><input id="zfQ" type="search" autocomplete="off" placeholder="مثال: أماني أو س.0001"></div>' +
      '<div id="zfRes"></div><div class="picked" id="zfPicked" hidden></div><div class="money" id="zfMoney" hidden></div>' +
      '<div id="zfStopBox" hidden>' + when("zf", "من الشهر القادم", "من الآن") +
      '<div class="field"><label for="zfReason">السبب (اختياري)</label><input id="zfReason" placeholder="مثال: إجازة الأسرة، أو انتهاء الاشتراك"></div>' +
      '<div class="confirm" id="zfStopConfirm" hidden></div><div class="actions"><button type="button" class="primary" id="zfStopBtn">إيقاف الطلاب النشطين</button></div></div>' +
      '<div id="zfPendBox" hidden><div class="actions"><button type="button" class="ghost" id="zfCancelBtn">↩️ إلغاء الإيقاف المعلّق</button></div></div>' +
      '<div id="zfResumeBox" hidden><div class="chk-h">إعادة تفعيل الطلاب المتوقفين</div><div id="zfResList"></div>' +
      '<div class="confirm" id="zfResConfirm" hidden></div><div class="actions"><button type="button" class="primary" id="zfResumeBtn">إعادة تفعيل المحدَّدين</button></div>' +
      '<div class="note">تُضاف قيمة الباقات إلى فاتورة الأسرة لهذا الشهر. بعد التفعيل أضِف كل طالب إلى معلمه من «تسجيل ونقل».</div></div></section>' +
      // معلم
      '<section class="card" id="zTch" hidden><h2>حالة المعلم</h2><div id="ztLoading" class="loading">جارٍ تحميل المعلمين…</div>' +
      '<div class="field"><label for="ztSel">المعلم</label><select id="ztSel" class="date-sel"></select></div><div class="picked" id="ztInfo" hidden></div>' +
      '<div class="field" id="ztNoteWrap" hidden><label for="ztNote">ملاحظة (اختياري)</label><input id="ztNote" placeholder="مثال: إجازة حتى 15 نوفمبر"></div>' +
      '<div class="confirm" id="ztConfirm" hidden></div><div class="actions min-row" id="ztActions" style="flex-wrap:wrap"></div><div class="note" id="ztFoot"></div></section>' +
      // فحص
      '<section class="card" id="zChk" hidden><h2>فحص الحالة الفعلية لطالب</h2>' +
      '<div class="field"><label for="zcQ">الطالب (بالاسم أو الكود أو ولي الأمر)</label><input id="zcQ" type="search" autocomplete="off" placeholder="مثال: ط.0203 أو زين"></div>' +
      '<div id="zcRes"></div><div class="picked" id="zcPicked" hidden></div>' +
      '<div class="actions"><button type="button" class="ghost small" id="zcBtn" hidden>🔎 فحص حالته في شيتات المعلمين</button></div><div class="money" id="zcOut" hidden></div>' +
      '<div class="note">يقرأ شيتات المعلمين في الشهر الحالي والسابق، ولا يغيّر شيئًا. لإيقاف الطالب أو إعادة تفعيله استخدم «طالب».</div></section></div>');

    $("zSeg").addEventListener("click", function (e) { var b = e.target.closest("[data-zm]"); if (b && !zBusy) zMode(b.getAttribute("data-zm")); });
    ["zs", "zf"].forEach(function (p) {
      $(p + "When").addEventListener("click", function (e) {
        var b = e.target.closest("[data-w]"); if (!b) return;
        $(p + "When").querySelectorAll("button").forEach(function (x) { x.classList.toggle("on", x === b); });
        zDisarm(); if (p === "zs") zMoneyStu(); else zfMoney();
      });
    });
    $("aZ").addEventListener("input", function (e) { if (!/^(zQ|zfQ|zcQ)$/.test(e.target.id)) zDisarm(); });
    $("zQ").addEventListener("input", function () { $("zRes").innerHTML = zStuHits($("zQ").value, true); });
    $("zRes").addEventListener("click", function (e) { var r = e.target.closest("[data-zc]"); if (r) zPick(r.getAttribute("data-zc")); });
    $("zStopBtn").addEventListener("click", zStop);
    $("zCancelBtn").addEventListener("click", zCancel);
    $("zResumeBtn").addEventListener("click", zResume);
    $("zToTeacher").addEventListener("click", function () {
      if (!zSt) return;
      var c = zSt.code;
      document.querySelector('[data-atab="students"]').click(); stMode("add");
      var go = function () { if (STU) suPick(c); };
      if (STU) go(); else setTimeout(go, 1500);
    });
    $("zfQ").addEventListener("input", function () {
      var q = norm($("zfQ").value), box = $("zfRes");
      if (!q || !STU) { box.innerHTML = ""; return; }
      var w = q.split(" ");
      var hits = STU.families.filter(function (f) { return w.every(function (x) { return f._k.indexOf(x) !== -1; }); }).slice(0, 8);
      box.innerHTML = hits.length ? hits.map(function (f) {
        return '<div class="inv-family-row" data-zf="' + esc(f.id) + '"><span class="inv-fname"><b>' + esc(f.name) + "</b><br><small>" + esc(f.id) + (f.kids ? " — " + esc(f.kids) : "") + "</small></span></div>";
      }).join("") : '<div class="note">لا توجد نتائج.</div>';
    });
    $("zfRes").addEventListener("click", function (e) {
      var r = e.target.closest("[data-zf]"); if (!r) return;
      zFSel = STU.families.filter(function (f) { return f.id === r.getAttribute("data-zf"); })[0];
      $("zfRes").innerHTML = ""; $("zfQ").value = ""; $("zfReason").value = ""; zSetWhen("zf", "next");
      zFFam = null; zfRender(true); zfLoadMoney();
    });
    $("zfStopBtn").addEventListener("click", zfStop);
    $("zfCancelBtn").addEventListener("click", zfCancel);
    $("zfResumeBtn").addEventListener("click", zfResume);
    $("ztSel").addEventListener("change", function () { clearMsg(); $("ztNote").value = ""; ztRender(); });
    $("ztActions").addEventListener("click", ztAct);
    $("zcQ").addEventListener("input", function () { $("zcRes").innerHTML = zStuHits($("zcQ").value, false); });
    $("zcRes").addEventListener("click", function (e) {
      var r = e.target.closest("[data-zc]"); if (!r) return;
      zCSt = STU.students.filter(function (s) { return s.code === r.getAttribute("data-zc"); })[0];
      if (!zCSt) return;
      $("zcRes").innerHTML = ""; $("zcQ").value = "";
      $("zcPicked").innerHTML = "<b>" + esc(zCSt.name) + "</b> — " + esc(zCSt.code) + "<br><small>ولي الأمر: " + esc(zCSt.parent) + (zCSt.teachers ? " — لدى: " + esc(zCSt.teachers) : "") + "</small>";
      $("zcPicked").hidden = false; $("zcBtn").hidden = false; $("zcOut").hidden = true;
      zCheck(false);
    });
    $("zcBtn").addEventListener("click", function () { zCheck(false); });
    $("zcOut").addEventListener("click", function (e) { if (e.target.id === "zcFull") zCheck(true); });
  })();
  function zEnsure(cb) {
    if (STU) { $("zLoading").hidden = true; return cb(); }
    $("zLoading").hidden = false; $("zLoading").textContent = "جارٍ تحميل الطلاب والأسر…";
    loadStu(false, function () { $("zLoading").hidden = true; cb(); }, function (m) { $("zLoading").textContent = "⚠ " + m; });
  }
  function loadZ() { zMode(zCur); }
  function zMode(m) {
    zCur = m; clearMsg(); zDisarm();
    $("zSeg").querySelectorAll("button").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-zm") === m); });
    ["zStu", "zFamCard", "zTch", "zChk"].forEach(function (k) { $(k).hidden = true; });
    if (m === "teacher") { $("zLoading").hidden = true; $("zTch").hidden = false; return loadTch(); }
    zEnsure(function () { $({ student: "zStu", family: "zFamCard", check: "zChk" }[m]).hidden = false; });
  }
  function zSetWhen(p, w) { $(p + "When").querySelectorAll("button").forEach(function (x) { x.classList.toggle("on", x.getAttribute("data-w") === w); }); }
  function zWhen(p) { var b = $(p + "When").querySelector("button.on"); return b ? b.getAttribute("data-w") : "next"; }
  function zDisarm() {
    zArmed = "";
    ["zStopConfirm", "zResConfirm", "zfStopConfirm", "zfResConfirm", "ztConfirm"].forEach(function (k) { if ($(k)) $(k).hidden = true; });
    if (zBusy) return;
    var lbl = { zStopBtn: "إيقاف الطالب", zCancelBtn: "إلغاء الإيقاف", zResumeBtn: "إعادة التفعيل", zfStopBtn: "إيقاف الطلاب النشطين", zfCancelBtn: "↩️ إلغاء الإيقاف المعلّق", zfResumeBtn: "إعادة تفعيل المحدَّدين" };
    Object.keys(lbl).forEach(function (k) { if ($(k)) { $(k).textContent = $(k).getAttribute("data-label") || lbl[k]; $(k).classList.remove("confirming"); } });
    document.querySelectorAll("#ztActions button").forEach(function (b) { b.classList.remove("confirming"); b.textContent = b.getAttribute("data-label"); });
  }
  function zArm(key, btn, box, text) {
    if (zArmed === key) return true;
    zDisarm(); zArmed = key;
    if (box) { $(box).textContent = text + " اضغط مرة أخرى للتأكيد."; $(box).hidden = false; }
    btn.textContent = "تأكيد"; btn.classList.add("confirming");
    return false;
  }
  function zToken(key) { if (zTokKey !== key) { zTokKey = key; zTok = stTok(); } return zTok; }
  // تنفيذ دالة من دوال الشيت الرئيسي مع إعادة المحاولة إن كان الشيت مشغولًا
  function zRun(fn, arg, btn, done, attempt) {
    zBusy = true; btn.disabled = true; btn.classList.remove("confirming");
    btn.textContent = attempt > 1 ? "الشيت مشغول… جارٍ إعادة المحاولة (" + attempt + ")" : "جارٍ التنفيذ…";
    api("stCall", { fn: fn, arg: arg }).then(function (res) {
      var r = res.result || {};
      zBusy = false; btn.disabled = false; zTokKey = ""; zDisarm();
      showMsg((r.alreadySaved ? "✓ هذه العملية مسجَّلة من قبل ولم تُكرَّر.\n" : "") + (r.message || "✓ تم."), true);
      done(r);
    }).catch(function (e) {
      var m = String(e.message || e);
      if (m.indexOf("BUSY:") === 0 && attempt < 4) { setTimeout(function () { zRun(fn, arg, btn, done, attempt + 1); }, 6000); return; }
      zBusy = false; btn.disabled = false; zDisarm();
      showMsg("⚠ " + (m.indexOf("BUSY:") === 0 ? m.slice(5).trim() : m), false);
    });
  }
  function zLoadFamStatus(fid, cb) {
    api("payStatus", { familyId: fid }).then(cb).catch(function () { cb({ id: fid, error: true }); });
  }
  /* طالب */
  function zPick(code) {
    zSt = STU.students.filter(function (s) { return s.code === code; })[0];
    if (!zSt) return;
    zJustResumed = ""; $("zRes").innerHTML = ""; $("zQ").value = ""; $("zReason").value = ""; zSetWhen("zs", "next");
    $("zPkg").value = zSt.lastPkg !== "" && zSt.lastPkg !== undefined ? zSt.lastPkg : "";
    $("zPrice").value = zSt.price !== "" && zSt.price !== undefined ? zSt.price : "";
    zFam = null; zRender();
    var fid = zSt.fid;
    if (fid) zLoadFamStatus(fid, function (f) { if (zSt && zSt.fid === fid) { zFam = f; zMoneyStu(); } });
  }
  function zRender() {
    if (!zSt) return;
    var st = zState(zSt), next = nextLbl(STU.month);
    $("zPicked").innerHTML = "<b>" + esc(zSt.name) + "</b> — " + esc(zSt.code) + ' <span class="badge">' + Z_PILL[st] + "</span><br><small>ولي الأمر: " + esc(zSt.parent) +
      (zSt.teachers ? " — لدى: " + esc(zSt.teachers) : "") + (st !== "stopped" ? " — الباقة: " + hs(zSt.pkg) + " — حضر هذا الشهر: " + hs(zSt.used || 0) : "") + "</small>";
    $("zPicked").hidden = false;
    $("zStopBox").hidden = st !== "active"; $("zPendBox").hidden = st !== "pending"; $("zResumeBox").hidden = st !== "stopped";
    $("zToTeacher").hidden = zJustResumed !== zSt.code;
    $("zsWhenNote").textContent = zWhen("zs") === "now" ? "من الآن: تصير باقة هذا الشهر " + hs(zSt.used || 0) + " (ما حضره فعلًا)، فتنقص فاتورة الأسرة." : "من " + next + ": يُكمل باقة هذا الشهر (" + hs(zSt.pkg) + ").";
    if (st === "pending") {
      var p = zSt.pending;
      $("zPendTxt").textContent = "مسجَّل إيقافه " + (p.when === "now" ? "من الآن" : "من " + (p.label || next)) + "، ويُغلق نهائيًا مع قفل الشهر. يمكن إلغاؤه قبل ذلك" +
        (p.when === "now" && p.oldPkg !== "" && p.oldPkg !== undefined ? "، وتعود باقته إلى " + hs(p.oldPkg) + "." : ".");
    }
    zMoneyStu(); zDisarm();
  }
  function zMoneyStu() {
    var box = $("zMoney");
    if (!zSt) { box.hidden = true; return; }
    if (zCur === "student") $("zsWhenNote").textContent = zWhen("zs") === "now" ? "من الآن: تصير باقة هذا الشهر " + hs(zSt.used || 0) + " (ما حضره فعلًا)، فتنقص فاتورة الأسرة." : "من " + nextLbl(STU.month) + ": يُكمل باقة هذا الشهر (" + hs(zSt.pkg) + ").";
    var st = zState(zSt), price = Number(zSt.price) || 0, pkg = Number(zSt.pkg) || 0, used = Number(zSt.used) || 0;
    var left = Math.max(pkg - used, 0), unused = left * price, h = "";
    var cu = !!(zFam && zFam.usd) || (price > 0 && price < 50);
    if (zFam && !zFam.error) h += zLn("حساب الأسرة الآن (" + esc(zSt.parent) + ")", zBal(zFam.remaining, cu), zCls(zFam.remaining));
    else h += '<div class="note">' + (zFam ? "تعذّر تحميل حساب الأسرة." : "جارٍ تحميل حساب الأسرة…") + "</div>";
    if (st !== "stopped") {
      if (price === 0) h += zLn("قيمة المجالس المتبقية", "تطوّع، لا أثر مالي");
      else {
        h += zLn("المجالس المتبقية من باقته", hs(left) + " × " + numf(price, 2) + " = " + pmoney(unused, cu));
        if (zFam && !zFam.error && st === "active") {
          var after = Math.round((zFam.remaining - unused) * 100) / 100;
          h += '<div class="res">' + zLn(zWhen("zs") === "now" ? "حساب الأسرة بعد الإيقاف من الآن" : "حساب الأسرة بعد قفل الشهر (إن لم يحضر أكثر)", zBal(after, cu), zCls(after)) + "</div>";
          h += '<div class="note">' + (zWhen("zs") === "now" ? "تنقص فاتورة هذا الشهر فورًا بقيمة المجالس المتبقية." : "يُكمل باقته هذا الشهر، وما لا يحضره يُخصم من فاتورة الأسرة القادمة.") +
            (after < 0 ? " إن لم يكن للأسرة طلاب آخرون، فهذا مبلغ يُردّ إليها أو يبقى رصيدًا لها." : "") + "</div>";
        }
      }
    }
    box.innerHTML = h; box.hidden = false;
  }
  function zAfter() { var c = zSt && zSt.code; if (!c) return; zPick(c); }
  function zStop() {
    if (zBusy || !zSt) return;
    clearMsg();
    var when = zWhen("zs"), reason = $("zReason").value.trim(), key = ["stop", zSt.code, when, reason].join("|");
    if (!zArm(key, $("zStopBtn"), "zStopConfirm", "سيُوقَف " + zSt.name + " " + (when === "now" ? "من الآن، وتصير باقة هذا الشهر " + hs(zSt.used || 0) : "من " + nextLbl(STU.month) + "، ويُكمل باقة هذا الشهر") + ".")) return;
    var st = zSt;
    zRun("stopStudent", { code: st.code, when: when, reason: reason, token: zToken(key) }, $("zStopBtn"), function () {
      st.pending = { when: when, label: nextLbl(STU.month), oldPkg: st.pkg };
      if (when === "now") st.pkg = st.used || 0;
      zAfter();
    }, 1);
  }
  function zCancel() {
    if (zBusy || !zSt || !zSt.pending) return;
    clearMsg();
    var key = "unstop|" + zSt.code;
    if (!zArm(key, $("zCancelBtn"), null, "")) return;
    var st = zSt;
    zRun("cancelStudentStop", { code: st.code, token: zToken(key) }, $("zCancelBtn"), function () {
      if (st.pending.when === "now" && st.pending.oldPkg !== "" && st.pending.oldPkg !== undefined) st.pkg = st.pending.oldPkg;
      st.pending = null; zAfter();
    }, 1);
  }
  function zResume() {
    if (zBusy || !zSt) return;
    clearMsg();
    var pkg = digits($("zPkg").value), price = digits($("zPrice").value);
    if (pkg === "" || isNaN(Number(pkg))) return showMsg("⚠ اكتب عدد مجالس الباقة.", false);
    if (price !== "" && isNaN(Number(price))) return showMsg("⚠ يجب أن يكون سعر المجلس رقمًا.", false);
    var key = ["resume", zSt.code, pkg, price].join("|");
    if (!zArm(key, $("zResumeBtn"), "zResConfirm", "سيُعاد تفعيل " + zSt.name + " بباقة " + hs(pkg) + (price !== "" ? " وسعر " + (Number(price) === 0 ? "0 (تطوّع)" : price) : "") + ".")) return;
    var st = zSt;
    zRun("resumeStudent", { code: st.code, "package": pkg, price: price, token: zToken(key) }, $("zResumeBtn"), function () {
      st.active = true; st.pending = null; st.pkg = Number(pkg); st.used = st.used || 0;
      if (price !== "") st.price = Number(price);
      var c = st.code; zPick(c); zJustResumed = c; $("zToTeacher").hidden = false;
    }, 1);
  }
  /* أسرة */
  function zfKids() { return zFSel && STU ? STU.students.filter(function (s) { return s.fid === zFSel.id; }) : []; }
  function zfLoadMoney() { if (!zFSel) return; var id = zFSel.id; zLoadFamStatus(id, function (f) { if (zFSel && zFSel.id === id) { zFFam = f; zfMoney(); } }); }
  function zfRender(reset) {
    if (!zFSel) return;
    var kids = zfKids(), by = { active: [], pending: [], stopped: [] };
    kids.forEach(function (k) { by[zState(k)].push(k); });
    $("zfPicked").innerHTML = "<b>" + esc(zFSel.name) + "</b> — " + esc(zFSel.id) + (kids.length ? kids.map(function (k) {
      var st = zState(k);
      return "<div><small>" + Z_PILL[st] + " — " + esc(k.name) + " (" + esc(k.code) + ")" + (st !== "stopped" ? " — الباقة " + hs(k.pkg) + "، حضر " + hs(k.used || 0) : "") + (k.teachers ? " — " + esc(k.teachers) : "") + "</small></div>";
    }).join("") : "<div><small>لا يوجد طلاب مسجَّلون لهذه الأسرة.</small></div>");
    $("zfPicked").hidden = false;
    $("zfStopBox").hidden = !by.active.length; $("zfPendBox").hidden = !by.pending.length; $("zfResumeBox").hidden = !by.stopped.length;
    $("zfStopBtn").setAttribute("data-label", "إيقاف الطلاب النشطين (" + by.active.length + ")");
    $("zfCancelBtn").setAttribute("data-label", "↩️ إلغاء الإيقاف المعلّق (" + by.pending.length + ")");
    if (reset || !$("zfResList").querySelector(".frow[data-code]")) {
      $("zfResList").innerHTML = (by.stopped.length ? '<div class="frow" style="font-size:12px;color:var(--muted)"><span></span><span>الطالب</span><span>الباقة</span><span>سعر المجلس</span></div>' : "") + by.stopped.map(function (k) {
        return '<div class="frow" data-code="' + esc(k.code) + '"><input type="checkbox" checked><span>' + esc(k.name) + "</span>" +
          '<input type="text" inputmode="decimal" class="fpkg" placeholder="الباقة" value="' + esc(k.lastPkg !== "" && k.lastPkg !== undefined ? k.lastPkg : "") + '">' +
          '<input type="text" inputmode="decimal" class="fprice" placeholder="السعر" value="' + esc(k.price !== "" && k.price !== undefined ? k.price : "") + '"></div>';
      }).join("");
    }
    zDisarm(); zfMoney();
  }
  function zfMoney() {
    var box = $("zfMoney");
    if (!zFSel) { box.hidden = true; return; }
    $("zfWhenNote").textContent = zWhen("zf") === "now" ? "من الآن: تُحسب المجالس التي حضروها فقط." : "من " + nextLbl(STU.month) + ": يُكملون باقات هذا الشهر.";
    var cu = !!(zFFam && zFFam.usd), h = "";
    if (zFFam && !zFFam.error) h += zLn("حساب الأسرة الآن", zBal(zFFam.remaining, cu), zCls(zFFam.remaining));
    else h += '<div class="note">' + (zFFam ? "تعذّر تحميل حساب الأسرة." : "جارٍ تحميل حساب الأسرة…") + "</div>";
    var act = zfKids().filter(function (k) { return zState(k) === "active"; });
    var unused = Math.round(act.reduce(function (s, k) { return s + Math.max((Number(k.pkg) || 0) - (Number(k.used) || 0), 0) * (Number(k.price) || 0); }, 0) * 100) / 100;
    if (act.length) {
      h += zLn("قيمة المجالس المتبقية للطلاب النشطين", pmoney(unused, cu));
      if (zFFam && !zFFam.error) {
        var after = Math.round((zFFam.remaining - unused) * 100) / 100;
        h += '<div class="res">' + zLn(zWhen("zf") === "now" ? "حساب الأسرة بعد الإيقاف من الآن" : "حساب الأسرة بعد قفل الشهر (إن لم يحضروا أكثر)", zBal(after, cu), zCls(after)) + "</div>";
        if (after < 0) h += '<div class="note">إن توقفت الأسرة نهائيًا فهذا مبلغ يُردّ إليها، وإن كانت إجازة فيبقى رصيدًا لها يُخصم عند عودتها.</div>';
      }
    }
    box.innerHTML = h; box.hidden = false;
  }
  function zfDone() {
    var id = zFSel && zFSel.id;
    loadStu(true, function () { zFSel = STU.families.filter(function (f) { return f.id === id; })[0] || zFSel; zFFam = null; zfRender(true); zfLoadMoney(); });
  }
  function zfStop() {
    if (zBusy || !zFSel) return;
    clearMsg();
    var n = zfKids().filter(function (k) { return zState(k) === "active"; }).length, when = zWhen("zf"), reason = $("zfReason").value.trim(), key = ["fstop", zFSel.id, when, reason].join("|");
    if (!zArm(key, $("zfStopBtn"), "zfStopConfirm", "سيُوقَف " + (n === 1 ? "طالب واحد" : n === 2 ? "طالبان" : n + " طلاب") + " من أسرة " + zFSel.name + " " + (when === "now" ? "من الآن" : "من " + nextLbl(STU.month)) + ".")) return;
    zRun("stopFamily", { fid: zFSel.id, when: when, reason: reason, token: zToken(key) }, $("zfStopBtn"), zfDone, 1);
  }
  function zfCancel() {
    if (zBusy || !zFSel) return;
    clearMsg();
    var key = "funstop|" + zFSel.id;
    if (!zArm(key, $("zfCancelBtn"), null, "")) return;
    zRun("cancelFamilyStop", { fid: zFSel.id, token: zToken(key) }, $("zfCancelBtn"), zfDone, 1);
  }
  function zfResume() {
    if (zBusy || !zFSel) return;
    clearMsg();
    var items = [], bad = "";
    document.querySelectorAll("#zfResList .frow[data-code]").forEach(function (row) {
      if (!row.querySelector("input[type=checkbox]").checked) return;
      var code = row.getAttribute("data-code"), k = STU.students.filter(function (s) { return s.code === code; })[0];
      var pkg = digits(row.querySelector(".fpkg").value), price = digits(row.querySelector(".fprice").value);
      if (!bad && (pkg === "" || isNaN(Number(pkg)))) bad = "اكتب عدد مجالس الباقة لـ" + k.name + ".";
      if (!bad && price !== "" && isNaN(Number(price))) bad = "يجب أن يكون سعر المجلس رقمًا لـ" + k.name + ".";
      items.push({ code: code, name: k.name, "package": pkg, price: price });
    });
    if (bad) return showMsg("⚠ " + bad, false);
    if (!items.length) return showMsg("⚠ حدّد طالبًا واحدًا على الأقل.", false);
    var key = "fresume|" + JSON.stringify(items);
    if (!zArm(key, $("zfResumeBtn"), "zfResConfirm", "سيُعاد تفعيل: " + items.map(function (i) { return i.name + " (" + hs(i["package"]) + ")"; }).join("، ") + ".")) return;
    zRun("resumeFamily", { fid: zFSel.id, items: items, token: zToken(key) }, $("zfResumeBtn"), zfDone, 1);
  }
  /* معلم */
  function loadTch(keep) {
    $("ztLoading").hidden = false; $("ztLoading").textContent = "جارٍ تحميل المعلمين…";
    api("stCall", { fn: "getTeacherStatusData" }).then(function (res) {
      TCH = res.result; $("ztLoading").hidden = true;
      var cur = keep || $("ztSel").value, order = { active: 0, leave: 1, stopping: 2, stopped: 3 };
      var list = TCH.teachers.slice().sort(function (a, b) { return order[a.state] - order[b.state]; });
      $("ztSel").innerHTML = '<option value="">— اختر —</option>' + list.map(function (t) { return '<option value="' + esc(t.name) + '">' + esc(t.name) + " — " + T_PILL[t.state].replace(/^\S+\s/, "") + "</option>"; }).join("");
      $("ztSel").value = cur || ""; ztRender();
    }).catch(function (e) { $("ztLoading").textContent = "⚠ " + e.message; });
  }
  function ztCur() { return TCH && TCH.teachers.filter(function (t) { return t.name === $("ztSel").value; })[0]; }
  function ztRender() {
    var t = ztCur();
    $("ztInfo").hidden = !t; $("ztNoteWrap").hidden = !t || t.state === "stopping";
    $("ztActions").innerHTML = ""; $("ztFoot").textContent = ""; zDisarm();
    if (!t) return;
    var next = nextLbl(TCH.month);
    $("ztInfo").innerHTML = "<b>" + esc(t.name) + '</b> <span class="badge">' + T_PILL[t.state] + "</span>" + (t.state === "stopping" ? "<br><small>يتوقف بعد قفل " + esc(t.stopAfter) + "</small>" : "") +
      "<br><small>" + (t.students.length ? "طلابه الحاليون (" + t.students.length + "): " + esc(t.students.join("، ")) : "لا يوجد طلاب مسجَّلون لديه حاليًا.") + "</small>";
    var acts = { active: [["leave", "🏖️ تسجيل إجازة"], ["stop", "⏸️ إيقاف بنهاية الشهر"]], leave: [["endLeave", "✅ إنهاء الإجازة"], ["stop", "⏸️ إيقاف بنهاية الشهر"]],
      stopping: [["cancelStop", "↩️ إلغاء الإيقاف"]], stopped: [["resume", "▶️ إعادة التفعيل"]] }[t.state];
    $("ztActions").innerHTML = acts.map(function (a, i) { return '<button type="button" class="' + (i ? "ghost" : "primary") + ' small" data-act="' + a[0] + '" data-label="' + a[1] + '">' + a[1] + "</button>"; }).join("");
    $("ztFoot").textContent = {
      active: "الإجازة لا توقف قراءة مجالسه، وتمنع فقط تنبيه «توقف تسجيل المجالس». الإيقاف يسري بعد قفل الشهر الحالي حتى تُحسب مجالسه في الراتب، ولا يُنشأ له تبويب " + next + ".",
      leave: "الإيقاف يسري بعد قفل الشهر الحالي حتى تُحسب مجالسه في الراتب، ولا يُنشأ له تبويب " + next + ".",
      stopping: "مجالس هذا الشهر تُحسب كالمعتاد. انقل طلابه من «تسجيل ونقل» قبل نهاية الشهر.",
      stopped: "يعود «نشط» = نعم، ويُنشأ له تبويب الشهر الحالي إن لم يكن موجودًا."
    }[t.state];
  }
  function ztAct(e) {
    var b = e.target.closest("button[data-act]"); if (!b || zBusy) return;
    var t = ztCur(); if (!t) return;
    clearMsg();
    var act = b.getAttribute("data-act"), note = $("ztNote").value.trim(), key = [act, t.name, note].join("|");
    var txt = { leave: "ستُسجَّل إجازة " + t.name + ".", endLeave: "ستنتهي إجازة " + t.name + " ويعود نشطًا.",
      stop: "سيتوقف " + t.name + " بعد قفل " + TCH.month + (t.students.length ? "، وطلابه الحاليون (" + t.students.length + ") ينبغي نقلهم إلى معلمين آخرين" : "") + ".",
      cancelStop: "سيُلغى إيقاف " + t.name + ".", resume: "سيُعاد تفعيل " + t.name + "." }[act];
    if (!zArm(key, b, "ztConfirm", txt)) return;
    zRun("setTeacherStatus", { name: t.name, action: act, note: note, token: zToken(key) }, b, function () { $("ztNote").value = ""; STU = null; loadTch(t.name); }, 1);
  }
  /* فحص */
  function zCheck(full) {
    if (!zCSt || $("zcBtn").disabled) return;
    var code = zCSt.code, btn = $("zcBtn"), box = $("zcOut");
    btn.disabled = true; btn.textContent = full ? "جارٍ الفحص في شيتات كل المعلمين… قد يستغرق نصف دقيقة" : "جارٍ الفحص في شيت معلمه…";
    box.innerHTML = ""; box.hidden = true;
    api("stCall", { fn: "inspectStudent", arg: { code: code, full: full } }).then(function (res) {
      btn.disabled = false; btn.textContent = "🔎 إعادة الفحص";
      if (zCSt && zCSt.code === code) zRenderCheck(res.result);
    }).catch(function (e) { btn.disabled = false; btn.textContent = "🔎 فحص حالته في شيتات المعلمين"; showMsg("⚠ " + e.message, false); });
  }
  function zRenderCheck(r) {
    var h = '<div class="verdict ' + esc(r.verdict.level) + '">' + ({ green: "🟢 ", yellow: "🟡 ", red: "🔴 " }[r.verdict.level] || "") + esc(r.verdict.text) + "</div>";
    h += zLn("حالته في «الأسر والطلاب»", r.mainActive ? "نشط (1)" : "متوقف (0)");
    h += zLn("حضوره في " + esc(r.month), hs(r.verdict.curAttended) + " من باقة " + hs(r.pkg));
    if (r.warnings.length) h += '<div class="chk-h">تنبيهات</div>' + r.warnings.map(function (w) { return '<div class="note" style="color:var(--danger);margin-top:2px">⚠ ' + esc(w) + "</div>"; }).join("");
    h += '<div class="chk-h">أين يوجد</div>' + (r.places.length ? r.places.map(function (p) {
      return zLn(esc(p.teacher) + " — " + esc(p.month) + (p.days ? " — " + esc(p.days) : "") + (p.match === "name" ? " <small>(بالاسم فقط)</small>" : ""), hs(p.attended) + (p.last ? " — آخرها " + esc(p.last) : ""));
    }).join("") : '<div class="note">لم يُعثر عليه في أي شيت معلم في الشهر الحالي ولا السابق.</div>');
    if (r.events.length) h += '<div class="chk-h">آخر ما سُجّل له</div>' + r.events.map(function (e) {
      return '<div class="evt"><span>' + esc(e.date) + "</span><span><i class='dt' style='background:" + (KIND_COLOR[e.kind] || "#eee") + "'></i>" + esc(e.kind) + (e.note ? " (" + esc(e.note) + ")" : "") +
        " <small>— " + esc(e.teacher) + "</small></span><span>" + (e.minutes !== "" ? esc(e.minutes) + " د" : "") + "</span></div>";
    }).join("");
    if (r.log.length) h += '<div class="chk-h">سجل التنقلات والإيقاف</div>' + r.log.slice(-5).reverse().map(function (l) {
      return '<div class="note" style="margin-top:2px">' + esc(l.date) + " — " + esc(l.kind) + (l.from ? " من " + esc(l.from) : "") + (l.to ? " إلى " + esc(l.to) : "") + (l.state ? " (" + esc(l.state) + ")" : "") + "</div>";
    }).join("");
    var scope = { quick: "فحص سريع: فُحصت شيتات معلمه المذكور فقط (" + r.checked + " من " + r.total + ") لأنه وُجد عنده.", fallback: "لم يوجد عند معلمه المذكور، ففُحصت شيتات كل المعلمين (" + r.checked + ").",
      full: "فحص شامل: فُحصت شيتات " + r.checked + " معلمًا." }[r.scope] || ("فُحصت شيتات " + r.checked + " معلمًا.");
    h += '<div class="note">' + scope + (r.failed.length ? " وتعذّر فتح: " + esc(r.failed.join("، ")) + "." : "") + " الفحص للقراءة فقط ولا يغيّر شيئًا.</div>";
    if (r.scope === "quick") h += '<div class="actions"><button type="button" class="ghost small" id="zcFull">🔎 فحص شامل في كل الشيتات</button></div>';
    $("zcOut").innerHTML = h; $("zcOut").hidden = false;
  }

  /* ---------- تقرير التحصيل داخل تبويب «المالية» (قراءة فقط) ---------- */
  var CR = null;
  (function buildCollect() {
    var host = document.querySelector('[data-sec="money"]');
    if (!host) return;
    host.insertAdjacentHTML("beforeend",
      '<section class="card" id="crCard"><div class="min-row" style="justify-content:space-between"><h2 style="margin:0">الأسر المتأخرة في السداد</h2>' +
      '<button type="button" class="ghost small" id="crLoad">عرض التقرير</button></div>' +
      '<div class="note">قائمة الأسر التي بقي عليها مبلغ في الشهر المالي الحالي، مرتبةً من الأكبر، مع آخر دفعة لكل أسرة. للقراءة فقط.</div>' +
      '<div id="crBody"></div></section>');
    $("crLoad").addEventListener("click", loadCollect);
    $("crBody").addEventListener("click", function (e) {
      var w = e.target.closest("[data-crwa]");
      if (w) { var f = CR.late[Number(w.getAttribute("data-crwa"))]; if (f) window.open(crWaUrl(f), "_blank"); return; }
      var c = e.target.closest("[data-crcopy]");
      if (c) crCopy(CR.late[Number(c.getAttribute("data-crcopy"))], c);
    });
  })();
  function crMsg(f) {
    var cur = f.usd ? "دولار" : "جنيه";
    return "السلام عليكم ورحمة الله،\nنذكّركم بأن المتبقي من فاتورة غراس الأدب لشهر " + CR.month + " هو " + numf(f.remaining, 2) + " " + cur +
      (f.paid > 0 ? "، علمًا أنكم سدّدتم " + numf(f.paid, 2) + " " + cur + " منها" : "") +
      ".\n\nطرق الدفع (باسم عمر شرف):\n- إنستاباي: " + INSTAPAY_URL + "\n- فودافون كاش: " + VODAFONE_NUM + "\n\nجزاكم الله خيرًا.";
  }
  function crWaUrl(f) { return "https://wa.me/" + f.phone + "?text=" + encodeURIComponent(crMsg(f)); }
  function crCopy(f, btn) {
    if (!f) return;
    var old = btn.textContent;
    function ok() { btn.textContent = "✓ نُسخت"; setTimeout(function () { btn.textContent = old; }, 2000); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(crMsg(f)).then(ok, function () { window.prompt("انسخ الرسالة:", crMsg(f)); });
    else window.prompt("انسخ الرسالة:", crMsg(f));
  }
  function loadCollect() {
    $("crBody").innerHTML = '<div class="loading">جارٍ قراءة الملخص وسجل المدفوعات…</div>';
    $("crLoad").disabled = true;
    api("collectReport", {}).then(function (r) { CR = r; renderCollect(); })
      .catch(function (e) { $("crBody").innerHTML = '<div class="note">⚠ ' + esc(e.message) + "</div>"; })
      .then(function () { $("crLoad").disabled = false; $("crLoad").textContent = "تحديث التقرير"; });
  }
  function crDays(f) {
    var n = f.daysSince;
    if (n === null) return "لا توجد دفعة مسجَّلة لها";
    if (n === 0) return "آخر دفعة اليوم";
    if (n === 1) return "آخر دفعة أمس";
    if (n === 2) return "آخر دفعة منذ يومين";
    return "آخر دفعة منذ " + n + (n <= 10 ? " أيام" : " يومًا");
  }
  function renderCollect() {
    var r = CR, h = "";
    if (!r.late.length) h += '<div class="note">✓ لا توجد أسر متأخرة في ' + esc(r.month) + ".</div>";
    else {
      var te = 0, tu = 0;
      r.late.forEach(function (f) { if (f.usd) tu += f.remaining; else te += f.remaining; });
      h += '<div class="note"><b>' + r.late.length + " أسرة</b> — إجمالي المتبقي: " + money(te) + (tu ? " + " + money(tu, true) : "") + "</div>";
      h += r.late.map(function (f, i) {
        var phone = f.phone ? "" : " disabled";
        return '<div class="inv-family-row" style="cursor:default"><span class="inv-fname"><b>' + esc(f.name) + "</b> <small>" + esc(f.id) + "</small><br><small>" +
          (f.paid > 0 ? "دفعت " + money(f.paid, f.usd) + " من " + money(f.invoice + f.previous, f.usd) : "الفاتورة " + money(f.invoice + f.previous, f.usd)) +
          " — " + crDays(f) + (f.lastDate ? " (" + esc(fmtDate(f.lastDate)) + ")" : "") + '</small></span><span class="inv-rem">' + money(f.remaining, f.usd) + "</span>" +
          '<span class="min-row"><button type="button" class="ghost small" data-crwa="' + i + '"' + phone + '>واتساب</button>' +
          '<button type="button" class="ghost small" data-crcopy="' + i + '">نسخ الرسالة</button></span></div>';
      }).join("");
    }
    var hl = r.health, bad = hl.unknown.length + hl.duplicates.length + hl.future.length;
    h += '<h2 style="margin-top:18px">فحص سجل المدفوعات</h2>';
    if (!bad) h += '<div class="note">✓ لا توجد مشكلات ظاهرة في ' + numf(r.payments) + " دفعة: كل دفعة لها أسرة معروفة، ولا تكرار في اليوم نفسه، ولا تواريخ مستقبلية.</div>";
    else {
      h += hl.unknown.length ? '<div class="confirm"><b>دفعات لا تُعرف أسرتها (' + hl.unknown.length + ")</b> — الاسم لا يطابق أي أسرة في الملخص، فلا تُحسب لأحد:" +
        hl.unknown.map(function (x) { return "<br>الصف " + x.row + ": " + esc(x.name || "—") + " — " + numf(x.amount, 2) + " — " + esc(x.month); }).join("") + "</div>" : "";
      h += hl.duplicates.length ? '<div class="confirm" style="margin-top:8px"><b>دفعات متطابقة في اليوم نفسه (' + hl.duplicates.length + ")</b> — الأسرة والمبلغ والشهر والتاريخ نفسها، فقد تكون مكررة:" +
        hl.duplicates.map(function (x) { return "<br>الصفان " + x.firstRow + " و" + x.row + ": " + esc(x.name) + " — " + numf(x.amount, 2) + " — " + esc(x.month) + " — " + esc(fmtDate(x.date)); }).join("") + "</div>" : "";
      h += hl.future.length ? '<div class="confirm" style="margin-top:8px"><b>دفعات بتاريخ لم يأتِ بعد (' + hl.future.length + ")</b>:" +
        hl.future.map(function (x) { return "<br>الصف " + x.row + ": " + esc(x.name) + " — " + numf(x.amount, 2) + " — " + esc(fmtDate(x.date)); }).join("") + "</div>" : "";
      h += '<div class="note">قد يكون التطابق مقصودًا (دفعتان بمبلغ واحد). لا يُحذف شيء تلقائيًا، وراجع الصفوف المذكورة في «سجل المدفوعات».</div>';
    }
    $("crBody").innerHTML = h;
  }

  document.querySelectorAll("[data-atab]").forEach(function (b) {
    b.addEventListener("click", function () {
      var t = b.getAttribute("data-atab");
      document.querySelectorAll("[data-atab]").forEach(function (x) { x.classList.toggle("on", x === b); });
      var own = t === "arch" || t === "evals" || t === "invoices" || t === "holidays" || t === "payments" || t === "students" || t === "status";
      $("aSum").hidden = own; $("aArch").hidden = t !== "arch"; $("aEvals").hidden = t !== "evals"; $("aInvoices").hidden = t !== "invoices"; $("aHol").hidden = t !== "holidays";
      if ($("aPay")) $("aPay").hidden = t !== "payments";
      if (t === "holidays") loadHolidays();
      if (t === "payments") loadPay();
      if ($("aStu")) $("aStu").hidden = t !== "students";
      if (t === "students") loadStu();
      if ($("aZ")) $("aZ").hidden = t !== "status";
      if (t === "status") loadZ();
      $("aMonth").hidden = own; $("aFresh").hidden = own;
      if (t === "evals") loadEvals();
      if (t === "invoices") { loadInvoices(); loadReady(); }
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
      '<div class="row2"><div class="field"><label>الباقة الشهرية (عدد المجالس)</label><input class="rf-pkg" inputmode="decimal"></div>' +
      '<div class="field"><label>سعر المجلس</label><input class="rf-price" inputmode="decimal" placeholder="0 = تطوّع"></div></div>' +
      '<div class="row2"><div class="field"><label>تاريخ أول مجلس</label><input class="rf-start" type="date" value="' + esc((AD && AD.today) || "") + '"></div>' +
      '<div class="field"><label>أيام الدرس</label><input class="rf-pdays" placeholder="مثال: الأحد والأربعاء"></div></div>' +
      '<div class="note rf-prev">اكتب الباقة وتاريخ أول مجلس وأيام الدرس، فيُحسب عدد مجالس هذا الشهر وفاتورته. اترك التاريخ فارغًا لتسجيل الباقة كاملة.</div>' +
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
  // معاينة عدد مجالس هذا الشهر وفاتورته أثناء الكتابة
  var rfPrevT = null;
  function rfPreview(f) {
    var q = function (c) { return f.querySelector(c).value.trim(); }, box = f.querySelector(".rf-prev");
    var pkg = digits(q(".rf-pkg"));
    if (pkg === "" || isNaN(Number(pkg))) { box.textContent = "اكتب الباقة الشهرية أولًا."; return; }
    var start = q(".rf-start"), days = q(".rf-pdays") || q(".rf-days");
    if (!start || !days) { box.textContent = "دون تاريخ بدء وأيام درس تُسجَّل الباقة كاملة (" + pkg + ")."; return; }
    box.textContent = "جارٍ الحساب…";
    api("evalPreview", { package: pkg, price: digits(q(".rf-price")), startDate: start, firstDays: days })
      .then(function (r) { box.textContent = r.message || ""; })
      .catch(function (e) { box.textContent = "⚠ " + e.message; });
  }
  $("evList").addEventListener("input", function (e) {
    var f = e.target.closest(".reg-form"); if (!f || !/rf-(pkg|price|start|pdays|days)/.test(e.target.className)) return;
    clearTimeout(rfPrevT); rfPrevT = setTimeout(function () { rfPreview(f); }, 500);
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
      category: q(".rf-cat"), days: q(".rf-days"), rate: q(".rf-rate"), note: it.querySelector(".evN").value,
      startDate: q(".rf-start"), firstDays: q(".rf-pdays") };
    if (mode === "join") p.groupStart = q(".rf-target");
    if (mode === "pair") p.pairCode = q(".rf-target");
    if (!p.parent) return showMsg("⚠ اكتب اسم ولي الأمر.", false);
    if (p.price === "") return showMsg("⚠ اكتب سعر المجلس (0 إن كان تطوّعًا).", false);
    if (!p.teacher) return showMsg("⚠ اختر المعلم.", false);
    if (p.package !== "" && p.startDate && !(p.firstDays || p.days)) return showMsg("⚠ اكتب أيام الدرس لحساب مجالس هذا الشهر، أو أفرغ تاريخ أول مجلس لتسجيل الباقة كاملة.", false);
    if ((mode === "join" && !p.groupStart) || (mode === "pair" && !p.pairCode)) return showMsg("⚠ اختر " + (mode === "join" ? "المجموعة" : "الطالب الفردي") + ".", false);
    btn.disabled = true; btn.textContent = "جارٍ التسجيل… قد يستغرق ذلك دقيقة";
    api("evalRegister", p).then(function (r) {
      var x = EV.evals.filter(function (y) { return y.id === p.id; })[0];
      x.status = "وُزّع"; x.assigned = p.teacher; x.assignNote = "الكود " + r.code;
      renderEvals();
      var fmTxt = r.firstMonth && r.firstMonth.applies ? "\nمجالس هذا الشهر: " + r.firstMonth.sessions + " من " + r.firstMonth.monthly + " (فاتورته " + r.firstMonth.total + ")" +
        (r.firstMonth.sessions < r.firstMonth.monthly ? "، وتعود الباقة الشهرية كاملة بعد قفل الشهر." : "") : "";
      showMsg("✓ " + (r.existed ? "كان مسجَّلًا من قبل بالكود " + r.code + (r.filled.length ? "، وأُكملت بياناته: " + r.filled.join("، ") : "") : "سُجّل " + p.name + " بالكود " + r.code + " في الأسرة " + r.familyId) + ".\n" + r.message + fmTxt, true);
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

  /* ======================= الفواتير ======================= */
  var INV = null; // بيانات قائمة الأسر (invoiceList)
  var invOnlyCodes = null; // عند التحديد من «فواتير جاهزة»: أكواد الأسر المعروضة وحدها
  var invIsNextMode = false;
  var currentInvoicesLoaded = [];
  var INSTAPAY_URL = "https://ipn.eg/S/omarsharafalex/instapay/88hGU7";
  var VODAFONE_NUM = "01080306228";

  function loadInvoices(force) {
    if (INV && !force) return Promise.resolve(renderInvoiceList());
    $("invFamilyList").innerHTML = '<div class="loading">جارٍ تحميل قائمة الأسر…</div>';
    return api("invoiceList", { isNext: invIsNextMode }).then(function (r) {
      INV = r;
      var curName = r.currentMonth || r.month || "";
      var nextName = r.nextMonth || "";
      var tabCur = $("invTabCur"), tabNext = $("invTabNext");
      if (tabCur) {
        tabCur.textContent = "📅 " + (curName || "الحالي");
        if (!invIsNextMode) tabCur.classList.add("active"); else tabCur.classList.remove("active");
      }
      if (tabNext) {
        tabNext.textContent = "⏭️ " + (nextName || "القادم");
        if (invIsNextMode) tabNext.classList.add("active"); else tabNext.classList.remove("active");
      }
      $("invMonth").textContent = invIsNextMode ? ("فواتير استباقية لشهر: " + (nextName || r.month)) : (curName || r.month || "");
      renderInvoiceList();
    }).catch(function (e) {
      $("invFamilyList").innerHTML = '<div class="note">⚠ ' + esc(e.message) + "</div>";
    });
  }

  // التبديل بين الشهر الحالي والقادم
  var tabCurBtn = $("invTabCur"), tabNextBtn = $("invTabNext");
  if (tabCurBtn) tabCurBtn.addEventListener("click", function () {
    if (!invIsNextMode) return;
    invIsNextMode = false; invOnlyCodes = null; invSentOnly = false;
    loadInvoices(true);
  });
  if (tabNextBtn) tabNextBtn.addEventListener("click", function () {
    if (invIsNextMode) return;
    invIsNextMode = true; invOnlyCodes = null; invSentOnly = false;
    loadInvoices(true);
  });

  // توحيد شكل أزرار شريط الفواتير: قالب واحد، والألوان تدل على الوظيفة
  (function () {
    var st = document.createElement("style");
    st.textContent =
      "#invGenerate,#invSentMark,#invPayMark,#invZipBulk,#invSelAll,#invSelDue,#invSentOnly{width:auto!important;font:inherit!important;font-size:14px!important;font-weight:700!important;padding:6px 14px!important;border-radius:12px!important;border:1.5px solid var(--green)!important;background:transparent!important;color:var(--green)!important;cursor:pointer;box-shadow:none!important;line-height:1.4}" +
      "#invGenerate{background:var(--orange)!important;border-color:var(--orange)!important;color:#fff!important}" +
      "#invGenerate:hover{background:var(--orange-hover)!important}" +
      "#invSentMark{background:#2e7d32!important;border-color:#2e7d32!important;color:#fff!important}" +
      "#invPayMark{background:#1565c0!important;border-color:#1565c0!important;color:#fff!important}" +
      "#invZipBulk{border-color:var(--orange)!important;color:var(--orange)!important}" +
      "#invSentOnly.on{background:#2e7d32!important;border-color:#2e7d32!important;color:#fff!important}" +
      "#invGenerate:disabled,#invSentMark:disabled,#invPayMark:disabled,#invZipBulk:disabled{opacity:.6;cursor:default}";
    document.head.appendChild(st);
  })();

  // البحث في الأسر
  var invSearchInput = $("invSearch");
  if (invSearchInput) invSearchInput.addEventListener("input", renderInvoiceList);
  // الأسر التي أُرسلت فواتيرها تُخفى افتراضيًا، ويُظهرها هذا الخيار
  var invShowSentChk = $("invShowSent");
  if (invShowSentChk) invShowSentChk.addEventListener("change", renderInvoiceList);
  // زر «إظهار المرسلة فقط»: يعرض الأسر المرسلة وحدها
  var invSentOnly = false, invSentOnlyBtn = null;
  if (invShowSentChk) {
    invSentOnlyBtn = document.createElement("button");
    invSentOnlyBtn.type = "button"; invSentOnlyBtn.id = "invSentOnly"; invSentOnlyBtn.className = "small";
    invSentOnlyBtn.textContent = "إظهار المرسلة فقط";
    invShowSentChk.closest("label").insertAdjacentElement("afterend", invSentOnlyBtn);
    invSentOnlyBtn.addEventListener("click", function () { invSentOnly = !invSentOnly; renderInvoiceList(); });
  }

  function renderInvoiceList() {
    if (!INV || !INV.families) return;
    var q = invSearchInput ? invSearchInput.value.trim() : "";
    var only = invOnlyCodes;
    var showSent = !!(invShowSentChk && invShowSentChk.checked), hiddenSent = 0;
    if (invSentOnlyBtn) invSentOnlyBtn.classList.toggle("on", invSentOnly);
    var sentTotal = 0;
    INV.families.forEach(function (f) { if (f.sent) sentTotal++; });
    var html = INV.families.filter(function (f) {
      if (invSentOnly) return f.sent && (!q || String(f.name).indexOf(q) !== -1);
      if (f.sent && !showSent) { hiddenSent++; return false; }
      if (only && only.indexOf(String(f.code)) === -1) return false;
      return !q || String(f.name).indexOf(q) !== -1;
    }).map(function (f) {
      var cr = f.remaining < 0;
      var amt = f.remaining
        ? '<span class="inv-rem"' + (cr ? ' style="color:var(--ok)"' : '') + '>' + (cr ? "لها " : "عليها ") + fmt(Math.abs(f.remaining)) + ' ' + esc(f.currency || "ج") + '</span>'
        : '<span class="inv-rem" style="color:var(--muted)">مسدّد</span>';
      var sentTag = f.sent ? ' <span class="note">✔ أُرسلت</span> <button type="button" class="link-btn inv-unsent" data-code="' + esc(f.code) + '">إلغاء</button>' : "";
      return '<label class="inv-family-row due">' +
        '<input type="checkbox" class="inv-chk" data-code="' + esc(f.code) + '" data-rem="' + Number(f.remaining || 0) + '"> ' +
        '<span class="inv-fname">' + esc(f.name) + sentTag + '</span>' +
        amt +
        '</label>';
    }).join("");
    var banner = invSentOnly
      ? '<div class="note">المعروض: الأسر المرسلة فقط (' + sentTotal.toLocaleString("ar-EG") + ') <button type="button" class="link-btn" id="invSentOnlyOff">عرض الكل</button></div>'
      : only
      ? '<div class="note">المعروض: الفواتير الجاهزة فقط (' + only.length + ') <button type="button" class="link-btn" id="invShowAll">عرض كل الأسر</button></div>'
      : "";
    if (hiddenSent && !invSentOnly) banner += '<div class="note">أُخفيت ' + hiddenSent + ' أسرة أُرسلت فواتيرها (تظهر بخيار «إظهار المرسلة»).</div>';
    $("invFamilyList").innerHTML = banner + (html || '<div class="note">لا توجد أسر مطابقة.</div>');
    if (invSentOnly) $("invSentOnlyOff").addEventListener("click", function () { invSentOnly = false; renderInvoiceList(); });
    else if (only) $("invShowAll").addEventListener("click", function () { invOnlyCodes = null; renderInvoiceList(); });
    updInvSel();
  }

  // عدّاد الفواتير المحدَّدة
  function updInvSel() {
    var n = document.querySelectorAll(".inv-chk:checked").length;
    var b = $("invSelBadge");
    if (!b) {
      var g = $("invGenerate");
      if (!g) return;
      b = document.createElement("span");
      b.id = "invSelBadge"; b.className = "note";
      b.style.cssText = "font-weight:700;padding:0 8px;white-space:nowrap";
      g.parentNode.insertBefore(b, g.parentNode.firstChild);
    }
    b.textContent = n ? "المحدَّد: " + n.toLocaleString("ar-EG") + " فاتورة" : "لم تُحدَّد فواتير";
  }
  $("invFamilyList").addEventListener("change", function (e) { if (e.target && e.target.classList && e.target.classList.contains("inv-chk")) updInvSel(); });

  function fmt(n) {
    if (n == null || n === "" || isNaN(Number(n))) return "—";
    return Number(n).toLocaleString("ar-EG", { maximumFractionDigits: 2 });
  }

  // تسجيل الأسر المحدَّدة على أنها أُرسلت فواتيرها فتختفي من القائمة
  var invSentBtn = $("invSentMark");
  if (invSentBtn) invSentBtn.addEventListener("click", function () {
    var codes = [];
    document.querySelectorAll(".inv-chk:checked").forEach(function (c) { codes.push(c.getAttribute("data-code")); });
    if (!codes.length) return showMsg("⚠ حدّد أسرة واحدة على الأقل.", false);
    if (!confirm("تسجيل " + codes.length + " أسرة على أنها أُرسلت فواتيرها؟ ستختفي من القائمة.")) return;
    var fams = (INV.families || []).filter(function (f) { return codes.indexOf(String(f.code)) !== -1; })
      .map(function (f) { return { code: f.code, name: f.name }; });
    invSentBtn.disabled = true;
    api("sentMark", { month: INV.month, isNext: invIsNextMode, families: fams }).then(function () {
      (INV.families || []).forEach(function (f) { if (codes.indexOf(String(f.code)) !== -1) f.sent = true; });
      invSentBtn.disabled = false;
      renderInvoiceList();
      showMsg("✓ سُجّلت " + fams.length + " أسرة مرسلة.", true);
    }).catch(function (e) { invSentBtn.disabled = false; showMsg("⚠ " + e.message, false); });
  });
  // إلغاء حالة «أُرسلت» لأسرة (عند الخطأ)
  $("invFamilyList").addEventListener("click", function (e) {
    var b = e.target.closest(".inv-unsent"); if (!b) return;
    e.preventDefault();
    var code = b.getAttribute("data-code");
    api("sentUnmark", { month: INV.month, isNext: invIsNextMode, codes: [code] }).then(function () {
      (INV.families || []).forEach(function (f) { if (String(f.code) === code) f.sent = false; });
      renderInvoiceList();
    }).catch(function (err) { showMsg("⚠ " + err.message, false); });
  });

  // تحديد / إلغاء الكل
  $("invSelAll").addEventListener("click", function () {
    var chks = document.querySelectorAll(".inv-chk");
    var anyUnchecked = Array.prototype.some.call(chks, function (c) { return !c.checked; });
    chks.forEach(function (c) { c.checked = anyUnchecked; });
    updInvSel();
  });

  // تحديد المستحقين فقط
  var invSelDueBtn = $("invSelDue");
  if (invSelDueBtn) invSelDueBtn.addEventListener("click", function () {
    var chks = document.querySelectorAll(".inv-chk");
    chks.forEach(function (c) {
      var rem = Number(c.getAttribute("data-rem") || 0);
      c.checked = rem > 0;
    });
    updInvSel();
  });

  // نافذة منبثقة تعرض الفواتير (تُنشأ عند أول فتح، وتنتقل إليها منطقة العرض invOutput)
  function invModal() {
    var m = $("invModal");
    if (m) return m;
    m = document.createElement("div");
    m.id = "invModal";
    m.style.cssText = "position:fixed;top:0;right:0;bottom:0;left:0;z-index:1000;background:rgba(0,0,0,.55);display:none;overflow:auto;padding:16px;-webkit-overflow-scrolling:touch";
    m.innerHTML = '<div id="invModalBox" style="max-width:480px;margin:0 auto;background:var(--bg,#fff);border-radius:14px;padding:10px 10px 2px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><b>الفواتير المحددة</b> <small style="opacity:.5">نسخة 202610261535</small>' +
      '<button type="button" class="ghost small" id="invModalClose">✕ إغلاق</button></div></div>';
    document.body.appendChild(m);
    $("invModalBox").appendChild($("invOutput"));
    m.addEventListener("click", function (e) { if (e.target === m) closeInvModal(); });
    $("invModalClose").addEventListener("click", closeInvModal);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeInvModal(); });
    return m;
  }
  function openInvModal() { invModal().style.display = "block"; document.body.style.overflow = "hidden"; $("invModal").scrollTop = 0; }
  function closeInvModal() {
    var m = $("invModal");
    if (m) { m.style.display = "none"; document.body.style.overflow = ""; }
  }

  // عرض الفواتير المحددة
  $("invGenerate").addEventListener("click", function () {
    var codes = [];
    document.querySelectorAll(".inv-chk:checked").forEach(function (c) { codes.push(c.getAttribute("data-code")); });
    if (!codes.length) return showMsg("⚠ حدّد أسرة واحدة على الأقل.", false);
    $("invOutput").innerHTML = '<div class="loading">جارٍ تحميل بيانات الفواتير…</div>';
    openInvModal();
    api("invoiceData", { families: codes, isNext: invIsNextMode }).then(function (r) {
      currentInvoicesLoaded = roundInvUp(r.invoices || []);
      renderInvoices(currentInvoicesLoaded);
    }).catch(function (e) {
      $("invOutput").innerHTML = '<div class="note">⚠ ' + esc(e.message) + "</div>";
    });
  });

  /* ---------- تسجيل دفعات الأسر المحدَّدة دفعة واحدة ---------- */
  (function () {
    var btn = $("invPayMark");
    if (!btn) return;
    var rows = [], busy = false;
    function todayStr() { var d = new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
    function modal() {
      var m = $("invPayModal");
      if (m) return m;
      m = document.createElement("div");
      m.id = "invPayModal";
      m.style.cssText = "position:fixed;top:0;right:0;bottom:0;left:0;z-index:1000;background:rgba(0,0,0,.55);display:none;overflow:auto;padding:16px;-webkit-overflow-scrolling:touch";
      m.innerHTML = '<div style="max-width:520px;margin:0 auto;background:var(--bg,#fff);border-radius:14px;padding:12px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><b>تسجيل دفعات الأسر المحدَّدة</b>' +
        '<button type="button" class="ghost small" id="ipClose">✕ إغلاق</button></div><div id="ipBody"></div></div>';
      document.body.appendChild(m);
      m.addEventListener("click", function (e) { if (e.target === m && !busy) close(); });
      $("ipClose").addEventListener("click", function () { if (!busy) close(); });
      return m;
    }
    function close() { var m = $("invPayModal"); if (m) { m.style.display = "none"; document.body.style.overflow = ""; } }
    function methodOpts(list, sel) { return list.map(function (x) { return "<option" + (x === sel ? " selected" : "") + ">" + esc(x) + "</option>"; }).join(""); }
    function build(methods) {
      var def = methods.indexOf("إنستاباي") !== -1 ? "إنستاباي" : methods[0];
      $("ipBody").innerHTML =
        '<div class="note">الدفعات عن شهر <b>' + esc(INV.month) + "</b>، وتُسجَّل في «سجل المدفوعات» ثم تُعلَّم الأسرة «أُرسلت» وتختفي من القائمة.</div>" +
        '<div class="row2"><div class="field"><label for="ipMethod">طريقة الدفع للجميع</label><select id="ipMethod" class="date-sel" style="width:100%">' + methodOpts(methods, def) + "</select></div>" +
        '<div class="field"><label for="ipDate">تاريخ الدفع</label><input id="ipDate" type="date" value="' + todayStr() + '" max="' + todayStr() + '" style="width:100%"></div></div>' +
        rows.map(function (r, i) {
          return '<div class="inv-family-row" style="cursor:default;flex-wrap:wrap;gap:6px" data-i="' + i + '"><span class="inv-fname"><b>' + esc(r.name) + "</b><br><small>" + esc(r.code) + '</small><div class="note" data-st="' + i + '" style="margin:2px 0 0"></div></span>' +
            '<input type="text" inputmode="decimal" class="ip-amt" data-i="' + i + '" value="' + r.amount + '" style="width:90px"> <small>' + esc(r.cur) + "</small>" +
            '<select class="date-sel ip-m" data-i="' + i + '" style="width:110px">' + methodOpts(methods, def) + "</select></div>";
        }).join("") +
        '<div class="actions"><button type="button" class="primary" id="ipGo">تسجيل ' + rows.length.toLocaleString("ar-EG") + " دفعة</button></div>";
      $("ipMethod").addEventListener("change", function () {
        document.querySelectorAll(".ip-m").forEach(function (s) { s.value = $("ipMethod").value; });
      });
      $("ipGo").addEventListener("click", run);
    }
    function setSt(i, t, ok) { var e = document.querySelector('[data-st="' + i + '"]'); if (e) { e.textContent = t; e.style.color = ok === false ? "var(--danger,#c62828)" : ok ? "var(--ok,#2e7d32)" : ""; } }
    function run() {
      if (busy) return;
      var date = $("ipDate").value;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return showMsg("⚠ اختر تاريخ الدفع.", false);
      var jobs = [];
      for (var i = 0; i < rows.length; i++) {
        var a = parseFloat(digits(document.querySelector('.ip-amt[data-i="' + i + '"]').value));
        if (!(a > 0)) return showMsg("⚠ مبلغ «" + rows[i].name + "» غير صحيح.", false);
        jobs.push({ i: i, amount: a, method: document.querySelector('.ip-m[data-i="' + i + '"]').value });
      }
      if (!confirm("تسجيل " + jobs.length + " دفعة بتاريخ " + date + "؟")) return;
      busy = true; $("ipGo").disabled = true; $("ipGo").textContent = "جارٍ التسجيل…";
      var done = [], skipped = 0, failed = 0, month = INV.month, isNext = invIsNextMode;
      (function next(k) {
        if (k >= jobs.length) return finish();
        var j = jobs[k], r = rows[j.i];
        setSt(j.i, "جارٍ التسجيل…");
        var tok = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
        (function attempt(n) {
          api("paySave", { familyId: r.code, amount: j.amount, month: month, method: j.method, notes: "", payToken: tok, date: date }).then(function () {
            done.push(r); setSt(j.i, "✓ سُجّلت", true); next(k + 1);
          }).catch(function (e) {
            var m = String(e.message || e);
            if (m.indexOf("BUSY:") === 0 && n < 4) return setTimeout(function () { attempt(n + 1); }, 6000);
            if (m.indexOf("DUP:") === 0) { skipped++; setSt(j.i, "تخطّيت: توجد دفعة بالمبلغ نفسه عن الشهر نفسه " + m.slice(4), false); }
            else { failed++; setSt(j.i, "⚠ " + m.replace(/^BUSY:\s*/, ""), false); }
            next(k + 1);
          });
        })(1);
      })(0);
      function finish() {
        var msg = "✓ سُجّلت " + done.length + " دفعة" + (skipped ? "، وتُخطّيت " + skipped + " مكررة" : "") + (failed ? "، وفشلت " + failed : "") + ".";
        function end() {
          busy = false; $("ipGo").disabled = false; $("ipGo").textContent = "إغلاق";
          var g = $("ipGo").cloneNode(true); $("ipGo").replaceWith(g); g.addEventListener("click", close);
          showMsg((failed ? "⚠ " : "") + msg, !failed);
          renderInvoiceList();
        }
        if (!done.length) return end();
        var fams = done.map(function (r) { return { code: r.code, name: r.name }; });
        api("sentMark", { month: month, isNext: isNext, families: fams }).then(function () {
          (INV.families || []).forEach(function (f) { if (done.some(function (r) { return String(r.code) === String(f.code); })) f.sent = true; });
          end();
        }).catch(function (e) { msg += " لكن تعذّر تعليمها «أُرسلت»: " + e.message; end(); });
      }
    }
    btn.addEventListener("click", function () {
      if (busy || !INV) return;
      rows = [];
      var skip = 0;
      document.querySelectorAll(".inv-chk:checked").forEach(function (c) {
        var f = (INV.families || []).filter(function (x) { return String(x.code) === c.getAttribute("data-code"); })[0];
        if (!f) return;
        if (!(f.remaining > 0)) { skip++; return; }
        rows.push({ code: f.code, name: f.name, amount: Math.round(f.remaining * 100) / 100, cur: f.currency || "ج" });
      });
      if (!rows.length) return showMsg(skip ? "⚠ الأسر المحدَّدة لا مستحق عليها." : "⚠ حدّد أسرة واحدة على الأقل.", false);
      modal().style.display = "block"; document.body.style.overflow = "hidden";
      $("ipBody").innerHTML = '<div class="loading">جارٍ التحميل…</div>';
      var go = PAY && PAY.methods ? Promise.resolve(PAY) : api("payInit", {}).then(function (d) { PAY = d; return d; });
      go.then(function (d) { build(d.methods || ["إنستاباي"]); if (skip) $("ipBody").insertAdjacentHTML("afterbegin", '<div class="note">استُبعدت ' + skip + " أسرة لا مستحق عليها.</div>"); })
        .catch(function (e) { $("ipBody").innerHTML = '<div class="note">⚠ ' + esc(e.message) + "</div>"; });
    });
  })();

  /* ---------- الفواتير الجاهزة (تُسجَّل تلقائيًا في تبويب «فواتير جاهزة») ---------- */
  var READY = [];
  function loadReady() {
    api("readyList", {}).then(function (r) { READY = r.ready || []; renderReady(); }).catch(function () {});
  }
  function renderReady() {
    var host = $("invReady");
    if (!host) {
      // على الشاشات العريضة تصير الفواتير الجاهزة عمودًا جانبيًا على يسار الصفحة، وعلى الجوال بطاقة عادية
      if (!document.getElementById("readyCss")) {
        var st = document.createElement("style"); st.id = "readyCss";
        st.textContent = "#invReady .inv-family-row{flex-wrap:wrap}#invReady .inv-rem{margin-inline-start:0}#invReady .actions{margin-top:8px}" +
          "@media (min-width:1100px){#aInvoices:not([hidden]){display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:14px;align-items:start}" +
          "#aInvoices>#invReady{grid-column:2;grid-row:1/span 3;position:sticky;top:10px;max-height:calc(100vh - 20px);overflow:auto;margin-bottom:0}" +
          "#aInvoices>#invOutput,#aInvoices>section.card:not(#invReady){grid-column:1}}" +
          "@media (max-width:1099px){#invReady{max-height:45vh;overflow:auto}}";
        document.head.appendChild(st);
      }
      $("aInvoices").insertAdjacentHTML("afterbegin", '<section class="card" id="invReady" hidden></section>'); host = $("invReady");
    }
    var tb = document.querySelector('[data-atab="invoices"]');
    if (tb) tb.textContent = "الفواتير" + (READY.length ? " (" + READY.length + ")" : "");
    host.hidden = !READY.length;
    if (!READY.length) { host.innerHTML = ""; return; }
    host.innerHTML = "<h2>فواتير جاهزة للإرسال (" + READY.length + ")</h2>" +
      '<div class="note">سُجّلت تلقائيًا عند انتهاء مجالس الأسرة أو بعد انتهاء الشهر. اضغط «تحديدها» لتظهر محدَّدة في القائمة، ثم اعرضها أو حمّلها صورًا.</div>' +
      READY.map(function (x) {
        return '<div class="inv-family-row"><span class="inv-fname">' + esc(x.name) + '</span><span class="note">' + esc(x.reason) + " — " + esc(x.month) + '</span><span class="inv-rem">' +
          (x.due > 0 ? "المطلوب " + fmt(x.due) + " " + esc(x.currency || "ج") : "لا مبلغ مستحق") + "</span></div>";
      }).join("") +
      '<div class="actions"><button type="button" class="primary small" id="readySel">تحديدها في القائمة</button> <button type="button" class="ghost small" id="readyDone">تم إرسالها</button></div>';
    $("readySel").addEventListener("click", function () {
      invIsNextMode = READY[READY.length - 1].mode === "next";
      var codes = READY.filter(function (x) { return x.mode === READY[READY.length - 1].mode; }).map(function (x) { return x.code; });
      // تظهر الأسر الجاهزة وحدها ومحدَّدة كلها
      invOnlyCodes = codes.map(String);
      loadInvoices(true).then(function () {
        document.querySelectorAll(".inv-chk").forEach(function (c) { c.checked = true; });
        updInvSel();
        $("invFamilyList").scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
    $("readyDone").addEventListener("click", function () {
      var ids = READY.map(function (x) { return x.id; });
      var sentCodes = READY.filter(function (x) { return (x.mode === "next") === invIsNextMode; }).map(function (x) { return String(x.code); });
      api("readyMark", { ids: ids }).then(function () {
        READY = []; renderReady();
        if (INV && INV.families) { INV.families.forEach(function (f) { if (sentCodes.indexOf(String(f.code)) !== -1) f.sent = true; }); invOnlyCodes = null; renderInvoiceList(); }
        showMsg("✓ سُجّلت الفواتير على أنها أُرسلت وأُخفيت من القائمة.", true);
      })
        .catch(function (e) { showMsg("⚠ " + e.message, false); });
    });
  }

  // تقريب «إجمالي الفاتورة» و«المطلوب دفعه» لأعلى جنيه صحيح (الفاتورة ذات المبلغ اليدوي تبقى كما هي)
  function roundInvUp(list) {
    var up = function (x) { return Math.ceil(Math.round(x * 100) / 100); };
    (list || []).forEach(function (inv) {
      var sm = inv && inv.summary;
      if (!sm || sm.manual || sm.roundedUp) return;
      var total = Number(sm.total) || 0, due = Number(sm.due) || 0;
      var nt = up(total), delta = nt - total;
      sm.total = nt;
      if (due > 0) sm.due = up(due + delta);
      sm.roundedUp = true;
    });
    return list;
  }

  function renderInvoices(invoices) {
    if (!invoices.length) { $("invOutput").innerHTML = '<div class="note">لا توجد بيانات.</div>'; return; }
    $("invOutput").innerHTML = invoices.map(function (inv, idx) { return buildInvoiceCard(inv, idx); }).join("");
    // توليد الـ QR Codes بعد بناء العناصر
    invoices.forEach(function (inv, idx) {
      generateInvQRs(idx);
    });
  }

  function generateInvQRs(idx) {
    if (typeof QRCode === "undefined") return;
    var ipnEl = $("qr_ipn_" + idx);
    var vdfEl = $("qr_vdf_" + idx);
    if (ipnEl && !ipnEl.hasChildNodes()) {
      new QRCode(ipnEl, { text: INSTAPAY_URL, width: 70, height: 70, correctLevel: QRCode.CorrectLevel.M });
    }
    if (vdfEl && !vdfEl.hasChildNodes()) {
      new QRCode(vdfEl, { text: "tel:" + VODAFONE_NUM, width: 70, height: 70, correctLevel: QRCode.CorrectLevel.M });
    }
  }

  function buildInvoiceCard(inv, idx) {
    idx = idx || 0;
    var cur = esc(inv.currency || "جنيه");
    var sm = inv.summary || {};

    // صفوف الطلاب
    var studRows = (inv.students || []).map(function (s) {
      return "<tr>" +
        "<td class='iname'>" + esc(s.name) + "</td>" +
        "<td class='inum'>" + (s.sessions || "—") + "</td>" +
        "<td class='inum'>" + (s.done != null ? s.done : "—") + "</td>" +
        "<td class='iamt'>" + fmt(s.amount) + " " + cur + "</td>" +
        "</tr>";
    }).join("");

    // ملخص مالي
    var prevRow = sm.prevCredit && sm.prevCredit !== 0
      ? '<div class="isum-row muted"><span>' + (sm.prevCredit < 0 ? "رصيد سابق لصالح الأسرة" : "رصيد سابق مستحق") + '</span><span class="inum-val ' + (sm.prevCredit < 0 ? "credit" : "") + '">' + (sm.prevCredit < 0 ? "﹢" : "") + fmt(Math.abs(sm.prevCredit)) + " " + cur + '</span></div>'
      : "";
    var arrRow = sm.arrears && sm.arrears > 0
      ? '<div class="isum-row muted"><span>متأخرات سابقة</span><span class="inum-val">' + fmt(sm.arrears) + " " + cur + '</span></div>'
      : "";
    var discRow = sm.discount && sm.discount > 0
      ? '<div class="isum-row muted"><span>خصم</span><span class="inum-val">−' + fmt(sm.discount) + " " + cur + '</span></div>'
      : "";
    var adjRow = sm.adjust
      ? '<div class="isum-row muted"><span>تعديل</span><span class="inum-val">' + (sm.adjust < 0 ? "−" : "+") + fmt(Math.abs(sm.adjust)) + " " + cur + '</span></div>'
      : "";
    var paidRow = sm.paid > 0
      ? '<div class="isum-row muted"><span>المدفوع</span><span class="inum-val">' + fmt(sm.paid) + " " + cur + '</span></div>'
      : "";

    return '<div class="inv-card" id="invCard_' + idx + '" style="max-width:440px;width:100%">' +
      // هيدر بلوجو
      '<div class="inv-card-head">' +
        '<div class="inv-head-logo">' +
          '<img src="https://ghiras-adab.com/wp-content/uploads/2026/10/ghiras-adab-logo-cropped.png" alt="غراس الأدب" class="inv-logo-img" style="transform:translateY(-6px);">' +
        '</div>' +
        '<div class="inv-head-divider"></div>' +
        '<div class="inv-head-info" style="padding-top:14px;">' +
          '<div class="inv-card-title">' + esc(inv.name) + '</div>' +
          '<div class="inv-card-meta">' + esc(inv.month || "") + '</div>' +
        '</div>' +
      '</div>' +
      // شريط الاستهلاك
      '<div class="inv-meta-strip">' +
        '<span class="inv-meta-lbl">تفاصيل المجالس</span>' +
      '</div>' +
      // جدول الطلاب
      '<div class="inv-card-body">' +
        '<table class="inv-tbl">' +
          '<thead><tr><th>الطالب</th><th>الباقة</th><th>المنتهية</th><th>قيمة الباقة</th></tr></thead>' +
          '<tbody>' + (studRows || '<tr><td colspan="4" class="inv-empty">لا توجد مجالس</td></tr>') + '</tbody>' +
        '</table>' +
        // ملخص
        '<div class="inv-summary-box">' +
          '<div class="isum-row"><span>إجمالي الفاتورة</span><span class="inum-val">' + fmt(sm.manual ? sm.due : sm.total) + " " + cur + '</span></div>' +
          (sm.manual ? "" : prevRow + arrRow + discRow + paidRow + adjRow) +
          (sm.due > 0
            ? '<div class="isum-row total"><span>المطلوب دفعه</span><span class="inum-val">' + fmt(sm.due) + " " + cur + '</span></div>'
            : sm.due < 0
              ? '<div class="isum-row total credit"><span>رصيد لصالحكم</span><span class="inum-val">' + fmt(Math.abs(sm.due)) + " " + cur + '</span></div>'
              : '<div class="isum-row total credit"><span>المطلوب دفعه</span><span class="inum-val">تم السداد</span></div>'
          ) +
          (sm.unusedCount > 0 && sm.due <= 0
            ? '<div class="isum-row muted"><span>متبقٍ من باقتكم السابقة: ' + sessionsWord(sm.unusedCount) + '</span><span class="inum-val">' + fmt(sm.unusedValue) + " " + cur + '</span></div>'
            : "") +
        '</div>' +
        // وسائل الدفع التفاعلية مع QR Codes
        '<div class="inv-pay-box">' +
          '<div class="inv-pay-title">وسائل الدفع المتاحة <span>(باسم: عمر شرف)</span></div>' +
          '<div class="inv-qr-row">' +
            '<div class="inv-qr-item ipn">' +
              '<div class="inv-qr-code" id="qr_ipn_' + idx + '"></div>' +
              '<div class="inv-qr-label">⚡ إنستاباي</div>' +
              '<div class="inv-qr-sub">امسح للدفع</div>' +
            '</div>' +
            '<div class="inv-qr-item vdf">' +
              '<div class="inv-qr-code" id="qr_vdf_' + idx + '"></div>' +
              '<div class="inv-qr-label">📱 فودافون كاش</div>' +
              '<div class="inv-qr-sub">' + VODAFONE_NUM + '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      // فوتر
      '<div class="inv-card-foot">' +
        '<span class="inv-foot-note">جزاكم الله خيراً على ثقتكم</span>' +
        '<div class="inv-foot-actions">' +
          '<button type="button" class="wa-inv-btn" onclick="copyAndSendWa(' + idx + ', this)"><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.117.554 4.103 1.523 5.828L0 24l6.336-1.498A11.95 11.95 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.015-1.378l-.36-.213-3.732.882.913-3.636-.234-.373A9.818 9.818 0 1112 21.818z"/></svg> نسخ وإرسال واتساب</button>' +
          '<button type="button" class="inv-btn-img" onclick="downloadCardImg(' + idx + ', this)">🖼️ حفظ صورة</button>' +
          '<button type="button" class="inv-print-btn" onclick="printInvCard(this)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6v-8z"/></svg> طباعة</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  // إرسال الفاتورة بالواتساب: تُنسخ الصورة للحافظة (حاسوبًا وموبايلًا) ثم تُفتح محادثة الأسرة لتلصقها،
  // وإن منع المتصفح النسخ فقائمة المشاركة ثم حفظ الصورة.
  window.copyAndSendWa = async function (idx, btn) {
    var inv = currentInvoicesLoaded[idx];
    if (!inv) return;
    var card = $("invCard_" + idx);
    var oldText = btn.innerHTML;
    var sm = inv.summary || {};
    var waMsg = "السلام عليكم ورحمة الله،\nمرفق فاتورة غراس الأدب لشهر " + (inv.month || "") + ".\nالمطلوب دفعه: " + fmt(Math.max(sm.due, 0)) + " " + (inv.currency || "جنيه") +
      "\n\nطرق الدفع (باسم عمر شرف):\n- إنستاباي: " + INSTAPAY_URL + "\n- فودافون كاش: " + VODAFONE_NUM;
    var waUrl = "https://wa.me/" + String(inv.waPhone || "").replace(/\D/g, "") + "?text=" + encodeURIComponent(waMsg);
    function done(txt) { btn.innerHTML = txt; setTimeout(function () { btn.innerHTML = oldText; }, 4500); }
    function openWa() { var w = window.open(waUrl, "_blank"); if (!w) location.href = waUrl; }
    if (typeof html2canvas === "undefined") { openWa(); return; }
    btn.innerHTML = "⏳ جاري تجهيز الصورة…";
    // الصورة تُسلَّم للحافظة كوعد (Promise) داخل نفس نقرة المستخدم، فيقبلها سفاري وكروم على الموبايل أيضًا
    var blobP = html2canvas(card, { scale: 2, useCORS: true, backgroundColor: "#ffffff" }).then(function (canvas) {
      return new Promise(function (res, rej) { canvas.toBlob(function (b) { b ? res(b) : rej(new Error("تعذّر إنشاء الصورة")); }, "image/png"); });
    });
    var clipP = null;
    if (navigator.clipboard && window.ClipboardItem) {
      try { clipP = navigator.clipboard.write([new ClipboardItem({ "image/png": blobP })]); } catch (err) { clipP = null; }
    }
    try {
      var blob = await blobP;
      var file = new File([blob], "فاتورة - " + inv.name + " - " + (inv.month || "") + ".png", { type: "image/png" });
      var copied = false;
      if (clipP) { try { await clipP; copied = true; } catch (err) { copied = false; } }
      if (copied) {
        openWa();
        return done("✅ نُسخت الصورة: الصقها في المحادثة");
      }
      // لم ينجح النسخ: على الموبايل قائمة المشاركة (صورة ونص)، وإلا تُحفظ الصورة وتُفتح المحادثة
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], text: waMsg });
          return done("✅ تمت المشاركة");
        } catch (err) {
          if (err && err.name === "AbortError") return done(oldText);
        }
      }
      if (typeof saveAs !== "undefined") saveAs(blob, file.name);
      openWa();
      done("⚠ لم تُنسخ الصورة، فحُفظت في جهازك. أرفقها من المعرض");
    } catch (e) {
      alert("تعذّر تجهيز الصورة: " + e.message);
      btn.innerHTML = oldText;
    }
  };

  // حفظ الفاتورة الفردية كصورة PNG
  window.downloadCardImg = async function (idx, btn) {
    var inv = currentInvoicesLoaded[idx];
    if (!inv || typeof html2canvas === "undefined") return;
    var card = $("invCard_" + idx);
    var oldText = btn.innerHTML;
    btn.innerHTML = "⏳ جاري التجهيز…";
    try {
      var canvas = await html2canvas(card, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
      canvas.toBlob(function (blob) {
        if (typeof saveAs !== "undefined") {
          saveAs(blob, "فاتورة - " + inv.name + " - " + (inv.month || "") + ".png");
        }
        btn.innerHTML = oldText;
      });
    } catch (e) {
      btn.innerHTML = oldText;
    }
  };

  // تحميل كل الفواتير المحددة في ملف مضغوط ZIP
  var invZipBulkBtn = $("invZipBulk");
  if (invZipBulkBtn) invZipBulkBtn.addEventListener("click", async function () {
    var codes = [];
    document.querySelectorAll(".inv-chk:checked").forEach(function (c) { codes.push(c.getAttribute("data-code")); });
    if (!codes.length) return showMsg("⚠ حدّد أسرة واحدة على الأقل للتحميل.", false);

    var btn = invZipBulkBtn;
    var oldText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = "⏳ جلب الفواتير…";

    try {
      var r = await api("invoiceData", { families: codes, isNext: invIsNextMode });
      var invoices = roundInvUp(r.invoices || []);
      if (!invoices.length) throw new Error("لا توجد فواتير لتنزيلها");

      var zip = new JSZip();
      var temp = document.createElement("div");
      temp.style.position = "fixed"; temp.style.left = "-9999px"; temp.style.top = "0";
      document.body.appendChild(temp);

      for (var i = 0; i < invoices.length; i++) {
        var inv = invoices[i];
        btn.innerHTML = "⏳ تجهيز صورة (" + (i + 1) + "/" + invoices.length + ")…";
        temp.innerHTML = buildInvoiceCard(inv, "zip_" + i);
        generateInvQRs("zip_" + i);

        var cardEl = temp.querySelector(".inv-card");
        var canvas = await html2canvas(cardEl, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
        var blob = await new Promise(function (resolve) { canvas.toBlob(resolve, "image/png"); });
        var safeName = (inv.name || inv.code).replace(/[/\\?%*:|"<>]/g, "_");
        zip.file("فاتورة - " + safeName + " - " + (inv.month || "") + ".png", blob);
      }

      document.body.removeChild(temp);
      btn.innerHTML = "⏳ ضغط ملفات ZIP…";
      var zipContent = await zip.generateAsync({ type: "blob" });
      saveAs(zipContent, "فواتير_غراس_الأدب_" + (r.month || "شهر") + ".zip");
      btn.innerHTML = oldText;
      btn.disabled = false;
      showMsg("✅ تم تنزيل ملف ZIP بنجاح!", true);
    } catch (e) {
      alert("خطأ أثناء إنشاء ملف ZIP: " + e.message);
      btn.innerHTML = oldText;
      btn.disabled = false;
    }
  });

  /* ---------------- طباعة الفاتورة ---------------- */
  window.printInvCard = function printInvCard(btn) {
    var card = btn.closest(".inv-card");
    if (!card) return;
    // جمع كل الـ CSS
    var css = "";
    Array.from(document.styleSheets).forEach(function(sheet) {
      try { Array.from(sheet.cssRules || []).forEach(function(r){ css += r.cssText + "\n"; }); } catch(e) {}
    });
    // نسخة من الكارد بدون فوتر
    var clone = card.cloneNode(true);
    var foot = clone.querySelector(".inv-card-foot");
    if (foot) foot.remove();
    // iframe مخفي في نفس الصفحة (لا popup blocker)
    var old = document.getElementById("__inv_print_frame");
    if (old) old.remove();
    var iframe = document.createElement("iframe");
    iframe.id = "__inv_print_frame";
    iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:720px;height:900px;border:0;visibility:hidden;";
    document.body.appendChild(iframe);
    var doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(
      '<!DOCTYPE html><html lang="ar" dir="rtl"><head>' +
      '<meta charset="utf-8">' +
      '<style>' + css + '</style>' +
      '<style>' +
      'body{margin:0;padding:24px;background:#fff;}' +
      '.inv-card{max-width:100%!important;box-shadow:none!important;margin:0!important;}' +
      '@page{margin:10mm; size: A4;}' +
      '</style>' +
      '</head><body>' + clone.outerHTML + '</body></html>'
    );
    doc.close();
    setTimeout(function() {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    }, 300);
  }

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
