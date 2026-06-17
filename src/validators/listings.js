import Joi from 'joi';

const HOUSING_TYPES = ['apartment', 'house', 'room', 'studio'];
const RENT_TERMS = ['long', 'daily'];
const AMENITIES = ['wifi','parking','pets','furniture','tv','washer','ac','heating','elevator','balcony'];

const baseFields = {
  title: Joi.string().min(4).max(120),
  description: Joi.string().min(10).max(4000),
  price: Joi.number().integer().min(0).max(10_000_000),
  rentTerm: Joi.string().valid(...RENT_TERMS),
  type: Joi.string().valid(...HOUSING_TYPES),
  rooms: Joi.number().integer().min(0).max(50),
  area: Joi.number().min(1).max(100_000),
  city: Joi.string().min(2).max(60),
  district: Joi.string().allow('', null).max(80),
  address: Joi.string().allow('', null).max(200),
  location: Joi.object({
    lat: Joi.number().min(-90).max(90).required(),
    lng: Joi.number().min(-180).max(180).required(),
  }),
  amenities: Joi.array().items(Joi.string().valid(...AMENITIES)).max(20),
  videoUrl: Joi.string().uri().allow('', null),
  status: Joi.string().valid('active', 'archived'),
};

export const createListingSchema = Joi.object({
  title: baseFields.title.required(),
  description: baseFields.description.required(),
  price: baseFields.price.required(),
  rentTerm: baseFields.rentTerm.required(),
  type: baseFields.type.required(),
  rooms: baseFields.rooms.required(),
  area: baseFields.area.required(),
  city: baseFields.city.required(),
  district: baseFields.district,
  address: baseFields.address,
  location: baseFields.location.required(),
  amenities: baseFields.amenities.default([]),
  videoUrl: baseFields.videoUrl,
});

export const updateListingSchema = Joi.object({
  title: baseFields.title,
  description: baseFields.description,
  price: baseFields.price,
  rentTerm: baseFields.rentTerm,
  type: baseFields.type,
  rooms: baseFields.rooms,
  area: baseFields.area,
  city: baseFields.city,
  district: baseFields.district,
  address: baseFields.address,
  location: baseFields.location,
  amenities: baseFields.amenities,
  videoUrl: baseFields.videoUrl,
  status: baseFields.status,
}).min(1);

const csvAmenities = Joi.string().custom((value, helpers) => {
  const arr = value.split(',').map((s) => s.trim()).filter(Boolean);
  for (const a of arr) {
    if (!AMENITIES.includes(a)) return helpers.error('any.invalid');
  }
  return arr.slice(0, 10);
});

export const listListingsQuerySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(60).default(20),
  after: Joi.number().integer().min(0).allow(null).default(0),
  mine: Joi.string().valid('1').optional(),
  ownerId: Joi.string().optional(),
  city: Joi.string().min(2).max(60),
  type: Joi.string().valid(...HOUSING_TYPES),
  rentTerm: Joi.string().valid(...RENT_TERMS),
  roomsMin: Joi.number().integer().min(0),
  roomsMax: Joi.number().integer().min(0),
  priceMin: Joi.number().integer().min(0),
  priceMax: Joi.number().integer().min(0),
  areaMin: Joi.number().min(0),
  areaMax: Joi.number().min(0),
  amenities: csvAmenities,
  q: Joi.string().allow('', null).max(80),
  sort: Joi.string().valid('newest', 'price_asc', 'price_desc').default('newest'),
});

export const deletePhotoSchema = Joi.object({
  url: Joi.string().uri().required(),
});
