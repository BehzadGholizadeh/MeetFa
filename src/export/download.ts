/** How long the object URL stays valid after the download starts (Chrome reads the Blob asynchronously). */
const REVOKE_AFTER_MS = 60_000;

/**
 * Saves bytes as a file from the side panel: Blob URL + <a download> click (spike path A).
 * Needs no "downloads" permission and no network. Throws if the browser rejects the Blob or the click;
 * a download that Chrome later blocks or cancels is not reported back to the page.
 */
export function saveFile(bytes: Uint8Array, fileName: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.hidden = true;
  try {
    document.body.append(a);
    a.click();
  } finally {
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
  }
}
