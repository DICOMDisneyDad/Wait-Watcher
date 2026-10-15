# Wait Watcher

Disneyland Park and Disney California Adventure posted wait times on a map, with how long each posted number has gone unchanged. Switch parks with the buttons under the title; the app remembers your choice.
Rides whose wait hasn't moved for a while (30 minutes by default) and whose posted wait is at least 15 minutes get a gold star as a possible short line.
Rides that reopened after being down in the last 20 minutes get a green arrow: people leave the line when a ride goes down, so the real line is often shorter than posted for a while.

## Put it online (GitHub Pages, about 5 minutes)

1. Sign in at github.com and create a new **public** repository, for example `wait-watcher`.
2. On the repository page choose **Add file → Upload files**, drag in every file from this folder, and commit.
3. Go to **Settings → Pages**. Under "Build and deployment" pick **Deploy from a branch**, branch `main`, folder `/ (root)`, and save.
4. After a minute the page shows your address, such as `https://YOUR-NAME.github.io/wait-watcher/`.
5. On your iPhone, open that address in Safari, tap **Share → Add to Home Screen**. It then opens full screen like an app.

Any static host works (Netlify, Cloudflare Pages). It must be served over https for the home-screen install and offline shell.

## How it works

- Every 2 minutes it reads live data for the whole Disneyland Resort from ThemeParks.wiki (`api.themeparks.wiki`), which relays Disney's own feed. One reading covers both parks, so the park you are not looking at keeps its staleness clock too.
- The app records when each ride's standby number last changed. Its own clock is exact once it has been open for a few minutes.
- Right after opening, it falls back to the feed's `lastUpdated` time. That time also moves when Lightning Lane return times change, so the app shows those figures as "at least".
- If the app is closed for more than 12 minutes, it treats what it knew as uncertain and falls back to the feed time again.
- With the posted wait logger connected (**My waits → Posted wait logger**), the app reads each ride's last change time and status history from the logger, which checks every 5 minutes whether or not the app is open. Times are then exact from the moment you open it, and "just reopened" works even for rides that came back while the app was closed. Setup is in `google-sheet/README.md`.
- Without the logger, "just reopened" only appears for rides the app saw go from down to open while it was open.

## My waits

Tap a ride to see its timing rules: start at the back of the standby line, stop when you step into the ride vehicle (each ride's exact stop point is shown). Tap **Start wait timer** when you join the line.

While timing, lap buttons record splits:
- **Passed the posted wait sign** on every ride, for when the line spills outside the entrance.
- Preshow laps on Haunted Mansion (stretching room), Rise of the Resistance (briefing room, shuttle), Smugglers Run (Hondo room), Runaway Railway (preshow room), WEB SLINGERS (preshow room) and Guardians of the Galaxy (Collector's office).

Tap a recorded lap to undo it. Tick **Ride went down** to flag a run; flagged runs stay in the log but are left out of the summary. Showtime attractions and walk-throughs have no timer. The full rules are under **My waits → Stopwatch rules**.

Each timed wait stores the posted wait, how stale it was, your actual wait, and any laps.
The summary compares your actual-to-posted ratio for stale versus fresh postings. **Export CSV** downloads the log. The log is kept on your phone (browser storage). To also send each wait to a Google Sheet, follow `google-sheet/README.md`, then paste the web app URL under **My waits → Google Sheet sync**.

## Files

- `index.html`, `app.css`, `app.js`: the app
- `map.svg`, `map-dca.svg`: the Disneyland and California Adventure maps, drawn from OpenStreetMap data
- `google-sheet/`: the Apps Scripts for Google Sheet sync (`Code.gs`) and the posted wait logger (`PostedWaitLogger.gs`), with setup steps
- `sw.js`, `manifest.webmanifest`, `icon-*.png`: home-screen install and offline shell

## Editing

- Stop points and lap points live in `PROTOCOL` in `app.js`, matched by ride name. Untimed attractions are in `NOT_TIMED`.
- Ride positions live in `RIDES_DL` and `RIDES_DCA` at the top of `app.js` as `[ThemeParks.wiki id, x, y, land]`. Coordinates match `map.svg` and `map-dca.svg` respectively. Each park's map file, land labels and starting view are in `PARKS`.
- Rides the feed reports that aren't in that list still appear in the List view.
- The flag thresholds, including how long the "just reopened" flag lasts, can be changed in the app under **List → Flag settings**.

Wait data: ThemeParks.wiki. Map data © OpenStreetMap contributors. Not affiliated with Disney.
