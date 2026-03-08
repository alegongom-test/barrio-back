import { MongoClient, ObjectId } from 'mongodb';
import jwt from 'jsonwebtoken';

const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  let payload;
  try {
    payload = jwt.verify(authHeader.slice(7), JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const { nickname } = req.body ?? {};
  if (!nickname || typeof nickname !== 'string') {
    return res.status(400).json({ error: 'nickname is required' });
  }

  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    const db = client.db('barrio');
    const userId = new ObjectId(payload.userId);

    await db.collection('barrio_people_interactions').updateOne(
      { userId, nickname },
      { $set: { userId, nickname, interactedAt: new Date() } },
      { upsert: true },
    );

    return res.status(200).json({ success: true });
  } finally {
    await client.close();
  }
}
