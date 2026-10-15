'use strict';
/* Wait Watcher: Disneyland Resort posted waits on a map, plus how long each posted number has gone unchanged. */
// One request covers the whole resort, so both parks' staleness clocks keep running whichever park is on screen.
const RESORT_ID = 'bfc89fd6-314d-44b4-b89e-df1a89cf991e';
const API = 'https://api.themeparks.wiki/v1/entity/' + RESORT_ID + '/live';
const POLL_MS = 2 * 60 * 1000;
const GAP_MS = 12 * 60 * 1000; // a longer gap between readings means we may have missed a change

// ThemeParks.wiki id, map x, map y, land. Map coordinates match map.svg (viewBox 170 90 1300 1230).
const RIDES_DL = [
  ['0de1413a-73ee-46cf-af2e-c491cc7c7d3b',750,754,'Frontierland'],
  ['6c30d5b0-8c0a-406f-9258-0b6c55d4a5e4',716,829,'Frontierland'],
  ['c9e39189-7e99-4e0a-97e0-4a0d5654d257',700,850,'Frontierland'],
  ['07952343-3498-404b-8337-734de9a185c1',565,751,'Frontierland'],
  ['835deb74-de54-4d7f-9dc4-dacab90fcb60',833,818,'Frontierland'],
  ['1b83fda8-d60e-48e4-9a3d-90ddcbcd1001',792,977,'Adventureland'],
  ['2aedc657-1ee2-4545-a1ce-14753f28cc66',657,1142,'Adventureland'],
  ['106c1e5a-a5e7-42d7-96ab-bc100d8faf71',861,930,'Adventureland'],
  ['e27b1db8-9ec9-4f8b-9ca6-fd6377de66ee',716,998,'Adventureland'],
  ['82aeb29b-504a-416f-b13f-f41fa5b766aa',629,1051,'New Orleans Square'],
  ['ff52cb64-c1d5-4feb-9d43-5dbd429bac81',479,937,'New Orleans Square'],
  ['a9076acd-7630-4bad-a8da-e6bd689ddcac',403,864,'Bayou Country'],
  ['52a8ef64-d54c-4974-883f-027c3026e3f1',331,750,'Bayou Country'],
  ['5bd95ae8-181d-449c-8f04-a621e2448961',493,780,'Bayou Country'],
  ['34b1d70f-11c4-42df-935e-d5582c9f1a8e',356,499,"Galaxy's Edge"],
  ['b2c2549c-e9da-4fdd-98ea-1dcff596fed7',618,324,"Galaxy's Edge"],
  ['faaa8be9-cc1e-4535-ac20-04a535654bd0',1117,685,'Fantasyland'],
  ['3638ac09-9fce-4a43-8c79-8ebbe17afce2',1124,369,'Fantasyland'],
  ['c23af6ba-8515-406a-8a48-d0818ba0bfc9',1000,700,'Fantasyland'],
  ['9d401ad3-49b2-469f-ac73-93eb429428fb',1022,660,'Fantasyland'],
  ['4f0053e7-b8db-4833-b02f-35e1c91b4523',900,668,'Fantasyland'],
  ['90ee50d4-7cc9-4824-b29d-2aac801acc29',895,615,'Fantasyland'],
  ['a07f3110-013e-43bb-a182-e66bb8b5e28d',1060,648,'Fantasyland'],
  ['e0cfed11-96d7-40f3-907f-5cfed172592a',1051,612,'Fantasyland'],
  ['cc980e8e-192f-48b6-848c-27784084e54b',962,585,'Fantasyland'],
  ['f7904912-3f08-4563-b99e-fd59f43cc9f2',954,630,'Fantasyland'],
  ['cb929138-d77a-4dd2-983c-f651bbd1bd92',985,548,'Fantasyland'],
  ['8e686e4c-f3db-4d9c-a185-2d54b1fa8899',920,558,'Fantasyland'],
  ['90d5a091-478c-4df1-adfe-c605b4005013',951,732,'Fantasyland'],
  ['888525b0-5a6f-4b8e-9f07-b6a32812b04d',892,440,'Fantasyland'],
  ['33cbbd09-6d93-40d7-b758-9d7b7d3fd2eb',866,764,'Fantasyland'],
  ['cd670bff-81d1-4f34-8676-7bafdf49220a',964,191,'Toontown'],
  ['6ce9cdd1-0a43-459e-83cd-f4cace9cfa7b',1078,306,'Toontown'],
  ['59647168-d239-4161-8b24-92eb128e96fb',876,309,'Toontown'],
  ['5a107a57-9174-4f3f-9be7-625a5d5bb899',907,261,'Toontown'],
  ['c02fb82d-0860-4e95-8c61-899fa594d20e',943,251,'Toontown'],
  ['b0eca3d3-a519-47f9-a5a7-9911126da2df',965,322,'Toontown'],
  ['ca32ef8a-ae0d-4c24-bf4f-e59192122e01',926,300,'Toontown'],
  ['9167db1d-e5e7-46da-a07f-ae30a87bc4c4',1164,1054,'Tomorrowland'],
  ['cc718d11-fa15-44ee-87d0-ded989ad61bc',1131,902,'Tomorrowland'],
  ['88197808-3c56-4198-a5a4-6066541251cf',1132,809,'Tomorrowland'],
  ['64d44aaa-6857-4693-b24b-bcff6c6dcfa1',1241,700,'Tomorrowland'],
  ['1da85181-bf0f-4ccc-b98e-243142f7347b',1307,759,'Tomorrowland'],
  ['6c225598-91c9-44a3-95e2-7c423475db61',1054,855,'Tomorrowland'],
  ['56d0bd6d-5106-4420-8f60-0005475c04c3',1402,790,'Tomorrowland'],
  ['526ada11-4688-442b-96d4-4077eac4f988',1196,967,'Tomorrowland'],
  ['e2d460e9-2bef-4613-b126-092ab7cb37e5',952,1227,'Main Street, U.S.A.'],
  ['bcfd1e17-3eab-4203-b597-6257a257d427',949,1062,'Main Street, U.S.A.'],
  ['05b17c11-fd4c-4b85-ab45-3e269dc56559',1029,1183,'Main Street, U.S.A.'],
  ['1b23667a-d8fb-436d-8952-c3e3f2e56d13',1040,1198,'Main Street, U.S.A.']
];
const LANDS_DL = [["Main Street, U.S.A.",952,1120],["Fantasyland",985,520],["Toontown",1000,225],["Tomorrowland",1215,855],["Frontierland",700,790],["Adventureland",780,1060],["New Orleans Square",560,985],["Bayou Country",385,800],["Galaxy's Edge",520,420]];

