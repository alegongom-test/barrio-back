import { MongoClient } from 'mongodb';
import bcrypt from 'bcryptjs';

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || 'myapp';

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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { nickname, password } = req.body;

    if (!nickname || !password) {
      return res.status(400).json({ error: 'nickname y password son requeridos' });
    }
    if (nickname.length < 3) {
      return res.status(400).json({ error: 'El nickname debe tener al menos 3 caracteres' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'La password debe tener al menos 6 caracteres' });
    }

    const client = await connectDB();
    const db = client.db(DB_NAME);
    const users = db.collection('users');

    const existingUser = await users.findOne({ nickname: nickname.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({ error: 'El nickname ya está en uso' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const now = new Date();

    const result = await users.insertOne({
      nickname: nickname.toLowerCase(),
      password: hashedPassword,
      createdAt: now,
      lastConnection: now,
      inventory: '',
      stats: {
        hp: 100,
        attack: 10,
        defense: 10,
        gold: 0,
        misc: {
          temas: [],
        },
        xp: 0,
        level: 1,
      },
    });

    return res.status(201).json({
      success: true,
      message: 'Usuario creado exitosamente',
      userId: result.insertedId,
    });
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
