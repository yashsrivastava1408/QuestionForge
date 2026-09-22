import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { logger } from '../utils/logger.js';

const region = process.env.AWS_REGION || 'ap-south-1';
const bucketName = process.env.S3_BUCKET_NAME;
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

let s3Client: S3Client | null = null;

if (bucketName && accessKeyId && secretAccessKey) {
  try {
    s3Client = new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
    logger.info(`[S3] AWS S3 Client initialized for bucket: ${bucketName} (${region})`);
  } catch (err) {
    logger.warn('[S3] Failed to initialize AWS S3 client, falling back to local memory storage', err);
  }
} else {
  logger.info('[S3] AWS S3 credentials not fully configured; falling back to memory storage');
}

/**
 * Upload an exported document (PDF/JSON) to S3 and return a secure presigned URL.
 */
export async function uploadExportToS3(
  key: string,
  buffer: Buffer,
  contentType: string,
  expiresInSeconds: number = 300
): Promise<string | null> {
  if (!s3Client || !bucketName) return null;

  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      })
    );

    const presignedUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
      }),
      { expiresIn: expiresInSeconds }
    );

    logger.info(`[S3] Successfully uploaded ${key} and generated signed URL (expires in ${expiresInSeconds}s)`);
    return presignedUrl;
  } catch (error) {
    logger.error(`[S3] Error uploading ${key} to S3:`, error);
    return null;
  }
}

export function isS3Enabled(): boolean {
  return !!s3Client && !!bucketName;
}
