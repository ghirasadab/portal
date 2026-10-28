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
  function fmt(d) { return ("0" + d.getDate()).slice(-2) + "/" + ("0" + (d.getMonth() + 1)).slice(-2) + "/" + d.getFullYear(); }
  var PAYS = { fams: [
      { id: "س.0001", name: "ولي أمر تجريبي", invoice: 600, previous: 0, paid: 0, remaining: 600, status: "لم يدفع", usd: false, payments: [] },
      { id: "س.0002", name: "أسرة تجريبية", invoice: 900, previous: 50, paid: 400, remaining: 550, status: "دفع جزئي", usd: false, payments: [{ date: "05/10/2026", amount: 400, month: DATA.month, method: "فودافون كاش", notes: "" }] },
      { id: "س.0003", name: "أسرة ثانية", invoice: 40, previous: 0, paid: 0, remaining: 40, status: "لم يدفع", usd: true, payments: [] }],
    find: function (id) { return PAYS.fams.filter(function (f) { return f.id === id; })[0]; },
    status: function (id) { var f = PAYS.find(id); return { ok: true, id: id, found: true, name: f.name, invoice: f.invoice, paid: f.paid, remaining: f.remaining, previous: f.previous, status: f.status, usd: f.usd, payments: f.payments.slice(0, 5) }; } };
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
          if (p.action === "evalSetup") return ok({ ok: true, families: [{ id: "س.0001", name: "ولي أمر تجريبي" }], teachers: ["أ. معلم تجريبي", "أ. معلمة تجريبية"] });
          if (p.action === "evalTeacherInfo") return ok({ ok: true, groups: [{ start: 6, label: "مجموعة أدب: طالبة أولى، طالبة ثانية" }], singles: [{ code: "ط.9001", label: "طالب تجريبي أول (ط.9001) — مجلس فردي" }] });
          if (p.action === "evalRegister") return ok({ ok: true, code: "ط.9100", familyId: "س.0002", existed: false, filled: [], message: "✓ " + p.name + " أُضيف إلى " + p.teacher + "\n\"" + DATA.month + "\": أُضيف في العمود H" });
          if (p.action === "assignEval") return ok({ ok: true, saved: true });
          if (p.action === "stCall") {
            var a = p.arg || {};
            if (p.fn === "getTeacherStatusData") return ok({ ok: true, result: { month: DATA.month, teachers: [{ name: "أ. معلم تجريبي", state: "active", students: ["طالب تجريبي أول"] }, { name: "أ. معلمة تجريبية", state: "leave", students: ["طالبة أولى", "طالبة ثانية"] }] } });
            if (p.fn === "inspectStudent") return ok({ ok: true, result: { verdict: { level: "green", text: "نشط ويحضر بانتظام", curAttended: 4 }, mainActive: true, month: DATA.month, pkg: 8,
              warnings: [], places: [{ teacher: "أ. معلم تجريبي", month: DATA.month, days: "الأحد", attended: 4, last: "26/10" }], events: [{ date: "26/10", kind: "حضر", note: "", teacher: "أ. معلم تجريبي", minutes: 60 }],
              log: [], scope: "quick", checked: 1, total: 2, failed: [] } });
            return ok({ ok: true, result: { message: "✓ تم (" + p.fn + ") " + (a.code || a.fid || a.name || "") } });
          }
          if (p.action === "stuData") return ok({ ok: true, month: DATA.month, teachers: ["أ. معلم تجريبي", "أ. معلمة تجريبية"],
            families: [{ id: "س.0001", name: "ولي أمر تجريبي", price: 125 }, { id: "س.0002", name: "أسرة تجريبية", price: 100 }],
            students: [{ code: "ط.9001", name: "طالب تجريبي أول", parent: "ولي أمر تجريبي", fid: "س.0001", price: 125, teachers: "أ. معلم تجريبي", active: true },
              { code: "ط.9002", name: "طالبة أولى", parent: "أسرة تجريبية", fid: "س.0002", price: 100, teachers: "أ. معلمة تجريبية", active: true, pkg: 8, used: 3 },
              { code: "ط.9003", name: "طالبة ثانية", parent: "أسرة تجريبية", fid: "س.0002", price: 100, teachers: "", active: false, lastPkg: 8 }] });
          if (p.action === "stuTeacherInfo") return ok({ ok: true, hasStudent: p.code === "ط.9001" && p.teacher === "أ. معلم تجريبي", groups: [{ start: 6, label: "مجموعة أدب: طالبة أولى، طالبة ثانية" }], singles: [{ code: "ط.9001", label: "طالب تجريبي أول (ط.9001) — مجلس فردي" }] });
          if (p.action === "stuRegister") return ok({ ok: true, reg: { code: "ط.9100", name: p.name, parent: p.newFamily ? "أ. " + p.parent : p.parent, familyId: p.newFamily ? "س.0300" : "س.0002", price: p.price,
            firstMonth: p.startDate && p.firstDays ? { applies: true, sessions: 3, monthly: Number(p["package"]), total: 3 * Number(p.price) } : null, evalFee: p.evalFee ? Number(p.evalFee) : 0 },
            message: p.teacher ? "✓ " + p.name + " أُضيف إلى " + p.teacher + "\n\"" + DATA.month + "\": أُضيف في العمود H" : "" });
          if (p.action === "stuAdd" || p.action === "stuMove") return ok({ ok: true, message: "✓ تم: " + p.code + (p.action === "stuMove" ? " نُقل من " + p.fromTeacher : " أُضيف") + " إلى " + p.teacher });
          if (p.action === "payInit") return ok({ ok: true, currentMonth: DATA.month, firstMonthNote: false, months: [DATA.month], methods: ["فودافون كاش", "إنستاباي", "تحويل بنكي", "نقدًا"],
            families: [{ id: "س.0001", name: "ولي أمر تجريبي", kids: "طالب تجريبي أول" }, { id: "س.0002", name: "أسرة تجريبية", kids: "طالبة أولى، طالبة ثانية" }, { id: "س.0003", name: "أسرة ثانية", kids: "طالبة ثالثة" }] });
          if (p.action === "payDue") return ok({ ok: true, list: PAYS.fams.filter(function (f) { return f.remaining > 0; }).map(function (f) { return { id: f.id, name: f.name, invoice: f.invoice, paid: f.paid, remaining: f.remaining, previous: f.previous, status: f.status, none: f.paid === 0, usd: f.usd }; }) });
          if (p.action === "payStatus") return ok(PAYS.status(p.familyId));
          if (p.action === "paySave" && !p.force && PAYS.find(p.familyId).payments.some(function (x) { return x.month === p.month && x.amount === Number(p.amount); })) return ok(Promise.reject(new Error("DUP:بتاريخ 05/10/2026")));
          if (p.action === "paySave") { var pf = PAYS.find(p.familyId); pf.paid += Number(p.amount); pf.remaining = Math.max(0, pf.invoice + pf.previous - pf.paid); pf.status = pf.remaining ? "دفع جزئي" : "تم السداد";
            pf.payments.unshift({ date: fmt(today), amount: Number(p.amount), month: p.month, method: p.method, notes: p.notes }); return ok(PAYS.status(p.familyId)); }
          if (p.action === "search") return ok({ ok: true, reports: [{ date: key(today), teacher: "أ. معلم تجريبي", unit: "طالب تجريبي أول", status: "حضر", minutes: "60", studied: "قصيدة الأطلال.", homework: "حفظ خمسة أبيات.", by: "المعلم" }] });
        }
        if (p.action === "init") {
          var sch = {}; sch[key(today)] = [{ from: "17:00", to: "18:00", mins: 60, title: DATA.units[1].title, kind: "session", unitKey: DATA.units[1].key },
            { from: "15:00", to: "15:45", mins: 45, title: DATA.units[0].title, kind: "session", unitKey: DATA.units[0].key },
            { from: "18:30", to: "19:00", mins: 30, title: "تقييم يوسف علي", kind: "eval", name: "يوسف علي" },
            { from: "19:00", to: "20:00", mins: 60, title: "مجلس مريم", kind: "session" }];
          return ok(JSON.parse(JSON.stringify(Object.assign({ ok: true, admin: ADMIN_DEMO, schedule: sch }, DATA, ADMIN_DEMO ? { teacher: p.as } : {}))));
        }
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