// California Adventure. Map coordinates match map-dca.svg (viewBox 170 110 1140 980), drawn from OpenStreetMap
// with the same projection used to place each ride from ThemeParks.wiki's own location for it.
// Rides that share one feed location (Hollywood Land's animation building, the two Pal-A-Round queues,
// the two Guardians entries) are nudged apart so each pin can be tapped.
const RIDES_DCA = [
  ['77f205a4-d482-4d91-a5ff-71e54a086ad2',738,282,'Grizzly Peak'],
  ['b1d285a7-2444-4a7c-b7bb-d2d4d6428a85',620,403,'Grizzly Peak'],
  ['c9803366-6f37-4406-82af-7692357e3ca9',553,487,'Grizzly Peak'],
  ['f44a5072-3cda-4c7c-8574-33ad09d16cca',362,593,'Paradise Gardens Park'],
  ['e1fbc7a1-2cd1-4282-b373-ac11d9d9d38a',593,602,'Paradise Gardens Park'],
  ['c8a4b7b1-c1b2-4dfe-b73c-4e834b4a73db',399,621,'Paradise Gardens Park'],
  ['10a5fc6f-5ad3-414b-9bdd-e6bae097b6ad',433,638,'Paradise Gardens Park'],
  ['4f5b28d0-b78e-482b-8e2e-1f90756d6220',349,705,'Paradise Gardens Park'],
  ['4ca6cdbf-4c5f-45bf-b0dc-db83393ec208',403,794,'Pixar Pier'],
  ['528016ef-db24-47fa-a0f2-b6d26d61e29f',435,806,'Pixar Pier'],
  ['6d876f4c-c3ff-4ae3-a2d8-d4b831e1039b',371,780,'Pixar Pier'],
  ['1d24dd7a-372b-4195-8ad0-ba9679d72b08',413,822,'Pixar Pier'],
  ['5d07a2b1-49ca-4de7-9d32-6d08edf69b08',631,865,'Pixar Pier'],
  ['388ad3f1-5cf5-4a9d-8d0e-6dfb817d7822',584,863,'Pixar Pier'],
  ['86ab3069-110d-49c5-a7e7-29ddf28695a6',491,861,'Pixar Pier'],
  ['eb77ee1f-3207-44fd-acfc-d7bc18602007',780,627,'San Fransokyo Square'],
  ['c60c768b-3461-465c-8f4f-b44b087506fc',924,777,'Cars Land'],
  ['46097afe-a1ea-4807-93d3-14d14f36e55f',839,604,'Cars Land'],
  ['7a09a2f0-e226-4f3e-86f8-2598ab67ec44',934,718,'Cars Land'],
  ['2295351d-ce6b-4c04-92d5-5b416372c5b5',971,539,'Avengers Campus'],
  ['b7678dab-5544-48d5-8fdc-c1a0127cfbcd',1116,490,'Avengers Campus'],
  ['2108cc58-80df-4fff-9b91-735e89873ffd',1116,518,'Avengers Campus'],
  ['40524fba-5d84-49e7-9204-f493dbe2d5a4',1097,302,'Hollywood Land'],
  ['8f586a2f-cef5-46d3-b822-fd622c4e9e33',1001,365,'Hollywood Land'],
  ['d2aa0987-49a2-45dc-a635-3a8bf7401230',1047,393,'Hollywood Land'],
  ['44c1f655-25d3-440c-b1a8-db736a12b105',1073,393,'Hollywood Land'],
  ['7561bcd8-18ea-4e3f-89d5-c905b7ba3d42',1099,393,'Hollywood Land']
];
const LANDS_DCA = [["Buena Vista Street",884,300],["Hollywood Land",1070,345],["Avengers Campus",1135,570],["Cars Land",890,688],["San Fransokyo Square",735,668],["Pixar Pier",420,935],["Paradise Gardens Park",490,676],["Grizzly Peak",690,350]];

// Map image bounds are [[-yMax, xMin], [-yMin, xMax]] of each SVG's viewBox (Leaflet's y grows upward).
const PARKS = {
  dl: {id:'7340550b-c14d-4def-80bb-acdb51d49a66', name:'Disneyland Park', short:'Disneyland', svg:'map.svg',
       bounds:[[-1320,170],[-90,1470]], maxBounds:[[-1500,0],[90,1640]], center:[-720,900], fitH:1150, fit:[[-1260,260],[-160,1420]],
       rides:RIDES_DL, lands:LANDS_DL},
  dca:{id:'832fcd51-ea19-4e77-85c7-75d5843b127c', name:'Disney California Adventure', short:'California Adventure', svg:'map-dca.svg',
       bounds:[[-1090,170],[-110,1310]], maxBounds:[[-1250,20],[50,1460]], center:[-600,750], fitH:1000, fit:[[-1040,280],[-170,1290]],
       rides:RIDES_DCA, lands:LANDS_DCA}
};
const SKIP = new Set(['6e2af074-3a67-4f38-9bcf-2f5a572c87df']); // duplicate Opera House entry
const POS = Object.fromEntries([...RIDES_DL, ...RIDES_DCA].map(r => [r[0], {x:r[1], y:r[2], land:r[3]}]));

/* Timing protocol (from the Disneyland Wait Timing Protocol doc). Matched by ride name.
   [name fragment, stop point, preshow lap points] */
