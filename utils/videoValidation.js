import { parseBuffer } from "music-metadata";

export const MAX_VIDEO_DURATION_SECONDS = 30;

export function isVideoDurationValid(seconds) {
  return (
    typeof seconds === "number" &&
    Number.isFinite(seconds) &&
    seconds > 0 &&
    seconds <= MAX_VIDEO_DURATION_SECONDS
  );
}

function parseClientDurationSeconds(value) {
  const parsed = Number(value);
  return isVideoDurationValid(parsed) ? parsed : null;
}

async function tryParseBuffer(buffer, mimeType) {
  try {
    const metadata = await parseBuffer(buffer, {
      mimeType,
      size: buffer.length,
    });
    const duration = metadata?.format?.duration;
    return typeof duration === "number" && Number.isFinite(duration)
      ? duration
      : null;
  } catch {
    return null;
  }
}

export async function getVideoDurationSeconds(buffer, mimeType) {
  if (!buffer?.length) return null;

  const mimeCandidates = [
    mimeType,
    "video/mp4",
    "video/quicktime",
    "video/x-m4v",
    "video/webm",
    "audio/mp4",
  ].filter((value, index, list) => value && list.indexOf(value) === index);

  for (const candidate of mimeCandidates) {
    const duration = await tryParseBuffer(buffer, candidate);
    if (duration != null) return duration;
  }

  try {
    const metadata = await parseBuffer(buffer, { size: buffer.length });
    const duration = metadata?.format?.duration;
    return typeof duration === "number" && Number.isFinite(duration)
      ? duration
      : null;
  } catch {
    return null;
  }
}

export async function assertVideoWithinLimit(
  buffer,
  mimeType,
  clientDurationSeconds
) {
  let duration = await getVideoDurationSeconds(buffer, mimeType);
  const clientDuration = parseClientDurationSeconds(clientDurationSeconds);

  if (duration == null && clientDuration != null) {
    duration = clientDuration;
  }

  if (duration == null) {
    return {
      ok: false,
      message:
        "Could not verify video length. Use an MP4/MOV file up to 30 seconds.",
    };
  }

  if (duration > MAX_VIDEO_DURATION_SECONDS) {
    return {
      ok: false,
      message: `Video is ${Math.ceil(duration)} seconds. Maximum allowed length is ${MAX_VIDEO_DURATION_SECONDS} seconds.`,
      duration,
    };
  }

  return { ok: true, duration };
}
