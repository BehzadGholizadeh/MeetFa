import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json';

export default defineManifest({
  manifest_version: 3,
  name: 'MeetFa',
  version: pkg.version,
  description: 'دریافت و نمایش زنده زیرنویس Google Meet',
  minimum_chrome_version: '116',
  action: { default_title: 'MeetFa — نمایش زیرنویس زنده' },
  background: { service_worker: 'src/background/serviceWorker.ts', type: 'module' },
  side_panel: { default_path: 'src/sidepanel/index.html' },
  content_scripts: [
    {
      matches: ['https://meet.google.com/*'],
      js: ['src/content/index.ts'],
      run_at: 'document_idle',
    },
  ],
  permissions: ['storage', 'sidePanel'],
  host_permissions: ['https://meet.google.com/*'],
});
