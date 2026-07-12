/**
 * JT500K — weekly backup to Google Drive (Google Apps Script).
 *
 * SETUP (one time, ~5 min):
 *  1. Add BACKUP_TOKEN to Vercel → Project → Settings → Environment Variables
 *     (a long random string), and redeploy.
 *  2. Go to https://script.google.com → New project → paste this whole file.
 *  3. Set TOKEN below to the same value you put in Vercel.
 *  4. Run `backup` once → approve the Google Drive permission prompt.
 *  5. Left sidebar → Triggers (alarm clock) → Add Trigger →
 *     function: backup · event source: Time-driven · Week timer · pick a day.
 *  Done — a dated JSON lands in a "JT500K Backups" Drive folder every week.
 */
const BACKUP_URL = 'https://jt500k-web.vercel.app/api/export';
const TOKEN = 'PASTE_YOUR_BACKUP_TOKEN';   // must match BACKUP_TOKEN in Vercel
const FOLDER_NAME = 'JT500K Backups';
const KEEP = 12;                            // keep the 12 most recent backups

function backup() {
  const res = UrlFetchApp.fetch(BACKUP_URL + '?token=' + encodeURIComponent(TOKEN), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('Export failed: HTTP ' + res.getResponseCode());
  const json = res.getContentText();

  const it = DriveApp.getFoldersByName(FOLDER_NAME);
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
  const name = 'jt500k-backup-' + Utilities.formatDate(new Date(), 'GMT-5', 'yyyy-MM-dd') + '.json';
  folder.createFile(name, json, 'application/json');

  // prune old backups
  const files = [];
  const fit = folder.getFiles();
  while (fit.hasNext()) files.push(fit.next());
  files.sort((a, b) => b.getDateCreated() - a.getDateCreated());
  files.slice(KEEP).forEach((f) => f.setTrashed(true));
}
