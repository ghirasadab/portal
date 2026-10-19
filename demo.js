/* وضع العرض التجريبي: يعمل عند فتح البوابة بـ ?demo=1، ببيانات وهمية لا تتصل بأي شيت. */
(function () {
  if (!/[?&]demo=(1|admin)/.test(location.search)) return;
  var ADMIN_DEMO = /[?&]demo=admin/.test(location.search);
  var today = new Date(), y = today.getFullYear(), mo = today.getMonth();
  var months = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
  var wds = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  function key(d) { return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  var n = new Date(y, mo + 1, 0).getDate(), dates = [];
  for (var i = 1; i <= n; i++) { var d = new Date(y, mo, i); dates.push({ key: key(d), weekday: wds[d.getDay()] }); }
  var tw = wds[today.getDay()];
  function cells(pattern) { return dates.map(function (d, i) { return i < today.getDate() - 1 && pattern(i) ? [pattern(i), "done"] : ["", ""]; }); }
  var EVALS = [{ id: "ت.1", date: "2026-10-18", teacher: "أ. معلمة تجريبية", name: "طالبة مقيَّمة", gender: "أنثى", age: "10 سنوات", category: "أدب", report: "تقرأ قراءة جيدة مع أخطاء قليلة في الضبط.\nيُقترح لها مجموعة الأدب المتوسطة.", status: "جديد" }];
  var DATA = { hasEval: true, evals: {},
    teacher: "أ. معلم تجريبي", onLeave: false, today: key(today), todayWeekday: tw,
    months: [months[mo] + " " + y], month: months[mo] + " " + y, dates: dates,
    statuses: [
      { key: "done", label: "حضر", minutes: true, color: "" },
      { key: "makeup", label: "تعويض", minutes: true, color: "#69db7b" },
      { key: "absent", label: "غياب دون تنبيه", minutes: true, color: "#ff6b6b" },
      { key: "pTeacher", label: "تأجيل من المعلم", minutes: false, color: "#ffa94d" },
      { key: "pStudent", label: "تأجيل من الطالب", minutes: false, color: "#74c0fc" },
      { key: "holiday", label: "عطلة عامة", minutes: false, color: "#adb5bd" },
      { key: "ended", label: "انتهت مجالس الشهر", minutes: false, color: "#b096fb" }
    ],
    units: [
      { type: "single", cat: "مجلس فردي", days: tw, key: "S:ط.9001", title: "طالب تجريبي أول",
        members: [{ col: 4, name: "طالب تجريبي أول", code: "ط.9001", parent: "ولي أمر تجريبي", cells: cells(function (i) { return i % 7 === 2 ? 60 : 0; }) }] },
      { type: "group", cat: "مجموعة أدب", days: tw + " والخميس", key: "G:ط.9002+ط.9003+ط.9004", title: "طالبة أولى، طالبة ثانية، طالبة ثالثة",
        members: [
          { col: 5, name: "طالبة أولى", code: "ط.9002", parent: "أسرة تجريبية", cells: cells(function (i) { return i % 7 === 3 ? 30 : 0; }) },
          { col: 6, name: "طالبة ثانية", code: "ط.9003", parent: "أسرة تجريبية", cells: cells(function (i) { return i % 7 === 3 ? 20 : 0; }) },
          { col: 7, name: "طالبة ثالثة", code: "ط.9004", parent: "أسرة ثانية", cells: cells(function (i) { return i % 7 === 3 ? 10 : 0; }) }] },
      { type: "single", cat: "مجلس تأسيس", days: "السبت", key: "S:ط.9005", title: "طالب تأسيس",
        members: [{ col: 8, name: "طالب تأسيس", code: "ط.9005", parent: "أسرة ثالثة", cells: cells(function (i) { return i % 7 === 6 ? 45 : 0; }) }] }
    ],
    lastReports: { "S:ط.9001": { date: dates[0].key, studied: "قصيدة «الأطلال» — الأبيات الخمسة الأولى.", performance: "", notes: "", homework: "حفظ الأبيات الخمسة.", individual: "" } }
  };
  var reports = {};
  window.PORTAL_DEMO = function (p) {
    return new Promise(function (ok) {
      setTimeout(function () {
        if (ADMIN_DEMO && !p.as) {
          if (p.action === "init") return ok({ ok: true, admin: true, adminHome: true, today: key(today), todayWeekday: tw, months: [DATA.month],
            teachers: [{ name: "أ. معلم تجريبي", allowWrite: true }, { name: "أ. معلمة تجريبية", allowWrite: true, onLeave: true }] });
          if (p.action === "overview") return ok({ ok: true, month: DATA.month, isCurrent: true, today: key(today), todayWeekday: tw, updated: key(today) + " 18:40",
            money: { label: DATA.month, financialMonth: DATA.month,
              report: { income: 146638, salaries: 40628, expenses: 40628, familiesCredit: 76034, net: 29975, incomeUsd: 50, familiesCreditUsd: 50 },
              families: { egp: { invoices: 168000, paid: 144838, due: 23162, credit: 9100, families: 176, unpaid: 21, partial: 6 },
                usd: { invoices: 75, paid: 50, due: 25, credit: 0, families: 3, unpaid: 1, partial: 0 } } },
            teachers: [
              { name: "أ. معلم تجريبي", ok: true, sessions: 46, hours: 34, evaluations: 2, bonus: 0, salary: 2380, beforeBonus: 2380, bonusLimit: 60, bonusValue: 250, counts: { done: 40, makeup: 4, absent: 2, pTeacher: 1, pStudent: 3 }, lastRecord: key(today), today: { scheduled: 3, recorded: 2, extra: 0, pending: ["طالب تأسيس"] } },
              { name: "أ. معلمة تجريبية", ok: true, onLeave: true, sessions: 29, hours: 31.08, evaluations: 0, bonus: 250, salary: 3435.83, beforeBonus: 3185.83, bonusLimit: 25, bonusValue: 250, counts: { done: 27, makeup: 2, absent: 0, pTeacher: 0, pStudent: 1 }, lastRecord: dates[Math.max(0, today.getDate() - 9)].key, today: { scheduled: 2, recorded: 0, extra: 0, pending: ["مجموعة أدب: طالبة أولى، طالبة ثانية", "طالبة رابعة"] } },
              { name: "أ. معلم ثالث", ok: false, error: "لا يوجد تبويب «" + DATA.month + "»" }
            ] });
          if (p.action === "evals") return ok({ ok: true, teachers: ["أ. معلم تجريبي", "أ. معلمة تجريبية"], evals: EVALS });
          if (p.action === "assignEval") return ok({ ok: true, saved: true });
          if (p.action === "search") return ok({ ok: true, reports: [{ date: key(today), teacher: "أ. معلم تجريبي", unit: "طالب تجريبي أول", status: "حضر", minutes: "60", studied: "قصيدة الأطلال.", homework: "حفظ خمسة أبيات.", by: "المعلم" }] });
        }
        if (p.action === "init") return ok(JSON.parse(JSON.stringify(Object.assign({ ok: true, admin: ADMIN_DEMO }, DATA, ADMIN_DEMO ? { teacher: p.as } : {}))));
        if (p.action === "stats") return ok({ ok: true, stats: { ok: true, name: p.as || "أ. معلم تجريبي", month: DATA.month, sessions: 46, hours: 34, evaluations: 2, salary: 2380, bonus: 0, bonusLimit: 60,
          counts: { done: 40, makeup: 4, absent: 2, pTeacher: 1, pStudent: 3 },
          list: [{ name: "طالب تجريبي أول", code: "ط.9001", done: 8, makeup: 1, absent: 0, pTeacher: 0, pStudent: 1, minutes: 540, last: key(today) },
            { name: "طالبة ثانية", code: "ط.9003", done: 5, makeup: 0, absent: 2, pTeacher: 1, pStudent: 2, minutes: 300, last: dates[Math.max(0, today.getDate() - 6)].key },
            { name: "طالب تأسيس", code: "ط.9005", done: 0, makeup: 0, absent: 0, pTeacher: 0, pStudent: 0, minutes: 0, last: "" }] } });
        if (p.action === "evaluation") { DATA.evals = DATA.evals || {}; DATA.evals[p.date] = Number(p.count) || ""; return ok({ ok: true, saved: true, date: p.date, count: Number(p.count) || 0 }); }
        if (p.action === "addEval") { DATA.evals[p.date] = (Number(DATA.evals[p.date]) || 0) + 1; EVALS.unshift({ id: "ت." + Date.now(), date: p.date, teacher: "أ. معلم تجريبي", name: p.name, gender: p.gender, age: p.age, category: p.category, report: p.report, status: "جديد" }); return ok({ ok: true, saved: true, count: DATA.evals[p.date] }); }
        if (p.action === "history") return ok({ ok: true, reports: reports[p.unitKey] || [] });
        if (p.action === "save") {
          var colors = {}; DATA.statuses.forEach(function (s) { colors[s.key] = s; });
          var out = {};
          p.members.forEach(function (m) { out[m.col] = [colors[m.status].minutes ? Number(m.minutes) : "", m.status]; });
          if (p.report) (reports[p.unitKey] = reports[p.unitKey] || []).unshift(Object.assign({ date: p.date, status: "حضر" }, p.report));
          return ok({ ok: true, saved: true, cells: out, reportSaved: !!p.report && Object.keys(p.report).some(function (k) { return String(p.report[k] || "").trim(); }) });
        }
      }, 300);
    });
  };
})();
