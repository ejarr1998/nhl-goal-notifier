// NHL Goal Notifier — Multi-team edition
// Subscribe to any NHL team and get push notifications via ntfy.sh
// when your team scores a goal during live games.

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// ============================================================
// CONFIGURATION
// ============================================================
const CONFIG = {
  PORT: process.env.PORT || 3000,
  NHL_API: 'https://api-web.nhle.com/v1',
  DATA_FILE: path.join(__dirname, 'data', 'subscriptions.json'),

  // Polling intervals (ms)
  POLL_LIVE_GAME: 15 * 1000,
  POLL_SCHEDULE_CHECK: 10 * 60 * 1000,
  POLL_PRE_GAME: 3 * 60 * 1000,
  POLL_INTERMISSION: 30 * 1000,
};

// ============================================================
// NHL TEAMS
// ============================================================
const NHL_TEAMS = [
  { abbrev: 'ANA', id: 24, name: 'Anaheim Ducks', conference: 'Western', division: 'Pacific' },
  { abbrev: 'BOS', id: 6, name: 'Boston Bruins', conference: 'Eastern', division: 'Atlantic' },
  { abbrev: 'BUF', id: 7, name: 'Buffalo Sabres', conference: 'Eastern', division: 'Atlantic' },
  { abbrev: 'CGY', id: 20, name: 'Calgary Flames', conference: 'Western', division: 'Pacific' },
  { abbrev: 'CAR', id: 12, name: 'Carolina Hurricanes', conference: 'Eastern', division: 'Metropolitan' },
  { abbrev: 'CHI', id: 16, name: 'Chicago Blackhawks', conference: 'Western', division: 'Central' },
  { abbrev: 'COL', id: 21, name: 'Colorado Avalanche', conference: 'Western', division: 'Central' },
  { abbrev: 'CBJ', id: 29, name: 'Columbus Blue Jackets', conference: 'Eastern', division: 'Metropolitan' },
  { abbrev: 'DAL', id: 25, name: 'Dallas Stars', conference: 'Western', division: 'Central' },
  { abbrev: 'DET', id: 17, name: 'Detroit Red Wings', conference: 'Eastern', division: 'Atlantic' },
  { abbrev: 'EDM', id: 22, name: 'Edmonton Oilers', conference: 'Western', division: 'Pacific' },
  { abbrev: 'FLA', id: 13, name: 'Florida Panthers', conference: 'Eastern', division: 'Atlantic' },
  { abbrev: 'LAK', id: 26, name: 'Los Angeles Kings', conference: 'Western', division: 'Pacific' },
  { abbrev: 'MIN', id: 30, name: 'Minnesota Wild', conference: 'Western', division: 'Central' },
  { abbrev: 'MTL', id: 8, name: 'Montreal Canadiens', conference: 'Eastern', division: 'Atlantic' },
  { abbrev: 'NSH', id: 18, name: 'Nashville Predators', conference: 'Western', division: 'Central' },
  { abbrev: 'NJD', id: 1, name: 'New Jersey Devils', conference: 'Eastern', division: 'Metropolitan' },
  { abbrev: 'NYI', id: 2, name: 'New York Islanders', conference: 'Eastern', division: 'Metropolitan' },
  { abbrev: 'NYR', id: 3, name: 'New York Rangers', conference: 'Eastern', division: 'Metropolitan' },
  { abbrev: 'OTT', id: 9, name: 'Ottawa Senators', conference: 'Eastern', division: 'Atlantic' },
  { abbrev: 'PHI', id: 4, name: 'Philadelphia Flyers', conference: 'Eastern', division: 'Metropolitan' },
  { abbrev: 'PIT', id: 5, name: 'Pittsburgh Penguins', conference: 'Eastern', division: 'Metropolitan' },
  { abbrev: 'SJS', id: 28, name: 'San Jose Sharks', conference: 'Western', division: 'Pacific' },
  { abbrev: 'SEA', id: 55, name: 'Seattle Kraken', conference: 'Western', division: 'Pacific' },
  { abbrev: 'STL', id: 19, name: 'St. Louis Blues', conference: 'Western', division: 'Central' },
  { abbrev: 'TBL', id: 14, name: 'Tampa Bay Lightning', conference: 'Eastern', division: 'Atlantic' },
  { abbrev: 'TOR', id: 10, name: 'Toronto Maple Leafs', conference: 'Eastern', division: 'Atlantic' },
  { abbrev: 'UTA', id: 32, name: 'Utah Hockey Club', conference: 'Western', division: 'Central' },
  { abbrev: 'VAN', id: 23, name: 'Vancouver Canucks', conference: 'Western', division: 'Pacific' },
  { abbrev: 'VGK', id: 54, name: 'Vegas Golden Knights', conference: 'Western', division: 'Pacific' },
  { abbrev: 'WSH', id: 15, name: 'Washington Capitals', conference: 'Eastern', division: 'Metropolitan' },
  { abbrev: 'WPG', id: 52, name: 'Winnipeg Jets', conference: 'Western', division: 'Central' },
];

