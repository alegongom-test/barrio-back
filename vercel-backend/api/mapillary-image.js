import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
const MAPILLARY_TOKEN = process.env.MAPILLARY_ACCESS_TOKEN;

/** Bounding boxes to try, from ~20 m to ~40 m. */
const DELTAS = [0.0002, 0.0003, 0.0004];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')
    return res.status(405).json({ error: 'Method not allowed' });

  // ── Auth ──────────────────────────────────────────────────────────────────
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' });
  }
  try {
    jwt.verify(authHeader.slice(7), JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }

  // ── Params ────────────────────────────────────────────────────────────────
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);

  if (isNaN(lat) || isNaN(lng)) {
    return res.status(400).json({ error: 'Coordenadas inválidas' });
  }

  // ── Search Mapillary ──────────────────────────────────────────────────────
  try {
    for (const delta of DELTAS) {
      // Mapillary bbox format: minLng,minLat,maxLng,maxLat
      const bbox = `${lng - delta},${lat - delta},${lng + delta},${lat + delta}`;
      const url =
        `https://graph.mapillary.com/images` +
        `?fields=id,geometry,computed_geometry` +
        `&bbox=${bbox}` +
        `&limit=1`;

      const response = await fetch(url, {
        headers: { Authorization: `OAuth ${MAPILLARY_TOKEN}` },
      });

      if (!response.ok) {
        const body = await response.text();
        console.error('Mapillary error:', response.status, body);
        return res.status(502).json({ error: 'Error al contactar Mapillary' });
      }

      const data = await response.json();

      if (data.data?.length > 0) {
        const image = data.data[0];

        // GeoJSON coordinates: [longitude, latitude]
        const coords =
          image.computed_geometry?.coordinates ?? image.geometry?.coordinates;

        return res.status(200).json({
          imageId: image.id,
          actualLat: coords[1],
          actualLng: coords[0],
        });
      }
    }

    return res
      .status(404)
      .json({ error: 'No se encontraron imágenes en esta zona' });
  } catch (error) {
    console.error('Error mapillary-image:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
