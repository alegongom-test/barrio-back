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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token requerido' });
    }

    const token = authHeader.slice(7);
    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Token inválido o expirado' });
    }

    const client = await connectDB();
    const db = client.db(DB_NAME);
    const users = db.collection('users');

    const user = await users.findOne({ _id: new ObjectId(payload.userId) });
    if (!user) {
      return res.status(401).json({ error: 'Usuario no encontrado' });
    }

    return res.status(200).json({
      success: true,
      user: {
        id: user._id.toString(),
        nickname: user.nickname,
        createdAt: user.createdAt,
        lastConnection: user.lastConnection,
        inventory: user.inventory ?? '',
        stats: user.stats ?? null,
      },
    });
  } catch (error) {
    console.error('Me error:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
