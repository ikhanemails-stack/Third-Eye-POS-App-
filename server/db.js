// Third Eye Computer Solutions - POS System
// Database engine.
// - Local mode (default): synchronous JSON file storage
// - MongoDB mode: set MONGODB_URI environment variable
//
// In MongoDB mode, all public methods return Promises.
// Routes must use async/await when MONGODB_URI is set.

const fs   = require('fs');
const path = require('path');

const MONGO_URI = process.env.MONGODB_URI || '';
const USE_MONGO  = !!MONGO_URI;

// ── LOCAL JSON (sync) ─────────────────────────────────────────────────────
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function filePath(t) { return path.join(DATA_DIR, `${t}.json`); }

function readTable(t) {
  const fp = filePath(t);
  if (!fs.existsSync(fp)) return [];
  try { const r = fs.readFileSync(fp,'utf-8'); return r.trim() ? JSON.parse(r) : []; }
  catch(e) {
    const bak = fp+'.bak';
    if (fs.existsSync(bak)) { try { return JSON.parse(fs.readFileSync(bak,'utf-8')); } catch(_){} }
    return [];
  }
}

function writeTable(t, data) {
  const fp=filePath(t), bak=fp+'.bak', tmp=fp+'.tmp';
  if (fs.existsSync(fp)) fs.copyFileSync(fp,bak);
  fs.writeFileSync(tmp, JSON.stringify(data,null,2));
  fs.renameSync(tmp,fp);
}

function nextId(rows) {
  if (!rows.length) return 1;
  return Math.max(...rows.map(r=>Number(r.id)||0))+1;
}

// ── MONGODB (async) ───────────────────────────────────────────────────────
let _mdb = null;

async function connectMongo() {
  if (_mdb) return _mdb;
  const { MongoClient } = require('mongodb');
  const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  _mdb = client.db('tecs_pos');
  console.log('✅ MongoDB Atlas connected');
  return _mdb;
}

// ── UNIFIED API ───────────────────────────────────────────────────────────
// When USE_MONGO=true every method returns a Promise.
// When USE_MONGO=false every method returns a value synchronously.
// Routes should use `await db.xxx()` always — works in both modes.

const db = {
  get isMongo() { return USE_MONGO; },
  connectMongo,
  ensureTable(t, def) {
    if (!USE_MONGO && !fs.existsSync(filePath(t)))
      writeTable(t, def || []);
  },

  all(t) {
    if (!USE_MONGO) return readTable(t);
    return connectMongo().then(m => m.collection(t).find({}).toArray());
  },
  find(t, pred) {
    if (!USE_MONGO) return readTable(t).find(pred);
    return this.all(t).then(rows => rows.find(pred));
  },
  filter(t, pred) {
    if (!USE_MONGO) return readTable(t).filter(pred);
    return this.all(t).then(rows => rows.filter(pred));
  },
  getById(t, id) {
    if (!USE_MONGO) return readTable(t).find(r=>r.id===Number(id));
    return connectMongo().then(m => m.collection(t).findOne({ id: Number(id) }));
  },
  insert(t, rec) {
    if (!USE_MONGO) {
      const rows = readTable(t);
      const id = nextId(rows);
      const now = new Date().toISOString();
      const doc = Object.assign({ id, createdAt:now, updatedAt:now }, rec);
      rows.push(doc); writeTable(t, rows); return doc;
    }
    return connectMongo().then(async m => {
      const rows = await m.collection(t).find({}).toArray();
      const id = rows.length ? Math.max(...rows.map(r=>Number(r.id)||0))+1 : 1;
      const now = new Date().toISOString();
      const doc = Object.assign({ id, createdAt:now, updatedAt:now }, rec);
      await m.collection(t).insertOne(doc);
      return doc;
    });
  },
  update(t, id, upd) {
    if (!USE_MONGO) {
      const rows = readTable(t);
      const i = rows.findIndex(r=>r.id===Number(id));
      if (i===-1) return null;
      rows[i] = Object.assign({}, rows[i], upd, { updatedAt: new Date().toISOString() });
      writeTable(t, rows); return rows[i];
    }
    return connectMongo().then(m => m.collection(t).findOneAndUpdate(
      { id: Number(id) },
      { $set: { ...upd, updatedAt: new Date().toISOString() } },
      { returnDocument: 'after' }
    ));
  },
  delete(t, id) {
    if (!USE_MONGO) {
      const rows = readTable(t);
      const i = rows.findIndex(r=>r.id===Number(id));
      if (i===-1) return false;
      rows.splice(i,1); writeTable(t, rows); return true;
    }
    return connectMongo().then(async m => {
      const r = await m.collection(t).deleteOne({ id: Number(id) });
      return r.deletedCount > 0;
    });
  },
  replaceAll(t, rows) {
    if (!USE_MONGO) { writeTable(t, rows); return rows; }
    return connectMongo().then(async m => {
      await m.collection(t).deleteMany({});
      if (rows.length) await m.collection(t).insertMany(rows);
      return rows;
    });
  }
};

module.exports = db;
