import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
const uploadFile = vi.fn();
const deleteFile = vi.fn();
const makeListingPhotoPath = vi.fn(() => 'listings/l-1/abc.jpg');

vi.mock('../services/db.js', () => ({ query: (...a) => query(...a) }));
vi.mock('../services/storage.js', () => ({
  uploadFile: (...a) => uploadFile(...a),
  deleteFile: (...a) => deleteFile(...a),
  makeListingPhotoPath: (...a) => makeListingPhotoPath(...a),
}));

const { list, getOne, create, update, remove, uploadPhoto, deletePhoto } =
  await import('./listings.controller.js');

function makeRes() {
  const res = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

const dbRow = {
  id: 'l-1',
  owner_id: 'owner-1',
  title: 'Nice flat',
  description: 'desc',
  type: 'apartment',
  rent_term: 'long',
  price: '15000.00',
  rooms: 2,
  area: '54.5',
  floor: 3,
  floors_total: 9,
  city: 'Kyiv',
  district: 'Centre',
  address: 'Main st 1',
  lat: '50.4500000',
  lng: '30.5200000',
  amenities: ['wifi'],
  photos: ['http://x/p.jpg'],
  video_url: null,
  status: 'active',
  views_count: 5,
  rating: '4.5',
  reviews_count: 2,
  created_at: '2026-01-01',
  updated_at: '2026-01-02',
};

beforeEach(() => {
  query.mockReset();
  uploadFile.mockReset();
  deleteFile.mockReset();
});

describe('rowToListing mapping (via getOne)', () => {
  it('maps snake_case columns to the camelCase API shape', async () => {
    query.mockResolvedValueOnce({ rows: [dbRow] }); // SELECT
    query.mockResolvedValue({ rows: [] });          // async views increment
    const res = makeRes();

    await getOne({ params: { id: 'l-1' } }, res, vi.fn());

    const data = res.json.mock.calls[0][0].data;
    expect(data).toMatchObject({
      id: 'l-1',
      ownerId: 'owner-1',
      rentTerm: 'long',
      floorsTotal: 9,
      price: 15000,         // numeric → Number
      area: 54.5,
      rating: 4.5,
      location: { lat: 50.45, lng: 30.52 },
      amenities: ['wifi'],
      photos: ['http://x/p.jpg'],
    });
    expect(data.price).toBeTypeOf('number');
  });

  it('returns null location when lat is null', async () => {
    query.mockResolvedValueOnce({ rows: [{ ...dbRow, lat: null, lng: null }] });
    query.mockResolvedValue({ rows: [] });
    const res = makeRes();
    await getOne({ params: { id: 'l-1' } }, res, vi.fn());
    expect(res.json.mock.calls[0][0].data.location).toBeNull();
  });

  it('returns 404 when the listing is missing', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const next = vi.fn();
    await getOne({ params: { id: 'nope' } }, makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));
  });
});

describe('list', () => {
  it('defaults to active listings ordered newest, with offset pagination', async () => {
    query.mockResolvedValueOnce({ rows: [dbRow] });
    const res = makeRes();

    await list({ query: {} }, res, vi.fn());

    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/WHERE status = 'active'/);
    expect(sql).toMatch(/ORDER BY created_at DESC/);
    expect(sql).toMatch(/LIMIT \$1 OFFSET \$2/);
    expect(params).toEqual([21, 0]); // pageSize+1, offset
    expect(res.json.mock.calls[0][0].nextCursor).toBeNull();
  });

  it('builds parameterized filters for city, type, price and search', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = makeRes();

    await list(
      { query: { city: 'Kyiv', type: 'apartment', priceMin: 1000, priceMax: 9000, q: 'flat' } },
      res,
      vi.fn(),
    );

    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/city = \$1/);
    expect(sql).toMatch(/type = \$2/);
    expect(sql).toMatch(/price >= \$3/);
    expect(sql).toMatch(/price <= \$4/);
    expect(sql).toMatch(/ILIKE \$5/);
    expect(params.slice(0, 5)).toEqual(['Kyiv', 'apartment', 1000, 9000, '%flat%']);
  });

  it('maps price_asc sort to an ORDER BY price ASC', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await list({ query: { sort: 'price_asc' } }, makeRes(), vi.fn());
    expect(query.mock.calls[0][0]).toMatch(/ORDER BY price ASC/);
  });

  it('returns a nextCursor when there are more rows than the page size', async () => {
    const rows = Array.from({ length: 21 }, (_, i) => ({ ...dbRow, id: `l-${i}` }));
    query.mockResolvedValueOnce({ rows });
    const res = makeRes();

    await list({ query: { limit: 20, after: 40 } }, res, vi.fn());

    const out = res.json.mock.calls[0][0];
    expect(out.data).toHaveLength(20);          // extra row trimmed
    expect(out.nextCursor).toBe('60');          // offset(40) + pageSize(20)
  });

  it('rejects mine=1 without an authenticated user', async () => {
    const next = vi.fn();
    await list({ query: { mine: '1' }, user: undefined }, makeRes(), next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 401, code: 'UNAUTHENTICATED' }),
    );
    expect(query).not.toHaveBeenCalled();
  });

  it('filters by owner for mine=1 with an authenticated user', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await list({ query: { mine: '1' }, user: { id: 'owner-1' } }, makeRes(), vi.fn());
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/owner_id = \$1/);
    expect(params[0]).toBe('owner-1');
  });
});

