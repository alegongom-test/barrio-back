import { MongoClient } from 'mongodb';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const MONGODB_URI =
  'mongodb+srv://cuentapruebaalex000_db_user:<db_password>@cards0.n7acokp.mongodb.net/?appName=Cards0';
const DB_NAME = 'barrio';
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { nickname, password } = req.body;

    if (!nickname || !password) {
      return res
        .status(400)
        .json({ error: 'nickname y password son requeridos' });
    }

    const client = await connectDB();
    const db = client.db(DB_NAME);
    const users = db.collection('users');

    const user = await users.findOne({ nickname: nickname.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    await users.updateOne(
      { _id: user._id },
      { $set: { lastConnection: new Date() } },
    );

    const token = jwt.sign(
      { userId: user._id.toString(), nickname: user.nickname },
      JWT_SECRET,
      { expiresIn: '7d' },
    );

    return res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id.toString(),
        nickname: user.nickname,
        createdAt: user.createdAt,
        lastConnection: new Date(),
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
