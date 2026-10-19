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
  var DATA = {
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
              report: { income: 144838, salaries: 39626, expenses: 39626, familiesCredit: 78035, net: 27178 },
              families: { invoices: 168000, paid: 144838, due: 23162, credit: 9100, families: 180, unpaid: 21, partial: 6 } },
            teachers: [
              { name: "أ. معلم تجريبي", ok: true, sessions: 46, hours: 34, evaluations: 2, bonus: 0, salary: 2380, lastRecord: key(today), today: { scheduled: 3, recorded: 2, extra: 0, pending: ["طالب تأسيس"] } },
              { name: "أ. معلمة تجريبية", ok: true, onLeave: true, sessions: 29, hours: 31.08, evaluations: 0, bonus: 250, salary: 3435.83, lastRecord: dates[Math.max(0, today.getDate() - 9)].key, today: { scheduled: 2, recorded: 0, extra: 0, pending: ["مجموعة أدب: طالبة أولى، طالبة ثانية", "طالبة رابعة"] } },
              { name: "أ. معلم ثالث", ok: false, error: "لا يوجد تبويب «" + DATA.month + "»" }
            ] });
          if (p.action === "search") return ok({ ok: true, reports: [{ date: key(today), teacher: "أ. معلم تجريبي", unit: "طالب تجريبي أول", status: "حضر", minutes: "60", studied: "قصيدة الأطلال.", homework: "حفظ خمسة أبيات.", by: "المعلم" }] });
        }
        if (p.action === "init") return ok(JSON.parse(JSON.stringify(Object.assign({ ok: true, admin: ADMIN_DEMO }, DATA, ADMIN_DEMO ? { teacher: p.as } : {}))));
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
