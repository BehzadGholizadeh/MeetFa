// Step 0 spike test content. Synthetic only — no real meeting data.
export const META = { title: 'جلسهٔ آزمایشی MeetFa — Spike Step 0', date: '۲۴ مهر ۱۴۰۵ (16 Oct 2026)', time: '۱۴:۳۰–۱۵:۱۰' };

// Each turn: speaker, time, paragraphs (strings). Exact text the reader must see.
export const CHECK_TURNS = [
  { speaker: 'مریم احمدی', time: '14:30:05', paragraphs: [
    'سلام به همه، جلسه رو شروع می‌کنیم.',
    'آیا همه آماده‌اید؟ بله، حتماً! (نسخه 2.1)',
  ]},
  { speaker: 'John Smith', time: '14:31:10', paragraphs: [
    'گزارش Q3 آماده است.',
    'سال ۱۴۰۵ برابر با 2026 است و بودجه 1,250,000 تومان شد.',
    'او گفت: The deadline is Friday, October 30. سپس ادامه داد که «همه چیز طبق برنامه است».',
    'The whole sentence is English inside a Persian meeting.',
  ]},
  { speaker: 'گوینده ۳', time: '14:32:40', paragraphs: [
    'نویسه‌های ویژه: & < > " \' و ایموجی 👋🏽 ✅',
    'نیم‌فاصله: می‌خواهم، خانه‌ها، به‌روزرسانی',
    'عربی در برابر فارسی: علي / علی — كتاب / کتاب',
    'ستون۱\tستون۲\tستون۳',
    'نویسهٔ نامعتبر:\u0001پایان و \u000Bپایان',
  ]},
  { speaker: 'نامشخص', time: '14:33:00', paragraphs: ['متن گوینده‌ای که نامش شناسایی نشد.'] },
];

// Realistic-size fixture: 3,000 segments, ~400,000 characters, 3 speakers, 3 hours.
export function largeFixture() {
  const words = ['جلسه','گزارش','بودجه','برنامه','پروژه','تیم','مشتری','فروش','هفته','بعد','لطفاً','بررسی',
    'می‌کنیم','انجام','شد','نیست','است','داریم','Q3','KPI','dashboard','۱۴۰۵','2026','و','در','با','برای','که','این','آن'];
  const speakers = ['مریم احمدی', 'John Smith', 'گوینده ۳'];
  let seed = 42; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const segs = []; const start = Date.UTC(2026, 9, 16, 11, 0, 0);
  for (let i = 0; i < 3000; i++) {
    let text = '';
    while (text.length < 131) text += (text ? ' ' : '') + words[Math.floor(rnd() * words.length)];
    text += rnd() < 0.3 ? '.' : rnd() < 0.1 ? '؟' : '';
    const sp = speakers[Math.floor(i / (2 + Math.floor(rnd() * 6))) % 3];
    segs.push({ speaker: sp, t: start + i * 3600, text }); // 3 h / 3000 = 3.6 s
  }
  // simple consecutive-speaker grouping (spike approximation of buildTranscript)
  const turns = [];
  for (const s of segs) {
    const last = turns.at(-1);
    const time = new Date(s.t).toISOString().slice(11, 19);
    if (last && last.speaker === s.speaker) last.paragraphs[0] += ' ' + s.text;
    else turns.push({ speaker: s.speaker, time, paragraphs: [s.text] });
  }
  return { turns, chars: segs.reduce((n, s) => n + s.text.length, 0), segments: segs.length };
}
