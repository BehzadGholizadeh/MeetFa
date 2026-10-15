# MeetFa — مرحله ۲

دریافت و نمایش زنده زیرنویس Google Meet (Manifest V3، TypeScript، Vite).

## نصب روی Windows 11
1. نصب **Node.js 20 LTS** از nodejs.org (گزینه‌های پیش‌فرض)
2. استخراج پوشه `meetfa` → باز کردن PowerShell در همان پوشه
3. `npm install`
4. `npm test` (باید ۲۸ تست سبز شود)
5. `npm run build` → پوشه `dist` ساخته می‌شود
6. Chrome (نسخه ۱۱۶+) → `chrome://extensions` → روشن کردن **Developer mode**
7. **Load unpacked** → انتخاب پوشه `dist`
8. سنجاق کردن آیکون MeetFa در نوار ابزار

بعد از هر تغییر کد: `npm run build` → دکمه Reload افزونه → **refresh تب Meet**.

## روش تست
| # | اقدام | نتیجه مورد انتظار |
|---|---|---|
| 1 | باز کردن یک تب غیر Meet → کلیک روی آیکون | Side Panel: «خارج از جلسه» |
| 2 | باز کردن meet.google.com/xxx-xxxx-xxx (لابی، هنوز وارد نشده) | «خارج از جلسه» |
| 3 | ورود به جلسه، CC خاموش | «آماده» + «زیرنویس (CC) را روشن کنید» + کد جلسه |
| 4 | روشن کردن CC، سکوت | «آماده» + «منتظر صحبت…» |
| 5 | صحبت کردن | «در حال دریافت»؛ متن خاکستری (زنده) سپس تیره (نهایی) |
| 6 | صحبت طولانی ۳۰+ ثانیه | متن یک بلوک بدون تکرار رشد کند |
| 7 | تغییر گوینده (نفر دوم) | بلوک جدید با نام گوینده جدید |
| 8 | Leave call | بعد از ~۳ ثانیه: «قطع» + «از جلسه خارج شدید»؛ متن باقی می‌ماند |
| 9 | Reload تب در حین جلسه | «قطع» و سپس دوباره «آماده» |
| 10 | دو تب Meet؛ جابه‌جایی بین تب‌ها | Side Panel وضعیت تب فعال را نشان دهد |
| 11 | خطای شبیه‌سازی: در DevTools، aria-label ناحیه را تغییر دهید | بعد از ~۱۰ ثانیه: «خطا» + توضیح |

اشکال‌زدایی: `chrome://extensions` → MeetFa → **service worker** (لاگ SW) و DevTools تب Meet (لاگ Content Script).

## تست مرحله ۲ — ذخیره و بازیابی
| # | اقدام | نتیجه مورد انتظار |
|---|---|---|
| 1 | ورود به جلسه، CC روشن، ۱ دقیقه صحبت | «جلسات قبلی»: یک جلسه «در حال ضبط» با عنوان «جلسه xxx-xxxx-xxx — تاریخ» |
| 2 | «مشاهده متن» روی همان جلسه | متن‌های نهایی‌شده تا این لحظه نمایش داده شود |
| 3 | Leave call | وضعیت جلسه: «پایان‌یافته»؛ مدت و تعداد بخش‌ها درست |
| 4 | «تغییر نام» → عنوان جدید → Enter | عنوان جدید بماند (Esc = انصراف) |
| 5 | «حذف» → «بله، حذف شود» | جلسه از لیست حذف شود |
| 6 | حذف جلسه «در حال ضبط» | دکمه غیرفعال |
| 7 | **بستن تب** وسط جلسه | جلسه «قطع‌شده»؛ متن تا ~۲ ثانیه آخر موجود |
| 8 | **Reload تب** وسط جلسه و ورود دوباره (کمتر از ۵ دقیقه) | ادامه همان جلسه (جلسه جدید ساخته نشود) |
| 9 | **کرش**: Task Manager ویندوز → End task روی Chrome وسط جلسه → باز کردن دوباره Chrome | جلسه «قطع‌شده» با متن ذخیره‌شده |
| 10 | بستن کامل Chrome و باز کردن دوباره | همه جلسات و متن‌ها باقی باشند |
| 11 | بررسی دیتابیس: کلیک راست روی Side Panel → Inspect → Application → IndexedDB → meetfa | دو store: `sessions` و `segments` |

## مدل داده (IndexedDB: `meetfa` v1)
- `sessions`: id, title, meetCode, startedAt, endedAt?, status (active / ended / interrupted), language?, segmentCount
- `segments`: id, sessionId, speaker, text, startedAt, updatedAt, final — ایندکس `bySession`
- نهایی‌ها فوری (durability: strict)، متن زنده هر ۲ ثانیه

## ساختار
```
src/content/      selectors.ts (تنها نقطه وابسته به DOM) · captionParser.ts · segmentTracker.ts · captionObserver.ts · index.ts
src/background/   serviceWorker.ts
src/sidepanel/    index.html · main.ts · style.css
src/storage/      db.ts · repositories.ts
src/sidepanel/    history.ts · segmentView.ts
src/shared/       types.ts · messages.ts · status.ts · constants.ts
tests/            segmentTracker.test.ts · fixtures.ts
spike/            dom-probe.js
docs/             dom-spike.md
```
