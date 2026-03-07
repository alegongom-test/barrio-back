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

    let payload;
    try {
      payload = jwt.verify(authHeader.slice(7), JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Token inválido o expirado' });
    }

    const client = await connectDB();
    const db = client.db(DB_NAME);

    const since = new Date(Date.now() - 15 * 60 * 1000); // últimos 15 minutos

    // Obtener localizaciones activas (excluir al propio usuario)
    const activeLocations = await db
      .collection('active_locations')
      .find({
        updatedAt: { $gte: since },
        userId: { $ne: new ObjectId(payload.userId) },
      })
      .toArray();

    if (activeLocations.length === 0) {
      return res.status(200).json([]);
    }

    // Obtener nicknames de los usuarios activos
    const userIds = activeLocations.map((loc) => loc.userId);
    const users = await db
      .collection('users')
      .find({ _id: { $in: userIds } })
      .project({ _id: 1, nickname: 1 })
      .toArray();

    const nicknameMap = new Map(users.map((u) => [u._id.toString(), u.nickname]));

    const result = activeLocations.map((loc) => ({
      nickname: nicknameMap.get(loc.userId.toString()) ?? 'Usuario',
      lat: loc.lat,
      lng: loc.lng,
    }));

    return res.status(200).json(result);
  } catch (error) {
    console.error('Locations error:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
