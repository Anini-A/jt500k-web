/**
 * JT500K — backup to Google Drive (Google Apps Script).
 * Runs weekly via a time trigger AND on demand from the site (Settings → Back up to Drive now).
 *
 * SETUP:
 *  1. Vercel env: BACKUP_TOKEN = <your token>  (redeploy).
 *  2. script.google.com → paste this whole file → set TOKEN below to match.
 *  3. Run `backup` once → approve the Drive permission.
 *  4. Triggers (⏰) → Add Trigger → backup · Time-driven · Week timer  (weekly auto).
 *  5. For the on-demand button: Deploy → New deployment → type "Web app" →
 *     Execute as: Me · Who has access: Anyone → Deploy → copy the Web app URL.
 *     Add it to Vercel env as GDRIVE_WEBAPP_URL (redeploy).
 */
const BACKUP_URL = 'https://jt500k-web.vercel.app/api/export';
const TOKEN = 'fHLs4WE395IlHp5GYwIrS7H-pS3Lv1wW';   // must match BACKUP_TOKEN in Vercel
const FOLDER_NAME = 'JT500K Backups';
const KEEP = 12;                                     // keep the 12 most recent

function backup() {
  const res = UrlFetchApp.fetch(BACKUP_URL + '?token=' + encodeURIComponent(TOKEN), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('Export failed: HTTP ' + res.getResponseCode());
  const json = res.getContentText();

  const it = DriveApp.getFoldersByName(FOLDER_NAME);
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
  const name = 'jt500k-backup-' + Utilities.formatDate(new Date(), 'GMT-5', 'yyyy-MM-dd_HH-mm') + '.json';
  folder.createFile(name, json, 'application/json');

  // prune old backups
  const files = [];
  const fit = folder.getFiles();
  while (fit.hasNext()) files.push(fit.next());
  files.sort((a, b) => b.getDateCreated() - a.getDateCreated());
  files.slice(KEEP).forEach((f) => f.setTrashed(true));
  return name;
}

// On-demand trigger from the site (Settings → Back up to Drive now).
function doGet(e) {
  if (!e || !e.parameter || e.parameter.token !== TOKEN) {
    return ContentService.createTextOutput(JSON.stringify({ error: 'unauthorized' })).setMimeType(ContentService.MimeType.JSON);
  }
  try {
    const file = backup();
    return ContentService.createTextOutput(JSON.stringify({ ok: true, file: file })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: String(err) })).setMimeType(ContentService.MimeType.JSON);
  }
}
