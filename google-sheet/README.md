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
- `reopened_min` (added later, so it comes after `synced_at`): if you joined the line soon after the ride came back from being down, how many minutes after. Blank otherwise. After updating `Code.gs`, the header is added to your existing sheet automatically.

# Posted wait logger setup

`PostedWaitLogger.gs` is a separate Apps Script that checks the posted waits every 5 minutes, around the clock, and writes a row to the **Posted Waits** tab whenever a ride's status or posted wait changes. It also answers the app, so Wait Watcher knows exactly how long each posted wait has gone unchanged the moment you open it, and which rides just reopened after being down.

## First time

1. Go to script.google.com and choose **New project**. Paste in everything from `PostedWaitLogger.gs` and click **Save**.
2. Choose `setup` in the function menu and click **Run**. Approve the permissions prompt (**Advanced → Go to (project name)** if Google warns it's unverified).
3. Click **Deploy → New deployment**, choose **Web app**, set Execute as **Me** and Who has access **Anyone**, and click **Deploy**.
4. Copy the **Web app URL** (ends in `/exec`). It is a different URL from the Google Sheet sync.
5. In Wait Watcher, open **My waits → Posted wait logger**, paste the URL, and tap **Save and test**. It should say "Connected" with the time of the logger's last check.

## Updating a logger you already run

1. Open the logger's Apps Script project, replace all the code with the new `PostedWaitLogger.gs`, and click **Save**. The 5-minute timer keeps running; there is no need to run `setup` again.
2. The next check upgrades its saved state on its own, reading the **Posted Waits** tab to work out when each ride last changed. No rows are lost or duplicated.
3. Do steps 3–5 above to deploy it as a web app and connect the app. If you later edit the code again, use **Deploy → Manage deployments → Edit → New version** so the URL stays the same.

## Notes

- The web app is read-only. It shares only ride IDs, statuses, posted waits and change times, all of which come from the public feed.
- If the logger's last check is more than 15 minutes old, the app ignores it and uses its own clock, and the logger box says so. Running `setup` again restarts the timer.
- Change times are when the logger noticed the change, so they can be up to 5 minutes late. While the app is open it also watches every 2 minutes and uses whichever saw the change first.
