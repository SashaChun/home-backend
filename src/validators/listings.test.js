import { describe, it, expect } from 'vitest';
import {
  createListingSchema,
  updateListingSchema,
  listListingsQuerySchema,
  deletePhotoSchema,
} from './listings.js';

const validListing = {
  title: 'Cozy apartment in centre',
  description: 'A long enough description for the listing.',
  price: 15000,
  rentTerm: 'long',
  type: 'apartment',
  rooms: 2,
  area: 54,
  city: 'Kyiv',
  location: { lat: 50.45, lng: 30.52 },
};

describe('createListingSchema', () => {
  it('accepts a complete valid listing', () => {
    const { error, value } = createListingSchema.validate(validListing);
    expect(error).toBeUndefined();
    expect(value.amenities).toEqual([]); // defaulted
  });

  it('rejects an invalid housing type', () => {
    const { error } = createListingSchema.validate({ ...validListing, type: 'castle' });
    expect(error).toBeDefined();
    expect(error.message).toMatch(/type/);
  });

  it('rejects a missing required location', () => {
    const { location, ...withoutLocation } = validListing;
    const { error } = createListingSchema.validate(withoutLocation);
    expect(error).toBeDefined();
    expect(error.message).toMatch(/location/);
  });

  it('rejects latitude out of range', () => {
    const { error } = createListingSchema.validate({
      ...validListing,
      location: { lat: 200, lng: 30 },
    });
    expect(error).toBeDefined();
  });

  it('rejects unknown amenities', () => {
    const { error } = createListingSchema.validate({
      ...validListing,
      amenities: ['wifi', 'helipad'],
    });
    expect(error).toBeDefined();
  });
});

describe('updateListingSchema', () => {
  it('accepts a single-field partial update', () => {
    const { error } = updateListingSchema.validate({ price: 20000 });
    expect(error).toBeUndefined();
  });

  it('rejects an empty update (min 1 key)', () => {
    const { error } = updateListingSchema.validate({});
    expect(error).toBeDefined();
  });

  it('allows updating status to archived', () => {
    const { error } = updateListingSchema.validate({ status: 'archived' });
    expect(error).toBeUndefined();
  });
});

describe('listListingsQuerySchema', () => {
  it('applies defaults for limit, after and sort', () => {
    const { error, value } = listListingsQuerySchema.validate({});
    expect(error).toBeUndefined();
    expect(value.limit).toBe(20);
    expect(value.after).toBe(0);
    expect(value.sort).toBe('newest');
  });

  it('parses a CSV amenities string into a filtered array', () => {
    const { error, value } = listListingsQuerySchema.validate({ amenities: 'wifi, parking ,tv' });
    expect(error).toBeUndefined();
    expect(value.amenities).toEqual(['wifi', 'parking', 'tv']);
  });

  it('rejects a CSV amenities string with an unknown value', () => {
    const { error } = listListingsQuerySchema.validate({ amenities: 'wifi,nonsense' });
    expect(error).toBeDefined();
  });

  it('caps limit at 60', () => {
    const { error } = listListingsQuerySchema.validate({ limit: 1000 });
    expect(error).toBeDefined();
  });

  it('rejects an invalid sort value', () => {
    const { error } = listListingsQuerySchema.validate({ sort: 'cheapest' });
    expect(error).toBeDefined();
  });
});

describe('deletePhotoSchema', () => {
  it('requires a valid url', () => {
    expect(deletePhotoSchema.validate({ url: 'http://x/y.jpg' }).error).toBeUndefined();
    expect(deletePhotoSchema.validate({ url: 'not a url' }).error).toBeDefined();
    expect(deletePhotoSchema.validate({}).error).toBeDefined();
  });
});