const TEAM_BY_ABBREV = {};
const TEAM_BY_ID = {};
for (const t of NHL_TEAMS) {
  TEAM_BY_ABBREV[t.abbrev] = t;
  TEAM_BY_ID[t.id] = t;
}

// ============================================================
// PERSISTENCE
// ============================================================
let subscriptions = [];

function ensureDataDir() {
  const dir = path.dirname(CONFIG.DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadSubscriptions() {
  ensureDataDir();
  try {
    if (fs.existsSync(CONFIG.DATA_FILE)) {
      subscriptions = JSON.parse(fs.readFileSync(CONFIG.DATA_FILE, 'utf-8'));
      console.log(`Loaded ${subscriptions.length} subscription(s)`);
    }
  } catch (e) {
    console.error('Failed to load subscriptions:', e.message);
    subscriptions = [];
  }
}

function saveSubscriptions() {
  ensureDataDir();
  fs.writeFileSync(CONFIG.DATA_FILE, JSON.stringify(subscriptions, null, 2));
}

function addSubscription(ntfyTopic, teamAbbrev) {
  const exists = subscriptions.find(
    (s) => s.ntfyTopic === ntfyTopic && s.teamAbbrev === teamAbbrev
  );
  if (exists) return { ok: false, error: 'You are already subscribed to this team' };

  const sub = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    ntfyTopic,
    teamAbbrev,
    createdAt: new Date().toISOString(),
  };
  subscriptions.push(sub);
  saveSubscriptions();
  return { ok: true, subscription: sub };
}

function removeSubscription(id) {
  const idx = subscriptions.findIndex((s) => s.id === id);
  if (idx === -1) return { ok: false, error: 'Not found' };
  subscriptions.splice(idx, 1);
  saveSubscriptions();
  return { ok: true };
}

function getActiveTeams() {
  const teams = new Set();
  for (const s of subscriptions) teams.add(s.teamAbbrev);
  return [...teams];
}

function getSubscribersForTeam(teamAbbrev) {
  return subscriptions.filter((s) => s.teamAbbrev === teamAbbrev);
}

// ============================================================
// HTTP HELPERS
// ============================================================
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'NHLGoalNotifier/2.0' } }, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(new Error(`JSON parse failed for ${url}: ${e.message}`)); }
        });
        res.on('error', reject);
      })
      .on('error', reject);
  });
}

