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
    var isLong = action === "evalRegister";   // تسجيل الطالب المقيَّم قد يستغرق دقيقة
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
        if (e && e.name === "AbortError") throw new Error(isLong ? "لم يصل الرد بعد. قد يكون التسجيل قد تم، فحدّث قائمة التقييمات قبل إعادة المحاولة." : "لم يصل رد من الخادم. تحقق من الاتصال وأعد المحاولة.");
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

  document.querySelectorAll("[data-atab]").forEach(function (b) {
    b.addEventListener("click", function () {
      var t = b.getAttribute("data-atab");
      document.querySelectorAll("[data-atab]").forEach(function (x) { x.classList.toggle("on", x === b); });
      var own = t === "arch" || t === "evals" || t === "invoices" || t === "holidays";
      $("aSum").hidden = own; $("aArch").hidden = t !== "arch"; $("aEvals").hidden = t !== "evals"; $("aInvoices").hidden = t !== "invoices"; $("aHol").hidden = t !== "holidays";
      if (t === "holidays") loadHolidays();
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
    invIsNextMode = false; invOnlyCodes = null;
    loadInvoices(true);
  });
  if (tabNextBtn) tabNextBtn.addEventListener("click", function () {
    if (invIsNextMode) return;
    invIsNextMode = true; invOnlyCodes = null;
    loadInvoices(true);
  });

  // البحث في الأسر
  var invSearchInput = $("invSearch");
  if (invSearchInput) invSearchInput.addEventListener("input", renderInvoiceList);
  // الأسر التي أُرسلت فواتيرها تُخفى افتراضيًا، ويُظهرها هذا الخيار
  var invShowSentChk = $("invShowSent");
  if (invShowSentChk) invShowSentChk.addEventListener("change", renderInvoiceList);

  function renderInvoiceList() {
    if (!INV || !INV.families) return;
    var q = invSearchInput ? invSearchInput.value.trim() : "";
    var only = invOnlyCodes;
    var showSent = !!(invShowSentChk && invShowSentChk.checked), hiddenSent = 0;
    var html = INV.families.filter(function (f) {
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
    var banner = only
      ? '<div class="note">المعروض: الفواتير الجاهزة فقط (' + only.length + ') <button type="button" class="link-btn" id="invShowAll">عرض كل الأسر</button></div>'
      : "";
    if (hiddenSent) banner += '<div class="note">أُخفيت ' + hiddenSent + ' أسرة أُرسلت فواتيرها (تظهر بخيار «إظهار المرسلة»).</div>';
    $("invFamilyList").innerHTML = banner + (html || '<div class="note">لا توجد أسر مطابقة.</div>');
    if (only) $("invShowAll").addEventListener("click", function () { invOnlyCodes = null; renderInvoiceList(); });
  }

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
  });

  // تحديد المستحقين فقط
  var invSelDueBtn = $("invSelDue");
  if (invSelDueBtn) invSelDueBtn.addEventListener("click", function () {
    var chks = document.querySelectorAll(".inv-chk");
    chks.forEach(function (c) {
      var rem = Number(c.getAttribute("data-rem") || 0);
      c.checked = rem > 0;
    });
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
      currentInvoicesLoaded = r.invoices || [];
      renderInvoices(currentInvoicesLoaded);
    }).catch(function (e) {
      $("invOutput").innerHTML = '<div class="note">⚠ ' + esc(e.message) + "</div>";
    });
  });

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
          '<div class="isum-row"><span>إجمالي الفاتورة</span><span class="inum-val">' + fmt(sm.total) + " " + cur + '</span></div>' +
          prevRow +
          arrRow +
          discRow +
          paidRow +
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
          '<button type="button" class="wa-inv-btn" onclick="copyAndSendWa(' + idx + ', this)"><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.117.554 4.103 1.523 5.828L0 24l6.336-1.498A11.95 11.95 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.015-1.378l-.36-.213-3.732.882.913-3.636-.234-.373A9.818 9.818 0 1112 21.818z"/></svg> نسخ وإرسال واتساب (Ctrl+V)</button>' +
          '<button type="button" class="inv-btn-img" onclick="downloadCardImg(' + idx + ', this)">🖼️ حفظ صورة</button>' +
          '<button type="button" class="inv-print-btn" onclick="printInvCard(this)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6v-8z"/></svg> طباعة</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  // نسخ الصورة تلقائياً للحافظة + فتح محادثة الواتساب
  window.copyAndSendWa = async function (idx, btn) {
    var inv = currentInvoicesLoaded[idx];
    if (!inv) return;
    var card = $("invCard_" + idx);
    var oldText = btn.innerHTML;
    btn.innerHTML = "⏳ جاري نسخ الصورة…";

    try {
      if (typeof html2canvas !== "undefined") {
        var canvas = await html2canvas(card, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
        canvas.toBlob(async function (blob) {
          if (navigator.clipboard && window.ClipboardItem) {
            try {
              await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
            } catch (err) { console.log("Clipboard write failed", err); }
          }

          var sm = inv.summary || {};
          var waMsg = "السلام عليكم ورحمة الله،\nمرفق فاتورة غراس الأدب لشهر " + (inv.month || "") + ".\nالمطلوب دفعه: " + fmt(Math.max(sm.due, 0)) + " " + (inv.currency || "جنيه") +
            "\n\nطرق الدفع (باسم عمر شرف):\n- إنستاباي: " + INSTAPAY_URL + "\n- فودافون كاش: " + VODAFONE_NUM;
          var waUrl = "https://wa.me/" + String(inv.waPhone || "").replace(/\D/g, "") + "?text=" + encodeURIComponent(waMsg);
          window.open(waUrl, "_blank");

          btn.innerHTML = "✅ تم نسخ الصورة! الصقها (Ctrl+V) في الشات";
          setTimeout(function () { btn.innerHTML = oldText; }, 3500);
        });
      } else {
        var sm = inv.summary || {};
        var waMsg = "السلام عليكم ورحمة الله،\nمرفق فاتورة غراس الأدب لشهر " + (inv.month || "") + ".\nالمطلوب دفعه: " + fmt(Math.max(sm.due, 0)) + " " + (inv.currency || "جنيه");
        var waUrl = "https://wa.me/" + String(inv.waPhone || "").replace(/\D/g, "") + "?text=" + encodeURIComponent(waMsg);
        window.open(waUrl, "_blank");
        btn.innerHTML = oldText;
      }
    } catch (e) {
      alert("تعذر نسخ الصورة: " + e.message);
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
      var invoices = r.invoices || [];
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
