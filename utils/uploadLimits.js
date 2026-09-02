export const MAX_VIDEO_UPLOAD_MB = Number(process.env.MAX_VIDEO_UPLOAD_MB || 25);

export const MAX_VIDEO_UPLOAD_BYTES = MAX_VIDEO_UPLOAD_MB * 1024 * 1024;

export function videoUploadSizeMessage() {
  return `Video must be ${MAX_VIDEO_UPLOAD_MB} MB or less.`;
}
