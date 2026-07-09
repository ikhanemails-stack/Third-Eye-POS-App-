// Third Eye Computer Solutions - POS System
// Database engine with transparent MongoDB support.
//
// STRATEGY: When MongoDB is enabled, we maintain an in-memory cache of all
// collections. Reads are served from the cache (synchronously, just like the
// local JSON mode). Writes go to both MongoDB AND update the cache.
// This means ALL existing route code works unchanged - no await needed in routes.

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
  catch(e) { return []; }
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

// ── MONGODB with in-memory cache ──────────────────────────────────────────
let _mdb = null;
const _cache = {}; // table name -> array of documents

async function connectMongo() {
  if (_mdb) return _mdb;
  const { MongoClient } = require('mongodb');
  const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  _mdb = client.db('tecs_pos');
  console.log('✅ Connected to MongoDB Atlas');
  return _mdb;
}

async function loadCollection(table) {
  if (_cache[table]) return _cache[table];
  const mdb = await connectMongo();
  const docs = await mdb.collection(table).find({}).toArray();
  _cache[table] = docs;
  return docs;
}

// ── FIXED: saveToMongo no longer deletes everything! ──────────────────────
// Instead of deleteMany + insertMany, we now do UPSERT (update or insert)
// This preserves data that exists in MongoDB but not in cache (like licenses from admin)

async function saveToMongo(table, rows) {
  try {
    const mdb = await connectMongo();
    
    // Get current MongoDB data to find what's new/changed/deleted
    const existingDocs = await mdb.collection(table).find({}).toArray();
    const existingIds = new Set(existingDocs.map(r => r.id).filter(id => id !== undefined));
    const cacheIds = new Set(rows.map(r => r.id).filter(id => id !== undefined));
    
    // 1. Delete documents that are in MongoDB but NOT in cache (only if explicitly deleted)
    // For now, we skip deletion to be safe - admin data should never be deleted by POS
    
    // 2. Upsert (update or insert) each row from cache
    for (const row of rows) {
      if (row.id !== undefined) {
        await mdb.collection(table).updateOne(
          { id: row.id },
          { $set: { ...row } },
          { upsert: true }
        );
      } else {
        // No id, insert as new
        await mdb.collection(table).insertOne({ ...row });
      }
    }
    
    // 3. Also insert any documents from MongoDB that are NOT in cache
    // This ensures admin-created licenses are preserved in cache
    for (const doc of existingDocs) {
      if (doc.id !== undefined && !cacheIds.has(doc.id)) {
        // Document exists in MongoDB but not in cache - add to cache
        rows.push(doc);
      }
    }
    
  } catch(e) {
    console.error('MongoDB write error:', e.message);
  }
}

// ── Sync-compatible db API ────────────────────────────────────────────────
// In MongoDB mode: reads come from cache (sync), writes update cache + MongoDB
// In local mode: reads/writes use JSON files (sync)

function getRows(table) {
  if (!USE_MONGO) return readTable(table);
  return _cache[table] || [];
}

function setRows(table, rows) {
  if (!USE_MONGO) {
    writeTable(table, rows);
    return;
  }
  _cache[table] = rows;
  saveToMongo(table, rows); // async fire-and-forget (cache is source of truth)
}

const db = {
  get isMongo() { return USE_MONGO; },

  // Connect and pre-load ALL collections into cache
  async initMongo() {
    await connectMongo();
    
    // Pre-load common tables into cache
    const tables = [
      'settings','users','categories','suppliers','products',
      'sales','sale_items','customers','coupons','deliveries',
      'expenses','expense_categories','daily_balances',
      'vendor_bills','vendor_payments','employees',
      'expiry_items','returns','reminders','cash_sessions',
      'purchases','purchase_items','stock_movements',
      'licenses'  // ← ADDED: Make sure licenses are loaded!
    ];
    
    for (const t of tables) {
      await loadCollection(t);
    }
    
    // ── CRITICAL FIX: Sync cache with MongoDB for all tables ─────────────
    // This ensures any data created by admin app (like licenses) is in cache
    const mdb = await connectMongo();
    const allCollections = await mdb.listCollections().toArray();
    for (const col of allCollections) {
      const colName = col.name;
      if (!_cache[colName]) {
        const docs = await mdb.collection(colName).find({}).toArray();
        _cache[colName] = docs;
      }
    }
    
    console.log('✅ All collections loaded into memory cache');
  },

  ensureTable(t, def) {
    if (!USE_MONGO) {
      if (!fs.existsSync(filePath(t))) writeTable(t, def || []);
    } else {
      // FIXED: Only set cache if empty, never overwrite existing data
      if (!_cache[t] || _cache[t].length === 0) {
        _cache[t] = def || [];
      }
      // Don't call setRows here - it triggers saveToMongo which could wipe data
    }
  },

  all(t) { return getRows(t); },

  find(t, pred) { return getRows(t).find(pred) || null; },

  filter(t, pred) { return getRows(t).filter(pred); },

  getById(t, id) { return getRows(t).find(r => r.id === Number(id)) || null; },

  insert(t, rec) {
    const rows = getRows(t);
    const id = nextId(rows);
    const now = new Date().toISOString();
    const doc = Object.assign({ id, createdAt: now, updatedAt: now }, rec);
    rows.push(doc);
    setRows(t, rows);
    return doc;
  },

  update(t, id, upd) {
    const rows = getRows(t);
    const i = rows.findIndex(r => r.id === Number(id));
    if (i === -1) return null;
    rows[i] = Object.assign({}, rows[i], upd, { updatedAt: new Date().toISOString() });
    setRows(t, rows);
    return rows[i];
  },

  delete(t, id) {
    const rows = getRows(t);
    const i = rows.findIndex(r => r.id === Number(id));
    if (i === -1) return false;
    rows.splice(i, 1);
    setRows(t, rows);
    return true;
  },

  replaceAll(t, rows) {
    setRows(t, rows);
    return rows;
  }
};

module.exports = db;