describe('create', () => {
  it('inserts with owner id and flattens location into lat/lng', async () => {
    query.mockResolvedValueOnce({ rows: [dbRow] });
    const res = makeRes();

    await create(
      {
        user: { id: 'owner-1' },
        body: {
          title: 'Nice flat', description: 'desc', type: 'apartment', rentTerm: 'long',
          price: 15000, rooms: 2, area: 54.5, city: 'Kyiv',
          location: { lat: 50.45, lng: 30.52 },
        },
      },
      res,
      vi.fn(),
    );

    const params = query.mock.calls[0][1];
    expect(params[0]).toBe('owner-1');     // owner_id
    expect(params[13]).toBe(50.45);        // lat
    expect(params[14]).toBe(30.52);        // lng
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe('update', () => {
  it('returns 400 when there is nothing to update', async () => {
    const next = vi.fn();
    await update({ params: { id: 'l-1' }, body: {} }, makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400, code: 'VALIDATION' }));
    expect(query).not.toHaveBeenCalled();
  });

  it('returns 404 when the row vanished before update', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const next = vi.fn();
    await update({ params: { id: 'l-1' }, body: { price: 1 } }, makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));
  });

  it('builds a parameterized SET clause and maps location', async () => {
    query.mockResolvedValueOnce({ rows: [dbRow] });
    const res = makeRes();
    await update(
      { params: { id: 'l-1' }, body: { price: 99, location: { lat: 1, lng: 2 } } },
      res,
      vi.fn(),
    );
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/price = \$1/);
    expect(sql).toMatch(/lat = \$2/);
    expect(sql).toMatch(/lng = \$3/);
    expect(sql).toMatch(/updated_at = NOW\(\)/);
    expect(params).toEqual([99, 1, 2, 'l-1']);
  });
});

describe('remove', () => {
  it('deletes stored photos from storage then removes the row', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ photos: ['u1', 'u2'] }] }) // SELECT photos
      .mockResolvedValueOnce({ rows: [] });                        // DELETE
    const res = makeRes();

    await remove({ params: { id: 'l-1' } }, res, vi.fn());

    expect(deleteFile).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][0]).toMatch(/DELETE FROM listings/);
    expect(res.json).toHaveBeenCalledWith({ data: { id: 'l-1', deleted: true } });
  });
});

describe('uploadPhoto', () => {
  it('returns 400 when no file is attached', async () => {
    const next = vi.fn();
    await uploadPhoto({ params: { id: 'l-1' }, file: undefined }, makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400, code: 'NO_FILE' }));
  });

  it('uploads the file and appends the url to the listing', async () => {
    uploadFile.mockResolvedValue('http://minio/listings/l-1/abc.jpg');
    query.mockResolvedValueOnce({ rows: [dbRow] });
    const res = makeRes();

    await uploadPhoto(
      { params: { id: 'l-1' }, file: { buffer: Buffer.from('x'), mimetype: 'image/jpeg', originalname: 'p.jpg' } },
      res,
      vi.fn(),
    );

    expect(uploadFile).toHaveBeenCalled();
    expect(query.mock.calls[0][0]).toMatch(/array_append\(photos/);
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe('deletePhoto', () => {
  it('removes the file and the url from the listing array', async () => {
    query.mockResolvedValueOnce({ rows: [dbRow] });
    const res = makeRes();

    await deletePhoto({ params: { id: 'l-1' }, body: { url: 'http://x/p.jpg' } }, res, vi.fn());

    expect(deleteFile).toHaveBeenCalledWith('http://x/p.jpg');
    expect(query.mock.calls[0][0]).toMatch(/array_remove\(photos/);
  });

  it('returns 404 when the listing is gone', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const next = vi.fn();
    await deletePhoto({ params: { id: 'l-1' }, body: { url: 'u' } }, makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));
  });
});
