// Create the schema and seed sample data. Idempotent: safe to run repeatedly.
// `node src/initdb.js --reset` drops all app tables first.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import bcrypt from 'bcryptjs';
import { query, getDb, hasDbUrl, hasAnyDbEnv } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', 'db', p), 'utf8');

const TABLES = [
  'marketplace_purchases','marketplace_listings','subscriptions','promos',
  'tracking_entries','notifications','messages','message_threads',
  'workout_comments','workout_logs','workouts','client_programs','programs',
  'exercises','join_requests','gym_members','gym_roles','gym_teams',
  'coach_clients','client_profiles','coach_profiles','users',
];

// Split a .sql file into statements. Good enough for our schema (no $$ bodies,
// no semicolons inside string literals that span statements).
function statements(sql) {
  return sql
    .replace(/--[^\n]*/g, '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function exec(sql) {
  for (const stmt of statements(sql)) await query(stmt);
}

export async function initDb({ reset = false } = {}) {
  if (reset) {
    for (const t of TABLES) await query(`DROP TABLE IF EXISTS ${t} CASCADE`);
    console.log('[db] dropped existing tables');
  }
  await exec(read('schema.sql'));

  const { rows } = await query('SELECT count(*)::int AS n FROM users');
  if (rows[0].n === 0) {
    await seed();
    console.log('[db] seeded sample data');
  }
}

async function seed() {
  const hash = (pw) => bcrypt.hashSync(pw, 10);
  // All demo accounts share this password.
  const PW = hash('gotrain');

  const u = async (email, name, role, extra = {}) => {
    const { rows } = await query(
      `INSERT INTO users(email,password_hash,full_name,role,phone,locale)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [email, PW, name, role, extra.phone || null, extra.locale || 'en']
    );
    return rows[0].id;
  };

  // Coach + two athletes (from the screenshots: Heba, Nada).
  const coach = await u('coach@gotrain.app', 'Coach Ahmed', 'coach');
  const heba = await u('heba@gotrain.app', 'Heba Elmenyawy', 'client', { locale: 'en' });
  const nada = await u('nada@gotrain.app', 'Nada Ahmed', 'client');
  await query(`INSERT INTO coach_profiles(user_id,headline,specialty,gym_name,verified)
               VALUES ($1,'CrossFit & Hyrox coach','Strength & conditioning','Go Train Gym',true)`, [coach]);
  await query(`INSERT INTO client_profiles(user_id,goal,weight_kg) VALUES ($1,'Competition prep',58)`, [heba]);
  await query(`INSERT INTO client_profiles(user_id,goal,weight_kg) VALUES ($1,'General fitness',60)`, [nada]);
  for (const c of [heba, nada])
    await query(`INSERT INTO coach_clients(coach_id,client_id) VALUES ($1,$2)`, [coach, c]);

  // Gym team, roles, members.
  const { rows: tr } = await query(
    `INSERT INTO gym_teams(name,owner_id) VALUES ('Go Train Gym',$1) RETURNING id`, [coach]);
  const team = tr[0].id;
  const { rows: rr } = await query(
    `INSERT INTO gym_roles(team_id,name,can_manage_clients,can_manage_programs)
     VALUES ($1,'Head Coach',true,true) RETURNING id`, [team]);
  await query(`INSERT INTO gym_roles(team_id,name,can_manage_programs) VALUES ($1,'Assistant Coach',true)`, [team]);
  await query(`INSERT INTO gym_members(team_id,user_id,role_id) VALUES ($1,$2,$3)`, [team, coach, rr[0].id]);
  await query(`INSERT INTO gym_members(team_id,user_id,is_paying_client) VALUES ($1,$2,true)`, [team, heba]);
  await query(`INSERT INTO join_requests(team_id,user_id) VALUES ($1,$2)`, [team, nada]);

  // Exercise library.
  const exLib = [
    ['Back Squat', 'Strength'], ['Push Press', 'Strength'], ['Deadlift', 'Strength'],
    ['Thruster', 'WOD'], ['Row', 'Engine'], ['Run', 'Engine'],
    ['KB Swing', 'WOD'], ['Burpee', 'WOD'], ['Front Hold', 'Core'],
  ];
  for (const [name, cat] of exLib)
    await query(`INSERT INTO exercises(name,category,created_by) VALUES ($1,$2,$3)`, [name, cat, coach]);

  // Programs (mirrors the screenshots' program list).
  const programNames = [
    'Competition Prep', 'Hyrox Training - SC', 'CrossFit-(L2)-01',
    'Strength & Engine - 01', 'Strength & Engine - 02', 'Ramadan Program',
  ];
  const progIds = {};
  for (const name of programNames) {
    const { rows } = await query(
      `INSERT INTO programs(name,kind,owner_id,team_id,description,is_published)
       VALUES ($1,'ongoing',$2,$3,$4,$5) RETURNING id`,
      [name, coach, team, `${name} — coach-built training block.`, name === 'Competition Prep']
    );
    progIds[name] = rows[0].id;
  }

  // Heba is on Competition Prep + Strength & Engine - 02.
  await query(`INSERT INTO client_programs(program_id,client_id) VALUES ($1,$2)`, [progIds['Competition Prep'], heba]);
  await query(`INSERT INTO client_programs(program_id,client_id,is_active) VALUES ($1,$2,false)`, [progIds['Strength & Engine - 02'], heba]);

  // Workouts transcribed from the History screenshots.
  const W = [
    ['Competition Prep', 'Day 1', 'A', '2026-10-03',
      'This will be our last Hard week\n\nStrength\nBack Squat — 4 × 3 @ 75–80%\nPush Press — 4 × 4 @ 72–75%\nDeadlift — 3 × 4 @ 75%\nFarmer Carry — 3 × 40m\n\nEngine\n4 Rounds / 2 min rest between\n350m Run\n10 Cal Row\n10 Dual DB Hang Clean\n8 Burpees Over Bench\n\nWOD\n3 Rounds\n10 KB Goblet Lunges\n8 KB Push Press\n10 Jumping Pull-Ups\n12 Burpee BJO\n30 Single Unders',
      { status: 'done' }],
    ['Strength & Engine - 02', 'RUN', null, '2026-01-22', '10 Rounds:\n2 min ON\n1min OFF\nFor Max Distance',
      { status: 'done', result: 'heba 3 kilometers\nnada 3.07 kilometers' }],
    ['Strength & Engine - 02', 'Strength', null, '2026-01-21',
      '- Front squat\n4 sets x 7 reps (tempo 31×1)\n@72-78%\n2 min rest between sets\n- Bench press\n4 sets x 7 reps (tempo 31×1)\n@72-78%\n2 min rest between sets',
      { status: 'done', result: 'front squat 38 kg\nbench 30.5 kg' }],
    ['Strength & Engine - 02', 'Strength', null, '2026-01-20',
      '- Thruster\n5 sets x 5 reps\n@65-75% of 1RM front squat\n- Sumo deadlift high pull\n5 sets x\n30 sec ON / 120 sec OFF\nMax reps while maintaining quality @40% of 1RM deadlift',
      { status: 'done', result: 'sumo dead lift 51.3\nthruster 38 kg' }],
    ['Strength & Engine - 02', 'Conditioning', null, '2026-01-20',
      'AMRAP 12 min:\n2,3,4,5,.... 2xDB Push press\n4,5,6,7,..... Cal Row',
      { status: 'done', result: '13 calories\n12 push press' }],
    ['Strength & Engine - 02', 'Strength', null, '2026-01-13',
      '- Romanian deadlift\n4 sets x 12 reps (tempo 20×1) @55%\n2 min rest between sets\n- Seal row\n4 sets x 9 reps (tempo 20×0)\nHeavier weight than last week',
      { status: 'done', result: 'deadlift\nheba 56 kg\nnada 56 kg\nseal row\nheba 25 kg\nnada 25 kg', comment: 'Great progress on the RDL, keep the back flat.' }],
    ['Strength & Engine - 02', 'RUN', null, '2026-01-08',
      'Warm-up: 10 minutes of light jogging, dynamic stretches.\n\n• Main Run:\n7 km run at a steady pace (slightly slower than 5k race pace, but steady and sustainable).\n\n• Cooldown: 5 minutes of light jogging or walking, static stretching.',
      { status: 'done', result: 'heba 59 min' }],
    ['Strength & Engine - 02', 'Long Conditioning', null, '2026-01-04',
      'AMRAP 35 min:\n40/30 Cal Row\n10 Pushups\n15 Med ball sit-ups\n20 KB Swing (20/16Kg)\n60 Single under',
      { status: 'missed' }],
  ];
  let pos = 0;
  for (const [prog, title, letter, date, body, meta] of W) {
    const { rows } = await query(
      `INSERT INTO workouts(program_id,title,letter,scheduled_on,position,body)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [progIds[prog], title, letter, date, pos++, body]
    );
    const wid = rows[0].id;
    if (meta.status === 'missed') {
      await query(`INSERT INTO workout_logs(workout_id,client_id,status,logged_on) VALUES ($1,$2,'missed',$3)`, [wid, heba, date]);
    } else if (meta.result) {
      await query(`INSERT INTO workout_logs(workout_id,client_id,status,result,logged_on) VALUES ($1,$2,'done',$3,$4)`, [wid, heba, meta.result, date]);
    }
    if (meta.comment)
      await query(`INSERT INTO workout_comments(workout_id,author_id,body) VALUES ($1,$2,$3)`, [wid, coach, meta.comment]);
  }
  // One Arabic comment on Day 1 to exercise RTL.
  const { rows: d1 } = await query(`SELECT id FROM workouts WHERE title='Day 1' LIMIT 1`);
  await query(`INSERT INTO workout_comments(workout_id,author_id,body) VALUES ($1,$2,$3)`,
    [d1[0].id, coach, 'أحسنتِ يا هبة، ركزي على الإحماء قبل الـ Back Squat']);

  // Messaging.
  const { rows: th } = await query(
    `INSERT INTO message_threads(coach_id,client_id) VALUES ($1,$2) RETURNING id`, [coach, heba]);
  const thread = th[0].id;
  await query(`INSERT INTO messages(thread_id,sender_id,body) VALUES ($1,$2,'Welcome to Go Train! Ready for the last hard week?')`, [thread, coach]);
  await query(`INSERT INTO messages(thread_id,sender_id,body) VALUES ($1,$2,'Yes coach! Legs are sore but good 💪')`, [thread, heba]);

  // Notifications.
  for (const [kind, title, body] of [
    ['workout', 'New workout: Day 1', 'Competition Prep — your last hard week is live.'],
    ['message', 'Message from Coach Ahmed', 'Welcome to Go Train!'],
    ['promo', 'Ramadan Program 20% off', 'Use code RAMADAN20 before the end of the month.'],
  ]) await query(`INSERT INTO notifications(user_id,kind,title,body) VALUES ($1,$2,$3,$4)`, [heba, kind, title, body]);

  // Progress tracking points.
  const track = [
    ['Back Squat 1RM', 'kg', [[ '2025-11-01', 70], ['2025-12-01', 75], ['2026-01-15', 80]]],
    ['Bodyweight', 'kg', [['2025-11-01', 59], ['2026-01-01', 58.5], ['2026-02-01', 58]]],
    ['5k Run', 'min', [['2025-11-01', 27], ['2026-01-01', 25.5], ['2026-02-01', 24.4]]],
  ];
  for (const [metric, unit, points] of track)
    for (const [date, val] of points)
      await query(`INSERT INTO tracking_entries(client_id,metric,unit,value,recorded_on) VALUES ($1,$2,$3,$4,$5)`, [heba, metric, unit, val, date]);

  // Marketplace.
  const { rows: ml } = await query(
    `INSERT INTO marketplace_listings(program_id,seller_id,title,summary,price_cents,currency)
     VALUES ($1,$2,'8-Week Competition Prep','Peak for your next comp with this 8-week block.',4900,'USD') RETURNING id`,
    [progIds['Competition Prep'], coach]);
  await query(`INSERT INTO marketplace_listings(program_id,seller_id,title,summary,price_cents,currency)
     VALUES ($1,$2,'Hyrox Starter','Build your Hyrox engine in 6 weeks.',2900,'USD')`,
    [progIds['Hyrox Training - SC'], coach]);
  await query(`INSERT INTO marketplace_purchases(listing_id,buyer_id,price_cents,currency) VALUES ($1,$2,4900,'USD')`, [ml[0].id, nada]);

  // Promos + subscriptions.
  await query(`INSERT INTO promos(code,title,description,percent_off) VALUES ('RAMADAN20','Ramadan Program 20% off','Seasonal discount on the Ramadan Program.',20)`);
  await query(`INSERT INTO promos(code,title,description,percent_off) VALUES ('WELCOME10','Welcome 10% off','First month for new athletes.',10)`);
  await query(`INSERT INTO subscriptions(user_id,plan,status,renews_on) VALUES ($1,'pro','active','2026-12-01')`, [heba]);
  await query(`INSERT INTO subscriptions(user_id,plan,status) VALUES ($1,'gym','active')`, [coach]);
}

// Run directly: node src/initdb.js [--reset]  (cross-platform entry check)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const reset = process.argv.includes('--reset');
  // Guard against seeding the wrong place: if a connection URL is set but isn't a
  // usable postgres:// string (e.g. a Prisma Accelerate URL), stop instead of
  // silently seeding the local embedded database.
  if (hasAnyDbEnv() && !hasDbUrl()) {
    console.error('A database URL is set but is not a standard postgres:// string ' +
      '(Prisma Accelerate URLs are not usable here). Set DATABASE_URL to the direct ' +
      'POSTGRES_URL value and re-run.');
    process.exit(1);
  }
  initDb({ reset })
    .then(async () => { console.log('[db] init complete'); const d = await getDb(); if (d.pool) await d.pool.end(); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
