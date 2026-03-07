import { MongoClient, ObjectId } from 'mongodb';
import jwt from 'jsonwebtoken';

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || 'myapp';
const JWT_SECRET = process.env.JWT_SECRET;

let cachedClient = null;

async function connectDB() {
  if (cachedClient) return cachedClient;
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  cachedClient = client;
  return client;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token requerido' });
    }

    let payload;
    try {
      payload = jwt.verify(authHeader.slice(7), JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Token inválido o expirado' });
    }

    const { lat, lng } = req.body;
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return res.status(400).json({ error: 'lat y lng son requeridos y deben ser números' });
    }

    const client = await connectDB();
    const db = client.db(DB_NAME);
    const collection = db.collection('active_locations');

    await collection.updateOne(
      { userId: new ObjectId(payload.userId) },
      { $set: { userId: new ObjectId(payload.userId), lat, lng, updatedAt: new Date() } },
      { upsert: true }
    );

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Location error:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
