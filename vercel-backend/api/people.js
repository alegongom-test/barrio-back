import { MongoClient, ObjectId } from 'mongodb';
import jwt from 'jsonwebtoken';

const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET;
const ONE_HOUR_MS = 60 * 60 * 1000;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')
    return res.status(405).json({ error: 'Method not allowed' });

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

  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    const db = client.db('barrio');
    const userId = new ObjectId(payload.userId);
    const now = new Date();

    // Nicknames this user has already interacted with — always excluded
    const interactions = await db
      .collection('barrio_people_interactions')
      .find({ userId }, { projection: { _id: 0, nickname: 1 } })
      .toArray();
    const interactedSet = new Set(interactions.map((i) => i.nickname));

    const requestsCol = db.collection('barrio_people_requests');
    const existing = await requestsCol.findOne({ userId });

    if (existing && now - existing.lastRequested < ONE_HOUR_MS) {
      // Return cached list filtered by interactions recorded since the cache was set
      const people = existing.people.filter(
        (p) => !interactedSet.has(p.nickname),
      );
      return res.status(200).json({
        success: true,
        people,
        cached: true,
        nextAllowed: new Date(existing.lastRequested.getTime() + ONE_HOUR_MS),
      });
    }

    // Sample 20 to ensure we can find 5 after filtering interacted ones
    const raw = await db
      .collection('barrio_people')
      .aggregate([
        { $sample: { size: 20 } },
        { $project: { _id: 0, nickname: 1, description: 1, attributes: 1 } },
      ])
      .toArray();

    const people = raw
      .filter((p) => !interactedSet.has(p.nickname))
      .slice(0, 5);

    await requestsCol.updateOne(
      { userId },
      { $set: { userId, lastRequested: now, people } },
      { upsert: true },
    );

    return res.status(200).json({ success: true, people, cached: false });
  } finally {
    await client.close();
  }
}
