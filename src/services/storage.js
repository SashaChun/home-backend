import { Client } from 'minio';
import crypto from 'node:crypto';

let _client;

function getClient() {
  if (_client) return _client;
  _client = new Client({
    endPoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: parseInt(process.env.MINIO_PORT || '9000', 10),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
  });
  return _client;
}

const bucket = () => process.env.MINIO_BUCKET || 'listings-photos';
const publicBase = () => {
  const base = process.env.MINIO_PUBLIC_URL
    ? process.env.MINIO_PUBLIC_URL.replace(/\/$/, '')
    : `http://${process.env.MINIO_ENDPOINT || 'localhost'}:${process.env.MINIO_PORT || '9000'}`;
  return `${base}/${bucket()}`;
};

export async function ensureBucket() {
  const c = getClient();
  const name = bucket();
  const exists = await c.bucketExists(name);
  if (!exists) {
    await c.makeBucket(name);
  }
  const policy = JSON.stringify({
    Version: '2012-10-17',
    Statement: [{
      Effect: 'Allow',
      Principal: { AWS: ['*'] },
      Action: ['s3:GetObject'],
      Resource: [`arn:aws:s3:::${name}/*`],
    }],
  });
  await c.setBucketPolicy(name, policy);
}

export async function uploadFile(buffer, mime, destPath) {
  await getClient().putObject(bucket(), destPath, buffer, buffer.length, { 'Content-Type': mime });
  return `${publicBase()}/${encodeURIComponent(destPath)}`;
}

export async function deleteFile(publicUrl) {
  try {
    const prefix = `${publicBase()}/`;
    if (!publicUrl.startsWith(prefix)) return;
    const objectPath = decodeURIComponent(publicUrl.slice(prefix.length));
    await getClient().removeObject(bucket(), objectPath);
  } catch (e) {
    console.warn('[storage] deleteFile failed:', e.message);
  }
}

export function makeListingPhotoPath(listingId, originalName) {
  const id = crypto.randomBytes(8).toString('hex');
  const ext = originalName.includes('.') ? originalName.split('.').pop().toLowerCase() : 'jpg';
  const safeExt = /^[a-z0-9]{1,5}$/.test(ext) ? ext : 'jpg';
  return `listings/${listingId}/${id}.${safeExt}`;
}
