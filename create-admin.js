// TEMPORARY ADMIN RESET SCRIPT
// Run this ONCE on Render Shell to create the admin user in MongoDB
// Then delete this file after use

const bcrypt = require('bcryptjs');

async function createAdmin() {
  const MONGO_URI = process.env.MONGODB_URI;
  
  if (!MONGO_URI) {
    console.log('ERROR: MONGODB_URI not set');
    process.exit(1);
  }

  console.log('Connecting to MongoDB...');
  const { MongoClient } = require('mongodb');
  const client = new MongoClient(MONGO_URI);
  
  try {
    await client.connect();
    console.log('Connected to MongoDB Atlas ✅');
    
    const db = client.db('tecs_pos');
    
    // Check existing users
    const users = await db.collection('users').find({}).toArray();
    console.log('Existing users:', users.length);
    
    // Delete all existing users and recreate
    await db.collection('users').deleteMany({});
    console.log('Cleared users collection');
    
    // Create admin user
    const hash = bcrypt.hashSync('admin123', 10);
    await db.collection('users').insertOne({
      id: 1,
      name: 'Admin',
      username: 'admin',
      passwordHash: hash,
      role: 'admin',
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    
    console.log('✅ Admin user created successfully!');
    console.log('Username: admin');
    console.log('Password: admin123');
    
    // Verify it was saved
    const saved = await db.collection('users').findOne({ username: 'admin' });
    console.log('Verified in DB:', saved ? '✅ YES' : '❌ NO');
    
  } catch (err) {
    console.error('ERROR:', err.message);
  } finally {
    await client.close();
    process.exit(0);
  }
}

createAdmin();