function sendNotification(topic, { title, message, imageUrl, iconUrl, priority = '4' }) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      topic: topic,
      title: title,
      message: message,
      priority: parseInt(priority),
      tags: ['ice_hockey', 'goal'],
      ...(imageUrl ? { attach: imageUrl } : {}),
      ...(iconUrl ? { icon: iconUrl } : {}),
    });

    const req = https.request(
      {
        hostname: 'ntfy.sh',
        path: '/',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve(data));
        res.on('error', reject);
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ============================================================
// NHL API
// ============================================================
async function getTeamScheduleToday(teamAbbrev) {
  const today = new Date().toISOString().split('T')[0];
  const url = `${CONFIG.NHL_API}/club-schedule/${teamAbbrev}/week/${today}`;
  try {
    const data = await fetchJSON(url);
    return (data.games || []).filter((g) => g.gameDate === today);
  } catch (err) {
    console.error(`Schedule error (${teamAbbrev}):`, err.message);
    return [];
  }
}

async function getPlayByPlay(gameId) {
  return fetchJSON(`${CONFIG.NHL_API}/gamecenter/${gameId}/play-by-play`);
}

function buildRosterFromPBP(pbpData) {
  const roster = {};
  if (pbpData.rosterSpots) {
    for (const p of pbpData.rosterSpots) {
      roster[p.playerId] = {
        firstName: p.firstName?.default || p.firstName || '',
        lastName: p.lastName?.default || p.lastName || '',
        sweaterNumber: p.sweaterNumber,
        teamId: p.teamId,
        headshot: p.headshot,
      };
    }
  }
  return roster;
}

function getGameStateFromAPI(apiState) {
  switch (apiState) {
    case 'FUT': case 'PRE': return 'PRE_GAME';
    case 'LIVE': case 'CRIT': return 'LIVE';
    case 'OFF': case 'FINAL': return 'POST_GAME';
    default: return 'IDLE';
  }
}

// ============================================================
// GAME TRACKERS
// ============================================================
const gameTrackers = {};

async function processGame(gameId, teamAbbrevs, { catchUp = false } = {}) {
  let tracker = gameTrackers[gameId];
  const isNew = !tracker;
  if (!tracker) {
    tracker = { teamAbbrevs: new Set(teamAbbrevs), knownGoalEvents: new Set(), rosterCache: {}, gameState: 'LIVE' };
    gameTrackers[gameId] = tracker;
  }
  for (const t of teamAbbrevs) tracker.teamAbbrevs.add(t);

  let pbpData;
  try { pbpData = await getPlayByPlay(gameId); }
  catch (err) {
    console.error(`  PBP error (game ${gameId}):`, err.message);
    return 'LIVE';
  }

  tracker.gameState = getGameStateFromAPI(pbpData.gameState);
  if (tracker.gameState === 'PRE_GAME') return 'PRE_GAME';

  const roster = buildRosterFromPBP(pbpData);
  Object.assign(tracker.rosterCache, roster);

  const homeAbbrev = pbpData.homeTeam?.abbrev;
  const awayAbbrev = pbpData.awayTeam?.abbrev;
  const homeId = pbpData.homeTeam?.id;
  const awayId = pbpData.awayTeam?.id;

  const goals = (pbpData.plays || []).filter((p) => p.typeDescKey === 'goal');

  // If catching up (new mid-game subscription), mark all existing goals as known
  // so we don't spam notifications for goals that already happened
  if (catchUp && isNew) {
    for (const goal of goals) {
      tracker.knownGoalEvents.add(`${gameId}-${goal.eventId}`);
    }
    console.log(`  Caught up on ${goals.length} existing goals for game ${gameId}`);
    return tracker.gameState;
  }

  for (const goal of goals) {
    const eventKey = `${gameId}-${goal.eventId}`;
    if (tracker.knownGoalEvents.has(eventKey)) continue;
    tracker.knownGoalEvents.add(eventKey);

    const details = goal.details || {};
    const scoringTeamId = details.eventOwnerTeamId;
    let scoringAbbrev = null;
    if (scoringTeamId === homeId) scoringAbbrev = homeAbbrev;
    else if (scoringTeamId === awayId) scoringAbbrev = awayAbbrev;
    if (!scoringAbbrev || !tracker.teamAbbrevs.has(scoringAbbrev)) continue;

    const subs = getSubscribersForTeam(scoringAbbrev);
    if (subs.length === 0) continue;

    const scorerId = details.scoringPlayerId;
    const scorer = tracker.rosterCache[scorerId];
    const scorerName = scorer ? `${scorer.firstName} ${scorer.lastName}` : 'Unknown';
    const scorerNum = scorer?.sweaterNumber ? `#${scorer.sweaterNumber}` : '';

    const assists = [];
    for (const key of ['assist1PlayerId', 'assist2PlayerId']) {
      if (details[key]) {
        const a = tracker.rosterCache[details[key]];
        if (a) assists.push(`${a.firstName} ${a.lastName}`);
      }
    }

    const homeScore = details.homeScore ?? '?';
    const awayScore = details.awayScore ?? '?';
    const opponentAbbrev = scoringAbbrev === homeAbbrev ? awayAbbrev : homeAbbrev;
    const myScore = scoringAbbrev === homeAbbrev ? homeScore : awayScore;
    const theirScore = scoringAbbrev === homeAbbrev ? awayScore : homeScore;
    const scoreStr = `${scoringAbbrev} ${myScore} - ${opponentAbbrev} ${theirScore}`;

    const period = goal.periodDescriptor;
    const periodStr = period ? `${period.periodType === 'OT' ? 'OT' : `P${period.number}`} ${goal.timeInPeriod || ''}` : '';

    const title = `🚨 GOAL! ${scorerName} ${scorerNum}`;
    const assistStr = assists.length > 0 ? `Assists: ${assists.join(', ')}` : 'Unassisted';
    const message = `${scoreStr}\n${periodStr}\n${assistStr}`;
    const imageUrl = scorer?.headshot || null;
    const iconUrl = `https://assets.nhle.com/logos/nhl/svg/${scoringAbbrev}_dark.svg`;

    console.log(`  🚨 ${TEAM_BY_ABBREV[scoringAbbrev]?.name} GOAL: ${scorerName} | ${scoreStr}`);

    for (const sub of subs) {
      try {
        await sendNotification(sub.ntfyTopic, { title, message, imageUrl, iconUrl, priority: '5' });
        console.log(`    ✅ Notified ${sub.ntfyTopic}`);
      } catch (err) {
        console.error(`    ❌ Failed ${sub.ntfyTopic}:`, err.message);
      }
    }
  }

  if (tracker.gameState === 'POST_GAME') { delete gameTrackers[gameId]; return 'POST_GAME'; }
  return pbpData.clock?.inIntermission ? 'INTERMISSION' : tracker.gameState;
}

// Catch up a newly subscribed team — check if there's a live game
// and pre-seed existing goals so we don't spam old notifications
async function catchUpNewSubscription(teamAbbrev) {
  try {
    const games = await getTeamScheduleToday(teamAbbrev);
    for (const g of games) {
      const st = getGameStateFromAPI(g.gameState);
      if (st === 'LIVE' || st === 'PRE_GAME') {
        console.log(`  Catching up game ${g.id} for new ${teamAbbrev} subscription`);
        await processGame(g.id, [teamAbbrev], { catchUp: true });

        // Also trigger an immediate poll cycle so we start tracking right away
        if (pollTimeout) clearTimeout(pollTimeout);
        pollTimeout = setTimeout(poll, 1000);
      }
    }
  } catch (err) {
    console.error(`  Catch-up error for ${teamAbbrev}:`, err.message);
  }
}

// ============================================================
// MAIN POLLING LOOP
// ============================================================
let pollTimeout = null;

async function poll() {
  const now = new Date();
  const activeTeams = getActiveTeams();

  if (activeTeams.length === 0) {
    console.log(`[${now.toISOString()}] No subscriptions`);
    scheduleNext(CONFIG.POLL_SCHEDULE_CHECK);
    return;
  }

  console.log(`[${now.toISOString()}] Polling ${activeTeams.length} team(s): ${activeTeams.join(', ')}`);

  let hasLive = false, hasPre = false, hasIntermission = false;
  const gameTeamMap = {};

  for (const team of activeTeams) {
    try {
      const games = await getTeamScheduleToday(team);
      for (const g of games) {
        if (getGameStateFromAPI(g.gameState) === 'POST_GAME') continue;
        if (!gameTeamMap[g.id]) gameTeamMap[g.id] = new Set();
        gameTeamMap[g.id].add(team);
      }
    } catch (err) { console.error(`  ${team}:`, err.message); }
  }

  for (const [gid, teamSet] of Object.entries(gameTeamMap)) {
    try {
      const r = await processGame(parseInt(gid), [...teamSet]);
      if (r === 'LIVE') hasLive = true;
      else if (r === 'PRE_GAME') hasPre = true;
      else if (r === 'INTERMISSION') hasIntermission = true;
    } catch (err) { console.error(`  Game ${gid}:`, err.message); }
  }

  if (hasLive) scheduleNext(CONFIG.POLL_LIVE_GAME);
  else if (hasIntermission) scheduleNext(CONFIG.POLL_INTERMISSION);
  else if (hasPre) scheduleNext(CONFIG.POLL_PRE_GAME);
  else scheduleNext(CONFIG.POLL_SCHEDULE_CHECK);
}

function scheduleNext(delay) {
  if (pollTimeout) clearTimeout(pollTimeout);
  console.log(`  Next poll in ${Math.round(delay / 1000)}s`);
  pollTimeout = setTimeout(poll, delay);
}

// ============================================================
// WEB SERVER
// ============================================================
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch { reject(new Error('Invalid JSON')); } });
    req.on('error', reject);
  });
}