const PROTOCOL = [
  ['indiana jones', 'step into the troop transport'],
  ['jungle cruise', 'step into the boat'],
  ['pirates of the caribbean', 'step into the boat'],
  ['haunted mansion', 'step into the Doom Buggy', ['Entering the stretching room']],
  ['tianas bayou', 'step into the log'],
  ['winnie the pooh', 'step into the beehive'],
  ['explorer canoes', 'step into the canoe'],
  ['big thunder', 'step into the train car'],
  ['railroad', 'step onto the train car'],
  ['mark twain', 'step onto the deck'],
  ['columbia', 'step onto the deck'],
  ['tom sawyer', 'step onto the raft'],
  ['pirates lair', 'step onto the raft'],
  ['rise of the resistance', 'step into the Fleet Transport vehicle', ['Entering the briefing room', 'Boarding the shuttle']],
  ['smugglers run', 'step into the cockpit', ['Entering the Hondo room']],
  ['matterhorn', 'step into the bobsled'],
  ['peter pan', 'step into the ship'],
  ['snow white', 'step into the mine car'],
  ['pinocchio', 'step into the car'],
  ['mr toad', 'step into the car'],
  ['alice in wonderland', 'step into the caterpillar'],
  ['mad tea party', 'step into the teacup'],
  ['king arthur', 'step onto the horse'],
  ['dumbo', 'step into the Dumbo'],
  ['casey jr', 'step into the car'],
  ['storybook land', 'step into the boat'],
  ['small world', 'step into the boat'],
  ['runaway railway', 'step into the train', ['Entering the preshow room']],
  ['car toon spin', 'step into the cab'],
  ['gadgetcoaster', 'step into the coaster'],
  ['space mountain', 'step into the rocket'],
  ['star tours', 'step through the Starspeeder doors'],
  ['astro blasters', 'step into the cruiser'],
  ['submarine voyage', 'step through the submarine hatch'],
  ['autopia', 'step into the car'],
  ['astro orbitor', 'step into the rocket'],
  ['monorail', 'step into the monorail'],
  // California Adventure
  ['soarin', 'step into your seat row'],
  ['grizzly river', 'step into the raft'],
  ['goofys sky school', 'step into the plane'],
  ['little mermaid', 'step into the clamshell'],
  ['jumpin jellyfish', 'step into the jellyfish seat'],
  ['golden zephyr', 'step into the rocket'],
  ['silly symphony', 'step into the swing seat'],
  ['pal a round', 'step into the gondola'],
  ['inside out', 'step into the ride vehicle'],
  ['incredicoaster', 'step into the coaster car'],
  ['critter carousel', 'step onto the carousel'],
  ['midway mania', 'step into the tram'],
  ['radiator springs', 'step into the racer'],
  ['maters ', 'step into the tractor cart'],
  ['luigis', 'step into the car'],
  ['web slingers', 'step into the ride vehicle', ['Entering the preshow room']],
  ['guardians', 'step into the gantry seat', ['Entering the Collector’s office']],
  ['monsters inc', 'step into the taxi']
];
const SHOWTIME = 'Runs on a showtime, so its wait depends on the next show, not a moving line.';
const NOT_TIMED = [
  ['tiki room', SHOWTIME],
  ['mr lincoln', SHOWTIME],
  ['philharmagic', SHOWTIME],
  ['animation academy', SHOWTIME],
  ['turtle talk', SHOWTIME],
  ['treehouse', 'Walk-through with no line.'],
  ['castle walkthrough', 'Walk-through with no line.'],
  ['sorcerers workshop', 'Walk-through with no line.'],
  ['bakery tour', 'Walk-through with no line.'],
  ['redwood creek', 'Walk-through play area with no line.'],
  ['games of pixar pier', 'Midway games, not a ride line.'],
  ['oogie boogie', 'Party walk-through, not a ride line.']
];
const SIGN_LAP = 'Passed the posted wait sign';
const norm = s => s.toLowerCase().replace(/[’'`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
function protocolFor(name){
  const n = norm(name);
  const skip = NOT_TIMED.find(p => n.includes(p[0]));
  if (skip) return {untimed:true, why:skip[1]};
  const p = PROTOCOL.find(p => n.includes(p[0]));
  return p ? {stop:p[1], laps:p[2] || []} : {stop:'step into the ride vehicle', laps:[], generic:true};
}
const fmtClock = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return Math.floor(s/60) + ':' + String(s%60).padStart(2,'0'); };

/* storage */
const store = {
  get(k, d){ try{ const v = localStorage.getItem('ww-' + k); return v ? JSON.parse(v) : d; }catch(e){ return d; } },
  set(k, v){ try{ localStorage.setItem('ww-' + k, JSON.stringify(v)); }catch(e){} }
};
let track = store.get('track', {});      // id -> {wait, since, exact, seen, status, statusSince, prevStatus}
let settings = Object.assign({stale:30, minWait:15, reopen:20}, store.get('settings', {}));
let logger = store.get('logger', null);   // last reading from the posted wait logger: {at, checkedAt, rides}
let timer = store.get('timer', null);
let log = store.get('log', []);
let parkKey = PARKS[store.get('park', 'dl')] ? store.get('park', 'dl') : 'dl';
const park = () => PARKS[parkKey];
let rides = [];                            // current merged view, this park only
let liveData = null;                       // last resort-wide reading, kept so switching parks needs no new fetch
let lastFetch = 0, lastError = null, selectedId = null;

const $ = id => document.getElementById(id);
const clean = n => n.replace(/[™®]/g,'').replace(/^"(.*)"$/,'$1').replace(/\s+-\s+The Adventures/,': The Adventures').trim();
const fmtMin = m => m < 60 ? Math.round(m) + ' min' : Math.floor(m/60) + ' h ' + String(Math.round(m%60)).padStart(2,'0') + ' min';
const fmtAge = ms => { const s = Math.round(ms/1000); if (s < 60) return 'just now'; const m = Math.round(s/60); return m < 60 ? m + ' min ago' : fmtMin(m) + ' ago'; };

/* data */
function standby(e){ return e.queue && e.queue.STANDBY && typeof e.queue.STANDBY.waitTime === 'number' ? e.queue.STANDBY.waitTime : null; }
function updateTracking(list, now){
  for (const e of list){
    const w = e.status === 'OPERATING' ? standby(e) : null;
    const feedT = Date.parse(e.lastUpdated) || now;
    const t = track[e.id];
    if (!t){ track[e.id] = {wait:w, since:Math.min(feedT, now), exact:false, seen:now, status:e.status, statusSince:now, prevStatus:''}; continue; }
    const gap = now - t.seen > GAP_MS;
    if (t.wait !== w){
      // Value changed. If we were watching closely, it changed within the last poll; otherwise we only know the feed's time.
      Object.assign(t, gap ? {wait:w, since:Math.min(feedT, now), exact:false} : {wait:w, since:now, exact:true});
    } else if (gap && feedT > t.since){ t.since = feedT; t.exact = false; } // something changed while we were away
    if (t.status !== e.status){
      // Status changed. While watching we know when and from what; after a gap we don't, so no "just reopened" guess.
      t.prevStatus = gap || !t.status ? '' : t.status; t.statusSince = now; t.status = e.status;
    }
    t.seen = now;
  }
  applyLogger(list, now);
  store.set('track', track);
}

/* Posted wait logger: a server-side script that checks every 5 minutes around the clock,
   so it knows when each posted wait last changed even while this app was closed. */
const LOGGER_MAX_AGE = 15 * 60 * 1000; // a logger that hasn't checked in this long is ignored
const SAME_CHANGE = 6 * 60 * 1000;     // app and logger times this close describe the same change
function loggerUrl(){ return (settings.loggerUrl || '').trim(); }
function loggerLive(now){ return !!(loggerUrl() && logger && logger.rides && now - logger.checkedAt <= LOGGER_MAX_AGE); }
function applyLogger(list, now){
  if (!loggerLive(now)) return;
  for (const e of list){
    const L = logger.rides[e.id], t = track[e.id];
    if (!L || !t) continue;
    const lw = L.status === 'OPERATING' && typeof L.wait === 'number' ? L.wait : null;
    if (L.status !== e.status || lw !== t.wait) continue; // the app has a newer reading; trust its own clock
    if (t.exact && t.since > L.since + SAME_CHANGE){ /* the app saw a change between logger checks */ }
    else if (t.exact && t.since >= L.since - SAME_CHANGE){ t.since = Math.min(t.since, L.since); }
    else if (L.exact){ t.since = L.since; t.exact = true; }
    else { t.since = Math.min(t.since, L.since); t.exact = false; }
    // Status history: the logger's is complete; the app's only covers time it was open.
    if (L.prevStatus && !(t.prevStatus && t.statusSince > L.statusSince + SAME_CHANGE)){
      t.prevStatus = L.prevStatus; t.statusSince = L.statusSince;
    }
  }
}
async function fetchLogger(){
  const url = loggerUrl(); if (!url) return;
  try{
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const stop = ctl ? setTimeout(() => ctl.abort(), 8000) : 0; // a slow logger must not hold up the live waits
    const r = await fetch(url, {cache:'no-store', signal:ctl ? ctl.signal : undefined}); const j = await r.json();
    clearTimeout(stop);
    if (j.app !== 'wait-watcher-logger' || !j.rides) throw new Error('wrong script');
    logger = {at:Date.now(), checkedAt:j.checkedAt, rides:j.rides}; store.set('logger', logger);
    loggerMsg = ''; return true;
  }catch(err){ loggerMsg = 'Couldn’t reach the logger just now. Using the app’s own clock.'; return false; }
}

// Staleness and the two short-line flags, from a ride's tracking record.
function flagsFor(status, wait, t, now){
  const staleMin = Math.max(0, (now - t.since) / 60000);
  const reopenMin = status === 'OPERATING' && t.prevStatus === 'DOWN' && t.statusSince ? Math.max(0, (now - t.statusSince) / 60000) : null;
  const reopen = reopenMin !== null && reopenMin <= settings.reopen;
  const hunch = !reopen && status === 'OPERATING' && wait !== null && wait >= settings.minWait && staleMin >= settings.stale;
  return {staleMin, exact:t.exact, reopenMin, reopen, hunch};
}
function merge(list, now){
  const out = [], pid = park().id;
  for (const e of list){
    if (e.parkId !== pid) continue;
    if (e.entityType !== 'ATTRACTION' && !POS[e.id]) continue;
    if (SKIP.has(e.id)) continue;
    const p = POS[e.id] || null, t = track[e.id] || {since:now, exact:false};
    const wait = e.status === 'OPERATING' ? standby(e) : null;
    const single = e.queue && e.queue.SINGLE_RIDER && typeof e.queue.SINGLE_RIDER.waitTime === 'number' ? e.queue.SINGLE_RIDER.waitTime : null;
    const ll = e.queue && (e.queue.RETURN_TIME || e.queue.PAID_RETURN_TIME);
    out.push(Object.assign({id:e.id, name:clean(e.name), status:e.status, wait, single, ll, pos:p, land:p ? p.land : ''}, flagsFor(e.status, wait, t, now)));
  }
  return out;
}
async function refresh(manual){
  const btn = $('btn-refresh'); btn.classList.add('spin');
  try{
    const lp = fetchLogger();
    const r = await fetch(API + (manual ? '?t=' + Date.now() : ''), {cache:'no-store'});
    if (!r.ok) throw new Error('The wait time service answered ' + r.status + '.');
    const j = await r.json();
    await lp;
    const now = Date.now();
    liveData = (j.liveData || []).filter(e => e.entityType === 'ATTRACTION' || POS[e.id]);
    updateTracking(liveData, now);
    rides = merge(liveData, now);
    lastFetch = now; lastError = null;
    store.set('last', {at:now, data:liveData});
  }catch(err){
    lastError = navigator.onLine === false ? 'You are offline. Showing the last waits this phone saw.' : 'Could not reach the wait times right now. Showing the last waits this phone saw.';
    if (!liveData){ const c = store.get('last', null); if (c && c.data){ liveData = c.data; rides = merge(liveData, Date.now()); lastFetch = c.at; } }
  }finally{
    btn.classList.remove('spin'); render();
  }
}

/* map */
let map, markers = {}, base = null;
function initMap(){
  map = L.map('map', {crs:L.CRS.Simple, minZoom:-1.5, maxZoom:2, zoomSnap:0.25, attributionControl:false, maxBoundsViscosity:0.8, zoomControl:false});
  const el = document.getElementById('map');
  const zc = () => el.classList.toggle('z-low', map.getZoom() < -0.1);
  map.on('zoomend', zc);
  L.control.zoom({position:'topright'}).addTo(map);
  map.on('click', () => closeSheet());
  drawPark(); zc();
}
// Park image, land labels and starting view. Called again whenever the park switches.
function drawPark(){
  const p = park();
  if (base) base.remove();
  for (const id in markers) markers[id].remove();
  markers = {};
  base = L.layerGroup().addTo(map);
  L.imageOverlay(p.svg, p.bounds, {alt:'Map of ' + p.name}).addTo(base);
  for (const l of p.lands){
    L.marker([-l[2], l[1]], {interactive:false, keyboard:false, icon:L.divIcon({className:'pinwrap', html:'<span class="land-label">' + l[0] + '</span>', iconSize:[0,0]})}).addTo(base);
  }
  map.setMaxBounds(p.maxBounds);
  const el = document.getElementById('map'), w = el.clientWidth || 390, h = el.clientHeight || 700;
  if (h > w) map.setView(p.center, Math.log2(h / p.fitH)); else map.fitBounds(p.fit);
  el.setAttribute('aria-label', 'Map of ' + p.name + ' with wait times');
}
function setPark(key){
  if (!PARKS[key] || key === parkKey) return;
  closeSheet();
  parkKey = key; store.set('park', key);
  renderParkSwitch();
  rides = liveData ? merge(liveData, Date.now()) : [];
  if (map) drawPark();
  render();
}
function renderParkSwitch(){
  document.querySelectorAll('.park-btn').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.park === parkKey)));
}
const REOPEN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12a7 7 0 1 0 2.05-4.95M5 4v4h4" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" fill="#1f2f44"/></svg>';
function pinClass(r){
  if (r.status !== 'OPERATING') return 'closed';
  if (r.reopen) return 'reopen';
  if (r.wait === null) return 'nowait';
  if (r.hunch) return 'hunch';
  return r.staleMin >= settings.stale / 2 ? 'stale' : 'fresh';
}
function pinHtml(r){
  const c = pinClass(r) + (r.id === selectedId ? ' sel' : '');
  let t = '';
  if (r.status !== 'OPERATING') t = r.status === 'REFURBISHMENT' ? 'Refurb' : r.status === 'DOWN' ? 'Down' : 'Closed';
  else if (r.reopen) t = REOPEN + (r.wait !== null ? r.wait : '');
  else if (r.wait !== null) t = (r.hunch ? STAR : '') + r.wait;
  return '<button type="button" class="pin ' + c + '" aria-label="' + r.name.replace(/"/g,'&quot;') + ': ' + describe(r) + '">' + t + '</button>';
}
function describe(r){
  if (r.status !== 'OPERATING') return statusText(r.status);
  if (r.reopen) return 'just reopened ' + fmtAge(r.reopenMin * 60000) + (r.wait !== null ? ', ' + r.wait + ' minute posted wait' : '');
  if (r.wait === null) return 'open, no posted wait';
  return r.wait + ' minute wait, unchanged for ' + (r.exact ? '' : 'at least ') + fmtMin(r.staleMin);
}
function statusText(s){ return {CLOSED:'Closed', DOWN:'Temporarily down', REFURBISHMENT:'Closed for refurbishment', OPERATING:'Open'}[s] || s; }
function renderMap(){
  if (!map) return;
  const seen = new Set();
  for (const r of rides){
    if (!r.pos) continue; seen.add(r.id);
    const z = r.reopen ? 1100 : r.hunch ? 1000 : r.status === 'OPERATING' && r.wait !== null ? 500 : 0;
    const icon = L.divIcon({className:'pinwrap', html:pinHtml(r), iconSize:[0,0]});
    if (markers[r.id]){ markers[r.id].setIcon(icon); markers[r.id].setZIndexOffset(z); }
    else {
      const m = L.marker([-r.pos.y, r.pos.x], {icon, zIndexOffset:z, keyboard:false});
      m.on('click', ev => { L.DomEvent.stopPropagation(ev); openSheet(r.id); });
      m.addTo(map); markers[r.id] = m;
    }
  }
  for (const id in markers){ if (!seen.has(id)){ markers[id].remove(); delete markers[id]; } }
  // Flag chips: just-reopened rides first (they're time-sensitive), then stale postings.
  const hs = rides.filter(r => r.reopen).sort((a,b) => a.reopenMin - b.reopenMin)
    .concat(rides.filter(r => r.hunch).sort((a,b) => b.staleMin - a.staleMin));
  const bar = $('hunch-bar'); bar.textContent = ''; bar.hidden = !hs.length || !$('sheet').hidden;
  for (const r of hs.slice(0,6)){
    const b = document.createElement('button'); b.type = 'button'; b.className = 'hunch-chip' + (r.reopen ? ' reopen' : '');
    b.innerHTML = (r.reopen ? REOPEN : STAR).replace('aria-hidden','width="14" height="14" aria-hidden');
    b.append(r.name + (r.wait !== null ? ' ' + r.wait + ' min' : ''));
    const s = document.createElement('small'); s.textContent = r.reopen ? 'reopened ' + fmtAge(r.reopenMin * 60000) : 'still for ' + fmtMin(r.staleMin); b.append(s);
    b.addEventListener('click', () => openSheet(r.id, true)); bar.append(b);
  }
}

/* list */
function rank(r){ if (r.reopen) return -1; if (r.hunch) return 0; if (r.status === 'OPERATING' && r.wait !== null) return 1; if (r.status === 'OPERATING') return 2; return 3; }
function renderList(){
  const ol = $('ride-list'); ol.textContent = '';
  const sorted = rides.slice().sort((a,b) => rank(a) - rank(b) || (a.reopen ? a.reopenMin - b.reopenMin : b.staleMin - a.staleMin));
  for (const r of sorted){
    const li = document.createElement('li');
    const b = document.createElement('button'); b.type = 'button'; b.className = 'ride' + (r.reopen ? ' reopen' : r.hunch ? ' hunch' : '');
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = r.name;
    const ld = document.createElement('span'); ld.className = 'ld';
    ld.textContent = (r.land ? r.land + ' · ' : '') + (r.status !== 'OPERATING' ? statusText(r.status) : r.reopen ? 'Just reopened ' + fmtAge(r.reopenMin * 60000) : r.wait === null ? 'Open, no posted wait' : (r.hunch ? 'Possible short line · ' : '') + 'unchanged ' + (r.exact ? '' : '≥ ') + fmtMin(r.staleMin));
    const w = document.createElement('span'); w.className = 'w';
    w.textContent = r.status === 'OPERATING' && r.wait !== null ? r.wait : '–';
    const sm = document.createElement('small'); sm.textContent = r.status === 'OPERATING' && r.wait !== null ? 'min posted' : ''; w.append(sm);
    b.append(nm, ld, w);
    b.addEventListener('click', () => { show('map'); openSheet(r.id, true); });
    li.append(b); ol.append(li);
  }
}

/* sheet */
function openSheet(id, pan){
  const r = rides.find(x => x.id === id); if (!r) return;
  selectedId = id;
  $('s-name').textContent = r.name;
  $('s-land').textContent = (r.land || park().name) + ' · ' + statusText(r.status);
  $('s-wait').textContent = r.status === 'OPERATING' && r.wait !== null ? r.wait + ' min' : '–';
  $('s-stale').textContent = r.status === 'OPERATING' && r.wait !== null ? (r.exact ? '' : '≥ ') + fmtMin(r.staleMin) : '–';
  const note = $('s-note');
  note.className = 'note' + (r.reopen ? ' reopen' : r.hunch ? ' hunch' : '');
  if (r.reopen) note.textContent = 'Just reopened ' + fmtAge(r.reopenMin * 60000) + ' after being down. Lines are often short right after a reopening, before the posted wait catches up.';
  else if (r.hunch) note.textContent = 'Possible short line: this posted wait hasn’t moved in ' + fmtMin(r.staleMin) + '.';
  else if (r.status === 'OPERATING' && r.wait !== null) note.textContent = r.exact ? 'This posted wait last changed ' + fmtMin(r.staleMin) + ' ago.' : loggerUrl() ? 'The logger hasn’t seen this number change yet, so this is a minimum.' : 'Keep the app open a few minutes to measure this exactly. For now this is a minimum.';
  else note.textContent = r.status === 'OPERATING' ? 'This one has no posted standby wait.' : '';
  const extra = [];
  if (r.single !== null) extra.push('Single rider: ' + r.single + ' min');
  if (r.ll && r.ll.state) extra.push('Lightning Lane: ' + (r.ll.state === 'AVAILABLE' && r.ll.returnStart ? 'returns from ' + new Date(r.ll.returnStart).toLocaleTimeString([], {hour:'numeric', minute:'2-digit'}) : r.ll.state === 'FINISHED' ? 'sold out' : r.ll.state.toLowerCase().replace('_',' ')));
  $('s-extra').textContent = extra.join(' · ');
  const pr = protocolFor(r.name), how = $('s-howto'); how.textContent = '';
  if (pr.untimed){
    how.append(howLine('Not timed', pr.why));
  } else {
    how.append(howLine('Start', 'when you take your place at the back of the standby line (the entrance by the wait sign, or the back of the line if it spills outside).'));
    how.append(howLine('Lap', 'at the posted wait sign if you started outside the entrance.'));
    if (pr.laps.length) how.append(howLine('Preshow laps', pr.laps.join('; ') + '. Keep the clock running through the preshow.'));
    how.append(howLine('Stop', 'when you ' + pr.stop + '. Not at the load area, and not when the ride starts moving.'));
  }
  const tb = $('s-timer');
  tb.hidden = !(r.status === 'OPERATING') || !!pr.untimed;
  tb.disabled = !!timer; tb.textContent = timer ? 'A wait timer is already running' : 'Start wait timer';
  $('sheet').hidden = false; $('hunch-bar').hidden = true;
  if (pan && r.pos && map) map.flyTo([-r.pos.y + 90, r.pos.x], Math.max(map.getZoom(), 0.5), {duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 0.6});
  renderMap();
}
function closeSheet(){ if ($('sheet').hidden) return; $('sheet').hidden = true; selectedId = null; renderMap(); }

/* timer and log */
function startTimer(){
  const r = rides.find(x => x.id === selectedId); if (!r || timer) return;
  timer = {id:r.id, name:r.name, posted:r.wait, staleMin:Math.round(r.staleMin), exact:r.exact, reopenMin:r.reopenMin === null ? null : Math.round(r.reopenMin), start:Date.now(), laps:[], flagged:false};
  store.set('timer', timer); closeSheet(); show('log'); render();
}
function stopTimer(keep){
  if (!timer) return;
  if (keep){
    const end = Date.now(), sec = Math.round((end - timer.start) / 1000);
    log.unshift(Object.assign({}, timer, {end, actualSec:sec, actualMin:Math.round(sec / 60)}));
    store.set('log', log);
  }
  timer = null; store.set('timer', null); render();
  if (keep) syncLog();
}
function lap(label){
  if (!timer) return;
  timer.laps = (timer.laps || []).filter(l => l.label !== label);
  timer.laps.push({label, at:Date.now() - timer.start});
  timer.laps.sort((a,b) => a.at - b.at);
  store.set('timer', timer); renderTimer(true);
}
function unlap(label){
  if (!timer) return;
  timer.laps = (timer.laps || []).filter(l => l.label !== label);
  store.set('timer', timer); renderTimer(true);
}
function howLine(k, text){
  const p = document.createElement('p'); const b = document.createElement('strong'); b.textContent = k + ': ';
  p.append(b, text); return p;
}
function renderTimer(rebuild){
  if (!timer) return;
  const pr = protocolFor(timer.name);
  $('t-elapsed').textContent = fmtClock(Date.now() - timer.start);
  if (!rebuild && $('t-laps').dataset.for === String(timer.start)) return;
  $('t-laps').dataset.for = String(timer.start);
  $('t-cue').textContent = 'Stop when you ' + pr.stop + '.';
  $('t-stop').textContent = 'I ' + pr.stop.replace(/^step/, 'stepped');
  const box = $('t-laps'); box.textContent = '';
  const labels = [SIGN_LAP].concat(pr.laps);
  for (const label of labels){
    const done = (timer.laps || []).find(l => l.label === label);
    const b = document.createElement('button'); b.type = 'button';
    b.className = 'btn lap' + (label === SIGN_LAP ? ' sign' : '') + (done ? ' done' : '');
    b.textContent = done ? '✓ ' + label + ' · ' + fmtClock(done.at) : 'Lap: ' + label;
    if (label === SIGN_LAP && !done){ const s = document.createElement('small'); s.textContent = 'Only if you started outside the entrance'; b.append(s); }
    b.setAttribute('aria-label', done ? label + ' recorded at ' + fmtClock(done.at) + '. Tap to undo.' : 'Record lap: ' + label);
    b.addEventListener('click', () => done ? unlap(label) : lap(label));
    box.append(b);
  }
  $('t-flag').checked = !!timer.flagged;
}
function lapSummary(e){
  return (e.laps || []).map(l => (l.label === SIGN_LAP ? 'Sign' : l.label.replace(/^(Entering|Boarding) the /, '')) + ' ' + fmtClock(l.at)).join(' · ');
}
// A timed wait that started within the "just reopened" window after a ride came back from being down.
function wasReopen(e){ return typeof e.reopenMin === 'number' && e.reopenMin <= settings.reopen; }
function median(a){ if (!a.length) return null; const s = a.slice().sort((x,y) => x-y), m = Math.floor(s.length/2); return s.length % 2 ? s[m] : (s[m-1] + s[m]) / 2; }
function renderLog(){
  $('timer-dot').hidden = !timer;
  const card = $('timer-card'); card.hidden = !timer;
  if (timer){
    $('t-name').textContent = timer.name;
    renderTimer(false);
    $('t-meta').textContent = timer.posted !== null ? 'Posted ' + timer.posted + ' min, unchanged for ' + (timer.exact ? '' : 'at least ') + fmtMin(timer.staleMin) + ' when you joined.' + (wasReopen(timer) ? ' Reopened ' + timer.reopenMin + ' min before.' : '') : 'No posted wait when you joined.';
  }
  const has = log.length > 0;
  $('log-empty').hidden = has; $('log-wrap').hidden = !has; $('log-actions').hidden = !has;
  const tb = $('log-body'); tb.textContent = '';
  for (const e of log){
    const tr = document.createElement('tr');
    const td = (t, cls, sub) => { const c = document.createElement('td'); if (cls) c.className = cls; c.textContent = t; if (sub){ const s = document.createElement('small'); s.textContent = sub; c.append(s); } tr.append(c); };
    const when = new Date(e.start).toLocaleString([], {month:'short', day:'numeric', hour:'numeric', minute:'2-digit'});
    const laps = lapSummary(e);
    td(e.name, '', [when, wasReopen(e) ? 'Joined ' + e.reopenMin + ' min after a reopening' : '', laps, e.flagged ? '⚑ Ride went down (left out of summary)' : '', syncUrl() && !e.synced ? 'Not in sheet yet' : ''].filter(Boolean).join(' · '));
    td(e.posted === null ? '–' : e.posted + ' min', 'num'); td((e.exact ? '' : '≥ ') + e.staleMin + ' min', 'num'); td(e.actualMin + ' min', 'num');
    tb.append(tr);
  }
  const v = $('verdict');
  const withPost = log.filter(e => e.posted > 0 && !e.flagged);
  const ro = withPost.filter(wasReopen), rest = withPost.filter(e => !wasReopen(e));
  const st = rest.filter(e => e.staleMin >= settings.stale), fr = rest.filter(e => e.staleMin < settings.stale);
  if (withPost.length){
    const pct = g => { const m = median(g.map(e => e.actualMin / e.posted)); return m === null ? null : Math.round(m * 100); };
    const ps = pct(st), pf = pct(fr), pr = pct(ro);
    v.hidden = false; v.textContent = '';
    const h = document.createElement('strong'); h.textContent = 'Your evidence so far'; v.append(h, document.createElement('br'));
    v.append('Stale postings (unchanged ' + settings.stale + '+ min): ' + (ps === null ? 'none timed yet' : 'your actual wait was typically ' + ps + '% of posted, across ' + st.length + ' ride' + (st.length === 1 ? '' : 's')) + '.');
    v.append(document.createElement('br'));
    v.append('Fresher postings: ' + (pf === null ? 'none timed yet' : 'typically ' + pf + '% of posted, across ' + fr.length + ' ride' + (fr.length === 1 ? '' : 's')) + '.');
    v.append(document.createElement('br'));
    v.append('Just reopened (within ' + settings.reopen + ' min): ' + (pr === null ? 'none timed yet' : 'typically ' + pr + '% of posted, across ' + ro.length + ' ride' + (ro.length === 1 ? '' : 's')) + '.');
    if (st.length + fr.length < 10){ v.append(document.createElement('br')); const s = document.createElement('span'); s.className = 'muted'; s.textContent = 'A handful of rides can mislead; aim for 10 or more in each group.'; v.append(s); }
  } else v.hidden = true;
}
const COLS = ['date','ride','posted_min','unchanged_min','unchanged_exact','actual_min','actual_sec','sign_lap_sec','sign_to_board_sec','preshow_laps','ride_went_down','reopened_min'];
function rowFor(e){
  const sign = (e.laps || []).find(l => l.label === SIGN_LAP);
  const sec = e.actualSec ?? e.actualMin * 60;
  const pre = (e.laps || []).filter(l => l.label !== SIGN_LAP).map(l => l.label + ' @' + Math.round(l.at / 1000) + 's').join('; ');
  return {id:String(e.start), date:new Date(e.start).toISOString(), ride:e.name, posted_min:e.posted ?? '', unchanged_min:e.staleMin,
    unchanged_exact:e.exact ? 'yes' : 'no', actual_min:e.actualMin, actual_sec:sec, sign_lap_sec:sign ? Math.round(sign.at / 1000) : '',
    sign_to_board_sec:sign ? sec - Math.round(sign.at / 1000) : '', preshow_laps:pre, ride_went_down:e.flagged ? 'yes' : 'no',
    reopened_min:typeof e.reopenMin === 'number' ? e.reopenMin : ''};
}

/* Google Sheet sync: each finished wait is sent once; the sheet skips ids it already has, so retries are safe. */
let loggerMsg = '';
function renderLogger(){
  const s = $('logger-status'); if (!s) return;
  const now = Date.now();
  if (!loggerUrl()){ s.textContent = 'Not connected. “Unchanged for” times are measured only while the app is open.'; return; }
  if (loggerMsg){ s.textContent = loggerMsg; return; }
  if (!logger){ s.textContent = 'Connected. Waiting for the first reading.'; return; }
  if (!loggerLive(now)){ s.textContent = 'Connected, but the logger last checked ' + fmtAge(now - logger.checkedAt) + '. Its timer may have stopped; open the script and run setup() again. Using the app’s own clock meanwhile.'; return; }
  s.textContent = 'Connected. The logger last checked ' + fmtAge(now - logger.checkedAt) + ' and is tracking ' + Object.keys(logger.rides).length + ' rides.';
}
let syncing = false, syncMsg = '';
function syncUrl(){ return (settings.syncUrl || '').trim(); }
async function syncLog(){
  const url = syncUrl(), todo = log.filter(e => !e.synced);
  if (!url || syncing){ renderSync(); return; }
  if (!todo.length){ syncMsg = 'All ' + log.length + ' timed wait' + (log.length === 1 ? '' : 's') + ' are in your sheet.'; renderSync(); return; }
  if (navigator.onLine === false){ syncMsg = todo.length + ' waiting to sync. Will send when you have signal.'; renderSync(); return; }
  syncing = true; syncMsg = 'Sending ' + todo.length + '…'; renderSync();
  try{
    const r = await fetch(url, {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify({rows:todo.map(rowFor)})});
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'sheet error');
    const ok = new Set(j.ids);
    for (const e of log) if (ok.has(String(e.start))) e.synced = true;
    store.set('log', log);
    const left = log.filter(e => !e.synced).length;
    syncMsg = left ? left + ' still waiting to sync.' : 'All ' + log.length + ' timed wait' + (log.length === 1 ? '' : 's') + ' are in your sheet.';
  }catch(err){
    syncMsg = 'Couldn’t reach the sheet. ' + todo.length + ' waiting; it will retry automatically.';
  }finally{ syncing = false; renderSync(); }
}
async function testSync(){
  const url = syncUrl(); if (!url) return;
  syncMsg = 'Checking the link…'; renderSync();
  try{
    const r = await fetch(url, {cache:'no-store'}); const j = await r.json();
    if (j.app !== 'wait-watcher') throw new Error('wrong script');
    syncMsg = 'Connected. The sheet has ' + j.rows + ' row' + (j.rows === 1 ? '' : 's') + '.'; renderSync(); syncLog();
  }catch(err){ syncMsg = 'That link didn’t answer like the Wait Watcher script. Check the web app URL and that access is set to Anyone.'; renderSync(); }
}
function renderSync(){
  const s = $('sync-status'); if (!s) return;
  if (!timer) renderLog();
  const left = log.filter(e => !e.synced).length;
  s.textContent = !syncUrl() ? 'Not connected. Timed waits stay on this phone only.' : syncMsg || (left ? left + ' waiting to sync.' : 'Connected.');
  $('sync-now').hidden = !syncUrl();
}

