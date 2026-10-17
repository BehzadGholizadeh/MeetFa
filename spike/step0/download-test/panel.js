import { files, log } from './common.js';
document.getElementById('a-txt').onclick = files.txt;
document.getElementById('a-checks').onclick = files.checks;
document.getElementById('a-large').onclick = files.large;
document.getElementById('b-tab').onclick = async () => {
  const tab = await chrome.tabs.create({ url: chrome.runtime.getURL('tab.html') });
  log(`تب افزونه باز شد (id ${tab.id}).`);
};
log(`Chrome ${navigator.userAgent.match(/Chrome\/[\d.]+/)?.[0] ?? '?'} — پنل آماده است.`);