function jsonRes(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    const html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf-8');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/teams') {
    return jsonRes(res, 200, { teams: NHL_TEAMS });
  }

  if (req.method === 'GET' && url.pathname === '/api/subscriptions') {
    const topic = url.searchParams.get('topic');
    const filtered = topic ? subscriptions.filter((s) => s.ntfyTopic === topic) : subscriptions;
    return jsonRes(res, 200, { subscriptions: filtered.map((s) => ({ ...s, team: TEAM_BY_ABBREV[s.teamAbbrev] })) });
  }

  if (req.method === 'POST' && url.pathname === '/api/subscribe') {
    try {
      const body = await parseBody(req);
      const { ntfyTopic, teamAbbrev } = body;
      if (!ntfyTopic || !teamAbbrev) return jsonRes(res, 400, { error: 'ntfyTopic and teamAbbrev required' });
      if (!TEAM_BY_ABBREV[teamAbbrev]) return jsonRes(res, 400, { error: 'Invalid team' });
      const clean = ntfyTopic.trim().replace(/[^a-zA-Z0-9_-]/g, '');
      if (clean.length < 3) return jsonRes(res, 400, { error: 'Topic must be 3+ characters' });

      const result = addSubscription(clean, teamAbbrev);
      if (!result.ok) return jsonRes(res, 409, { error: result.error });
      console.log(`+ Sub: ${clean} → ${teamAbbrev}`);

      // Catch up on any live game in the background (don't block the response)
      catchUpNewSubscription(teamAbbrev);

      return jsonRes(res, 201, { subscription: { ...result.subscription, team: TEAM_BY_ABBREV[teamAbbrev] } });
    } catch (err) { return jsonRes(res, 400, { error: err.message }); }
  }

  if (req.method === 'DELETE' && url.pathname.startsWith('/api/subscribe/')) {
    const id = url.pathname.split('/').pop();
    const result = removeSubscription(id);
    if (!result.ok) return jsonRes(res, 404, { error: result.error });
    console.log(`- Sub removed: ${id}`);
    return jsonRes(res, 200, { ok: true });
  }

  if (req.method === 'POST' && url.pathname === '/api/test') {
    try {
      const body = await parseBody(req);
      const { ntfyTopic, teamAbbrev } = body;
      if (!ntfyTopic) return jsonRes(res, 400, { error: 'ntfyTopic required' });
      const team = TEAM_BY_ABBREV[teamAbbrev] || { name: 'NHL', abbrev: 'NHL' };
      console.log(`Test notification → topic: ${ntfyTopic}, team: ${team.name}`);
      const result = await sendNotification(ntfyTopic.trim(), {
        title: `🧪 Test: ${team.name} Goal Alerts`,
        message: `Notifications are working!\nYou'll be notified when ${team.name} scores.`,
        iconUrl: `https://assets.nhle.com/logos/nhl/svg/${team.abbrev}_dark.svg`,
        priority: '3',
      });
      console.log(`Test notification result:`, result);
      return jsonRes(res, 200, { ok: true });
    } catch (err) {
      console.error(`Test notification FAILED:`, err.message, err.code || '');
      return jsonRes(res, 500, { error: `${err.message} (${err.code || 'no code'})` });
    }
  }

  // Debug endpoint — check outbound connectivity
  if (req.method === 'GET' && url.pathname === '/api/debug') {
    const results = {};
    // Test NHL API
    try {
      const nhl = await fetchJSON(`${CONFIG.NHL_API}/schedule/now`);
      results.nhl_api = 'OK';
      results.nhl_games_today = (nhl.gameWeek?.[0]?.games || []).length;
    } catch (err) {
      results.nhl_api = `FAIL: ${err.message}`;
    }
    // Test ntfy.sh connectivity
    try {
      await new Promise((resolve, reject) => {
        https.get('https://ntfy.sh/v1/health', (res) => {
          let d = '';
          res.on('data', (c) => (d += c));
          res.on('end', () => { results.ntfy_health = `OK (status ${res.statusCode}): ${d}`; resolve(); });
          res.on('error', reject);
        }).on('error', reject);
      });
    } catch (err) {
      results.ntfy_health = `FAIL: ${err.message}`;
    }
    // Show subscriptions
    results.subscriptions = subscriptions.map(s => ({ topic: s.ntfyTopic, team: s.teamAbbrev }));
    results.trackedGames = Object.keys(gameTrackers);
    return jsonRes(res, 200, results);
  }

  if (req.method === 'GET' && url.pathname === '/api/health') {
    return jsonRes(res, 200, {
      status: 'ok',
      subscriptions: subscriptions.length,
      activeTeams: getActiveTeams(),
      trackedGames: Object.keys(gameTrackers).length,
    });
  }

  res.writeHead(404);
  res.end('Not found');
});

// ============================================================
// START
// ============================================================
console.log('===========================================');
console.log('  🏒 NHL Goal Notifier');
console.log('===========================================');
loadSubscriptions();
server.listen(CONFIG.PORT, () => {
  console.log(`Server on port ${CONFIG.PORT}`);
  console.log(`Active teams: ${getActiveTeams().join(', ') || '(none)'}\n`);
  poll();
});
