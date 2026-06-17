import { query } from '../services/db.js';
import { uploadFile, deleteFile, makeListingPhotoPath } from '../services/storage.js';

function rowToListing(row) {
  return {
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    description: row.description,
    type: row.type,
    rentTerm: row.rent_term,
    price: row.price !== null ? Number(row.price) : null,
    rooms: row.rooms,
    area: row.area !== null ? Number(row.area) : null,
    floor: row.floor,
    floorsTotal: row.floors_total,
    city: row.city,
    district: row.district,
    address: row.address,
    location: row.lat != null ? { lat: Number(row.lat), lng: Number(row.lng) } : null,
    amenities: row.amenities || [],
    photos: row.photos || [],
    videoUrl: row.video_url,
    status: row.status,
    viewsCount: row.views_count,
    rating: Number(row.rating),
    reviewsCount: row.reviews_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function list(req, res, next) {
  try {
    const {
      limit = 20, after = 0, mine, ownerId, sort = 'newest',
      city, type, rentTerm,
      priceMin, priceMax, roomsMin, roomsMax, areaMin, areaMax,
      amenities, q,
    } = req.query;

    const offset = parseInt(after, 10) || 0;
    const pageSize = parseInt(limit, 10);
    const targetUid = mine === '1' ? req.user?.id : ownerId;

    if (mine === '1' && !req.user?.id) {
      return next({ status: 401, code: 'UNAUTHENTICATED', message: 'Login required' });
    }

    const conditions = [];
    const params = [];
    let p = 1;

    if (!targetUid) {
      conditions.push(`status = 'active'`);
    } else {
      conditions.push(`owner_id = $${p++}`);
      params.push(targetUid);
    }

    if (city) { conditions.push(`city = $${p++}`); params.push(city); }
    if (type) { conditions.push(`type = $${p++}`); params.push(type); }
    if (rentTerm) { conditions.push(`rent_term = $${p++}`); params.push(rentTerm); }
    if (priceMin != null) { conditions.push(`price >= $${p++}`); params.push(priceMin); }
    if (priceMax != null) { conditions.push(`price <= $${p++}`); params.push(priceMax); }
    if (roomsMin != null) { conditions.push(`rooms >= $${p++}`); params.push(roomsMin); }
    if (roomsMax != null) { conditions.push(`rooms <= $${p++}`); params.push(roomsMax); }
    if (areaMin != null) { conditions.push(`area >= $${p++}`); params.push(areaMin); }
    if (areaMax != null) { conditions.push(`area <= $${p++}`); params.push(areaMax); }
    if (q) {
      conditions.push(
        `(title ILIKE $${p} OR description ILIKE $${p} OR city ILIKE $${p} OR address ILIKE $${p})`,
      );
      params.push(`%${q}%`);
      p++;
    }
    if (amenities?.length) {
      conditions.push(`amenities @> $${p++}`);
      params.push(amenities);
    }

    const orderBy =
      sort === 'price_asc' ? 'price ASC, created_at DESC' :
      sort === 'price_desc' ? 'price DESC, created_at DESC' :
      'created_at DESC';

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `SELECT * FROM listings ${where} ORDER BY ${orderBy} LIMIT $${p++} OFFSET $${p++}`;
    params.push(pageSize + 1, offset);

    const { rows } = await query(sql, params);
    const hasMore = rows.length > pageSize;
    const data = rows.slice(0, pageSize).map(rowToListing);
    const nextCursor = hasMore ? String(offset + pageSize) : null;

    res.json({ data, nextCursor });
  } catch (e) {
    next(e);
  }
}

export async function getOne(req, res, next) {
  try {
    const { rows } = await query('SELECT * FROM listings WHERE id = $1', [req.params.id]);
    if (!rows.length) return next({ status: 404, code: 'NOT_FOUND', message: 'Listing not found' });
    query('UPDATE listings SET views_count = views_count + 1 WHERE id = $1', [req.params.id]).catch(() => {});
    res.json({ data: rowToListing(rows[0]) });
  } catch (e) {
    next(e);
  }
}

export async function create(req, res, next) {
  try {
    const {
      title, description, type, rentTerm, price, rooms, area,
      floor, floorsTotal, city, district, address, location,
      amenities = [], videoUrl,
    } = req.body;

    const { rows } = await query(
      `INSERT INTO listings
        (owner_id, title, description, type, rent_term, price, rooms, area,
         floor, floors_total, city, district, address, lat, lng, amenities, video_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [
        req.user.id, title, description, type, rentTerm, price, rooms, area,
        floor ?? null, floorsTotal ?? null, city, district ?? null, address ?? null,
        location?.lat ?? null, location?.lng ?? null, amenities, videoUrl ?? null,
      ],
    );
    res.status(201).json({ data: rowToListing(rows[0]) });
  } catch (e) {
    next(e);
  }
}

export async function update(req, res, next) {
  try {
    const fieldMap = {
      title: 'title', description: 'description', type: 'type',
      rentTerm: 'rent_term', price: 'price', rooms: 'rooms', area: 'area',
      floor: 'floor', floorsTotal: 'floors_total', city: 'city',
      district: 'district', address: 'address',
      amenities: 'amenities', videoUrl: 'video_url', status: 'status',
    };

    const sets = [];
    const params = [];
    let p = 1;

    for (const [key, col] of Object.entries(fieldMap)) {
      if (req.body[key] !== undefined) {
        sets.push(`${col} = $${p++}`);
        params.push(req.body[key]);
      }
    }
    if (req.body.location) {
      sets.push(`lat = $${p++}`, `lng = $${p++}`);
      params.push(req.body.location.lat, req.body.location.lng);
    }
    if (!sets.length) return next({ status: 400, code: 'VALIDATION', message: 'Nothing to update' });

    sets.push(`updated_at = NOW()`);
    params.push(req.params.id);

    const { rows } = await query(
      `UPDATE listings SET ${sets.join(', ')} WHERE id = $${p} RETURNING *`,
      params,
    );
    if (!rows.length) return next({ status: 404, code: 'NOT_FOUND', message: 'Listing not found' });
    res.json({ data: rowToListing(rows[0]) });
  } catch (e) {
    next(e);
  }
}

export async function remove(req, res, next) {
  try {
    const { rows } = await query('SELECT photos FROM listings WHERE id = $1', [req.params.id]);
    const photos = rows[0]?.photos || [];
    await Promise.all(photos.map((url) => deleteFile(url)));
    await query('DELETE FROM listings WHERE id = $1', [req.params.id]);
    res.json({ data: { id: req.params.id, deleted: true } });
  } catch (e) {
    next(e);
  }
}

export async function uploadPhoto(req, res, next) {
  try {
    if (!req.file) return next({ status: 400, code: 'NO_FILE', message: 'photo field is required' });
    const dest = makeListingPhotoPath(req.params.id, req.file.originalname || 'photo.jpg');
    const url = await uploadFile(req.file.buffer, req.file.mimetype, dest);
    const { rows } = await query(
      `UPDATE listings SET photos = array_append(photos, $1), updated_at = NOW() WHERE id = $2 RETURNING *`,
      [url, req.params.id],
    );
    if (!rows.length) return next({ status: 404, code: 'NOT_FOUND', message: 'Listing not found' });
    res.status(201).json({ data: rowToListing(rows[0]) });
  } catch (e) {
    next(e);
  }
}

export async function deletePhoto(req, res, next) {
  try {
    const { url } = req.body;
    await deleteFile(url);
    const { rows } = await query(
      `UPDATE listings SET photos = array_remove(photos, $1), updated_at = NOW() WHERE id = $2 RETURNING *`,
      [url, req.params.id],
    );
    if (!rows.length) return next({ status: 404, code: 'NOT_FOUND', message: 'Listing not found' });
    res.json({ data: rowToListing(rows[0]) });
  } catch (e) {
    next(e);
  }
}
