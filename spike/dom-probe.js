/*
 * MeetFa DOM Probe — اجرای spike روی جلسه واقعی
 * روش: داخل جلسه Meet، CC را روشن کنید → F12 → Console → کل این فایل را paste و Enter.
 * ۶۰ ثانیه صحبت کنید. گزارش JSON خودکار در clipboard کپی می‌شود (متن‌ها کوتاه/ماسک شده‌اند).
 */
(() => {
  const DURATION = 60_000;
  const mask = (t) => (t || '').trim().slice(0, 40);
  const labelsOf = (sel) =>
    [...document.querySelectorAll(sel)].map((e) => e.getAttribute('aria-label')).filter(Boolean);

  const skeleton = (el, depth = 0, max = 6) => {
    if (!el || depth > max) return null;
    return {
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role') || undefined,
      aria: el.getAttribute('aria-label') || undefined,
      jsname: el.getAttribute('jsname') || undefined,
      hasImg: el.tagName === 'IMG' || undefined,
      ownText: mask([...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('')) || undefined,
      children: [...el.children].slice(0, 8).map((c) => skeleton(c, depth + 1, max)),
    };
  };

  const report = {
    when: new Date().toISOString(),
    uiLang: document.documentElement.lang,
    userAgent: navigator.userAgent,
    regions: labelsOf('[role="region"][aria-label]'),
    captionRelatedButtons: labelsOf('button[aria-label]').filter((l) => /caption|subtitle|زیرنویس/i.test(l)),
    leaveButtons: labelsOf('button[aria-label]').filter((l) => /leave|ترک|خروج/i.test(l)),
    region: null,
    skeleton: null,
    mutations: { count: 0, childList: 0, characterData: 0 },
    blockHistory: [],
  };

  const norm = (x) => (x || '').replace(/\u200c/g, ' ').trim().toLowerCase();
  const want = ['Captions', 'زیرنویس‌ها', 'زیرنویس ها', 'زیرنویس'].map(norm);
  const region =
    [...document.querySelectorAll('[role="region"][aria-label]')].find((e) => want.includes(norm(e.getAttribute('aria-label')))) ||
    [...document.querySelectorAll('[aria-label]')].find((e) => want.includes(norm(e.getAttribute('aria-label'))));

  if (!region) {
    console.warn('[MeetFa probe] ناحیه زیرنویس با برچسب‌های فعلی پیدا نشد. regions:', report.regions);
    copy(JSON.stringify(report, null, 2));
    return;
  }
  report.region = { role: region.getAttribute('role'), aria: region.getAttribute('aria-label') };
  report.skeleton = skeleton(region);

  // تاریخچه متن هر بلوک (عنصر دارای img) برای تحلیل رشد/اصلاح/حذف ابتدا
  const ids = new WeakMap(); let next = 0;
  const hist = new Map();
  const snap = () => {
    region.querySelectorAll('img').forEach((img) => {
      let b = img.parentElement;
      while (b && b !== region && b.innerText.trim().split('\n').filter(Boolean).length < 2) b = b.parentElement;
      if (!b || b === region) return;
      if (!ids.has(b)) ids.set(b, next++);
      const id = ids.get(b);
      const [speaker, ...rest] = b.innerText.trim().split('\n').filter(Boolean);
      const text = rest.join(' ');
      const h = hist.get(id) || { id, speaker: mask(speaker), versions: [] };
      const last = h.versions[h.versions.length - 1];
      if (!last || last.text !== text) h.versions.push({ t: Date.now(), len: text.length, text: text.slice(-80) });
      hist.set(id, h);
    });
  };

  const mo = new MutationObserver((list) => {
    report.mutations.count += list.length;
    list.forEach((m) => (report.mutations[m.type] = (report.mutations[m.type] || 0) + 1));
    snap();
  });
  mo.observe(region, { childList: true, subtree: true, characterData: true });
  console.log('[MeetFa probe] در حال ضبط ساختار برای ۶۰ ثانیه… صحبت کنید.');

  setTimeout(() => {
    mo.disconnect();
    report.blockHistory = [...hist.values()].map((h) => ({ ...h, versions: h.versions.slice(0, 40) }));
    copy(JSON.stringify(report, null, 2));
    console.log('[MeetFa probe] تمام شد. گزارش در clipboard کپی شد. آن را برای Developer بفرستید.', report);
  }, DURATION);
})();