function exportCsv(){
  const rows = [COLS];
  for (const e of log){ const r = rowFor(e); rows.push(COLS.map(c => r[c])); }
  const csv = rows.map(r => r.map(c => /[",\n]/.test(String(c)) ? '"' + String(c).replace(/"/g,'""') + '"' : c).join(',')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv'})); a.download = 'wait-watcher-log.csv'; document.body.append(a); a.click(); a.remove();
}

/* shell */
function render(){
  const now = Date.now();
  if (rides.length) rides = rides.map(r => { const t = track[r.id]; return t ? Object.assign({}, r, flagsFor(r.status, r.wait, t, now)) : r; });
  const nFlag = rides.filter(r => r.hunch || r.reopen).length;
  $('status-line').textContent = lastError ? lastError : lastFetch ? 'Waits updated ' + fmtAge(now - lastFetch) + ' · ' + nFlag + ' possible short line' + (nFlag === 1 ? '' : 's') : 'Loading wait times…';
  renderMap(); renderList(); renderLog(); renderLogger();
  if (!$('sheet').hidden && selectedId) { const keep = selectedId; const r = rides.find(x => x.id === keep); if (r) { $('s-stale').textContent = r.status === 'OPERATING' && r.wait !== null ? (r.exact ? '' : '≥ ') + fmtMin(r.staleMin) : '–'; } }
}
function show(view){
  for (const v of ['map','list','log']) $('view-' + v).hidden = v !== view;
  document.querySelectorAll('.tab').forEach(t => { if (t.dataset.view === view) t.setAttribute('aria-current','page'); else t.removeAttribute('aria-current'); });
  if (view !== 'map') closeSheet();
  if (view === 'map' && map) setTimeout(() => map.invalidateSize(), 0);
}
function init(){
  renderParkSwitch();
  document.querySelectorAll('.park-btn').forEach(b => b.addEventListener('click', () => setPark(b.dataset.park)));
  initMap();
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => show(t.dataset.view)));
  $('btn-refresh').addEventListener('click', () => refresh(true));
  $('sheet-x').addEventListener('click', closeSheet);
  $('s-timer').addEventListener('click', startTimer);
  $('t-stop').addEventListener('click', () => stopTimer(true));
  $('t-cancel').addEventListener('click', () => stopTimer(false));
  $('t-flag').addEventListener('change', e => { if (timer){ timer.flagged = e.target.checked; store.set('timer', timer); } });
  $('btn-export').addEventListener('click', exportCsv);
  $('btn-clear').addEventListener('click', () => { $('clear-confirm').hidden = false; });
  $('clear-no').addEventListener('click', () => { $('clear-confirm').hidden = true; });
  $('clear-yes').addEventListener('click', () => { log = []; store.set('log', log); $('clear-confirm').hidden = true; syncMsg = ''; render(); renderSync(); });
  const ss = $('set-stale'), sm = $('set-minwait'), sr = $('set-reopen'); ss.value = settings.stale; sm.value = settings.minWait; sr.value = settings.reopen;
  const saveSet = () => { const a = parseInt(ss.value, 10), b = parseInt(sm.value, 10), c = parseInt(sr.value, 10); if (a >= 5) settings.stale = a; if (b >= 0) settings.minWait = b; if (c >= 5) settings.reopen = c; store.set('settings', settings); render(); };
  ss.addEventListener('change', saveSet); sm.addEventListener('change', saveSet); sr.addEventListener('change', saveSet);
  const lu = $('logger-url'); lu.value = settings.loggerUrl || '';
  $('logger-save').addEventListener('click', async () => {
    const v = lu.value.trim();
    if (v && !/^https:\/\/script\.google(usercontent)?\.com\//.test(v)){ loggerMsg = 'Paste the logger’s web app URL from Apps Script (it starts with https://script.google.com/).'; renderLogger(); return; }
    if (v && v === syncUrl()){ loggerMsg = 'That’s the Google Sheet sync URL. The logger is its own Apps Script project with its own web app URL.'; renderLogger(); return; }
    settings.loggerUrl = v; store.set('settings', settings); logger = null; store.set('logger', null);
    if (!v){ loggerMsg = ''; renderLogger(); return; }
    loggerMsg = 'Checking the link…'; renderLogger();
    const ok = await fetchLogger();
    if (!ok) loggerMsg = 'That link didn’t answer like the posted wait logger. Check that it’s the logger’s web app URL and that access is set to Anyone.';
    renderLogger();
    if (ok && liveData){ const now = Date.now(); updateTracking(liveData, now); rides = merge(liveData, now); render(); }
  });
  renderLogger();
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - lastFetch > 60000) refresh(); });
  setInterval(() => { if (!document.hidden){ refresh(); if (log.some(e => !e.synced)) syncLog(); } }, POLL_MS);
  const su = $('sync-url'); su.value = settings.syncUrl || '';
  $('sync-save').addEventListener('click', () => {
    const v = su.value.trim();
    if (v && !/^https:\/\/script\.google(usercontent)?\.com\//.test(v)){ syncMsg = 'Paste the web app URL from Apps Script (it starts with https://script.google.com/).'; renderSync(); return; }
    settings.syncUrl = v; store.set('settings', settings); syncMsg = ''; v ? testSync() : renderSync();
  });
  $('sync-now').addEventListener('click', syncLog);
  window.addEventListener('online', syncLog);
  renderSync(); syncLog();
  setInterval(() => { if (timer) renderLog(); }, 1000);
  setInterval(render, 30000);
  refresh();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
init();
