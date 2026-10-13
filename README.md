# Wait Watcher

Disneyland Park posted wait times on a map, with how long each posted number has gone unchanged.
Rides whose wait hasn't moved for a while (30 minutes by default) and whose posted wait is at least 15 minutes get a gold star as a possible short line.

## Put it online (GitHub Pages, about 5 minutes)

1. Sign in at github.com and create a new **public** repository, for example `wait-watcher`.
2. On the repository page choose **Add file → Upload files**, drag in every file from this folder, and commit.
3. Go to **Settings → Pages**. Under "Build and deployment" pick **Deploy from a branch**, branch `main`, folder `/ (root)`, and save.
4. After a minute the page shows your address, such as `https://YOUR-NAME.github.io/wait-watcher/`.
5. On your iPhone, open that address in Safari, tap **Share → Add to Home Screen**. It then opens full screen like an app.

Any static host works (Netlify, Cloudflare Pages). It must be served over https for the home-screen install and offline shell.

## How it works

- Every 2 minutes it reads live data for Disneyland Park from ThemeParks.wiki (`api.themeparks.wiki`), which relays Disney's own feed.
- The app records when each ride's standby number last changed. Its own clock is exact once it has been open for a few minutes.
- Right after opening, it falls back to the feed's `lastUpdated` time. That time also moves when Lightning Lane return times change, so the app shows those figures as "at least".
- If the app is closed for more than 12 minutes, it treats what it knew as uncertain and falls back to the feed time again.

## My waits

Tap a ride, then **Start wait timer** when you join the line and **I'm boarding** when you reach the front. Each timed wait stores the posted wait, how stale it was, and your actual wait.
The summary compares your actual-to-posted ratio for stale versus fresh postings. **Export CSV** downloads the log. Everything stays on your phone (browser storage).

## Files

- `index.html`, `app.css`, `app.js`: the app
- `map.svg`: the park map, drawn from OpenStreetMap data
- `sw.js`, `manifest.webmanifest`, `icon-*.png`: home-screen install and offline shell

## Editing

- Ride positions live in the `RIDES` list at the top of `app.js` as `[ThemeParks.wiki id, x, y, land]`. Coordinates match `map.svg`.
- Rides the feed reports that aren't in that list still appear in the List view.
- The flag thresholds can be changed in the app under **List → Flag settings**.

Wait data: ThemeParks.wiki. Map data © OpenStreetMap contributors. Not affiliated with Disney.
