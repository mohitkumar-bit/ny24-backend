import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";

function getS3Client() {
  const accessKeyId = String(process.env.AWS_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = String(process.env.AWS_SECRET_ACCESS_KEY || "").trim();
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("AWS_CREDENTIALS_MISSING");
  }
  return new S3Client({
    region: process.env.AWS_REGION || "ap-south-1",
    credentials: { accessKeyId, secretAccessKey },
  });
}

export function isS3Configured() {
  return !!(
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY &&
    process.env.AWS_S3_BUCKET
  );
}

export async function uploadVideoToS3(buffer, mimetype, userId) {
  const bucket = process.env.AWS_S3_BUCKET;
  const region = process.env.AWS_REGION || "ap-south-1";
  if (!bucket) throw new Error("AWS_S3_BUCKET_MISSING");

  const ext = mimetype?.includes("quicktime") ? "mov" : "mp4";
  const key = `videos/${userId}/${randomUUID()}.${ext}`;
  const client = getS3Client();

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: mimetype || "video/mp4",
      CacheControl: "public, max-age=31536000, immutable",
    })
  );

  const url = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
  return { url, key };
}

export function parseS3KeyFromUrl(url) {
  if (!url || typeof url !== "string") return null;
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes("amazonaws.com")) return null;
    return decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  } catch {
    return null;
  }
}

export async function getVideoObjectFromS3(storedUrl, rangeHeader) {
  const key = parseS3KeyFromUrl(storedUrl);
  if (!key) {
    throw new Error("INVALID_VIDEO_URL");
  }

  const bucket = process.env.AWS_S3_BUCKET;
  const client = getS3Client();
  const params = {
    Bucket: bucket,
    Key: key,
  };

  if (rangeHeader) {
    params.Range = rangeHeader;
  }

  return client.send(new GetObjectCommand(params));
}
