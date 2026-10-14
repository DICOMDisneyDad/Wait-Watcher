# Google Sheet sync setup

Wait Watcher sends each finished timed wait to a Google Sheet through a small Apps Script.
The sheet **Wait Watcher Log** is already in your Google Drive. Timed waits go to its **Timed Waits** tab (created automatically if missing), separate from any **Posted Waits** logger tab.

1. Open **Wait Watcher Log** in Google Sheets on a computer.
2. Choose **Extensions → Apps Script**. Delete the sample code and paste in everything from `Code.gs` in this folder. Click **Save**.
3. Click **Deploy → New deployment**. Click the gear next to "Select type" and choose **Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Click **Deploy**, then **Authorize access** and allow it with your Google account. Google may warn the app is unverified because you wrote it; choose **Advanced → Go to (project name)**.
5. Copy the **Web app URL** (it ends in `/exec`).
6. In Wait Watcher on your phone, open **My waits → Google Sheet sync**, paste the URL, and tap **Save and test**. It should say "Connected".

Waits you've already timed on the phone are sent right away. After that, each wait is sent when you stop the timer. With no signal, the app keeps it and retries every couple of minutes and whenever the phone comes back online. The sheet skips any wait it already has, so retries never create duplicates.

## Notes

- "Anyone" means anyone with the exact URL can add rows. The URL lives only in your phone's settings, never in this repo. Keep it private.
- If you edit `Code.gs` later, use **Deploy → Manage deployments → Edit → New version** so the same URL keeps working.
- Clearing the log in the app does not delete rows from the sheet.
- Columns: `id` (the wait's start time, used to skip duplicates), date, ride, posted wait, how long the posted wait was unchanged, actual wait in minutes and seconds, the sign lap, sign-to-boarding time, preshow laps, the ride-went-down flag, and when the row arrived.
