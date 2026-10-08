import { execFile } from "child_process";
import { randomUUID } from "crypto";
import { unlink, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const IMAGE_SIZE = 224;
const FRAME_BYTES = IMAGE_SIZE * IMAGE_SIZE * 3;
const MAX_VIDEO_FRAMES = 8;

const envProbability = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 && value <= 1 ? value : fallback;
};

// Porn + Hentai combined; "Sexy" (swimwear, lingerie) only when very confident.
const EXPLICIT_THRESHOLD = envProbability("MODERATION_EXPLICIT_THRESHOLD", 0.6);
const SEXY_THRESHOLD = envProbability("MODERATION_SEXY_THRESHOLD", 0.85);

export const CONTENT_REJECTED_CODE = "CONTENT_REJECTED";
export const CONTENT_REJECTED_MESSAGE =
  "This image or video contains inappropriate content and can't be uploaded.";

export const isModerationEnabled = () => process.env.MODERATION_ENABLED !== "false";

let modelPromise = null;

const loadModel = () => {
  if (!modelPromise) {
    modelPromise = (async () => {
      const tf = await import("@tensorflow/tfjs");
      await import("@tensorflow/tfjs-backend-wasm");
      await tf.setBackend("wasm");
      await tf.ready();
      const nsfwjs = await import("nsfwjs");
      const model = await nsfwjs.load("MobileNetV2");
      return { tf, model };
    })().catch((error) => {
      modelPromise = null;
      throw error;
    });
  }
  return modelPromise;
};

export const warmUpModeration = () => {
  if (!isModerationEnabled()) return;
  loadModel()
    .then(() => console.log("Content moderation model ready"))
    .catch((error) =>
      console.error("Content moderation model failed to load:", error.message)
    );
};

const scoreFrame = async ({ tf, model }, pixels) => {
  const tensor = tf.tensor3d(pixels, [IMAGE_SIZE, IMAGE_SIZE, 3], "int32");
  try {
    const predictions = await model.classify(tensor, 5);
    return Object.fromEntries(
      predictions.map((p) => [p.className, Number(p.probability.toFixed(3))])
    );
  } finally {
    tensor.dispose();
  }
};

const isUnsafe = (scores) =>
  (scores.Porn || 0) + (scores.Hentai || 0) >= EXPLICIT_THRESHOLD ||
  (scores.Sexy || 0) >= SEXY_THRESHOLD;

/**
 * Fails open: if the model or decoder breaks, the upload is allowed and logged
 * so a moderation outage never blocks every upload.
 */
export async function moderateImage(buffer) {
  if (!isModerationEnabled() || !buffer?.length) return { ok: true };

  try {
    const engine = await loadModel();
    const { default: sharp } = await import("sharp");
    const { data, info } = await sharp(buffer)
      .rotate()
      .toColourspace("srgb")
      .removeAlpha()
      .resize(IMAGE_SIZE, IMAGE_SIZE, { fit: "cover" })
      .raw()
      .toBuffer({ resolveWithObject: true });

    if (info.channels !== 3) {
      throw new Error(`unexpected channel count ${info.channels}`);
    }

    const scores = await scoreFrame(engine, new Uint8Array(data));
    return { ok: !isUnsafe(scores), scores };
  } catch (error) {
    console.error("IMAGE MODERATION SKIPPED 👉", error.message);
    return { ok: true, skipped: true };
  }
}

export async function moderateVideo(buffer, durationSeconds) {
  if (!isModerationEnabled() || !buffer?.length) return { ok: true };

  const inputPath = join(tmpdir(), `moderation-${randomUUID()}`);
  try {
    const engine = await loadModel();
    const { default: ffmpegPath } = await import("ffmpeg-static");
    if (!ffmpegPath) throw new Error("ffmpeg binary unavailable");

    await writeFile(inputPath, buffer);

    const duration = Number(durationSeconds) > 0 ? Number(durationSeconds) : 30;
    const fps = Math.min(4, MAX_VIDEO_FRAMES / duration).toFixed(4);
    const { stdout } = await execFileAsync(
      ffmpegPath,
      [
        "-hide_banner",
        "-loglevel", "error",
        "-i", inputPath,
        "-vf",
        `fps=${fps},scale=${IMAGE_SIZE}:${IMAGE_SIZE}:force_original_aspect_ratio=increase,crop=${IMAGE_SIZE}:${IMAGE_SIZE}`,
        "-frames:v", String(MAX_VIDEO_FRAMES),
        "-f", "rawvideo",
        "-pix_fmt", "rgb24",
        "pipe:1",
      ],
      {
        encoding: "buffer",
        maxBuffer: FRAME_BYTES * (MAX_VIDEO_FRAMES + 1),
        timeout: 60_000,
      }
    );

    const frameCount = Math.floor(stdout.length / FRAME_BYTES);
    if (!frameCount) throw new Error("no frames decoded");

    for (let i = 0; i < frameCount; i += 1) {
      const frame = new Uint8Array(
        stdout.subarray(i * FRAME_BYTES, (i + 1) * FRAME_BYTES)
      );
      const scores = await scoreFrame(engine, frame);
      if (isUnsafe(scores)) return { ok: false, scores, frame: i };
    }
    return { ok: true, frames: frameCount };
  } catch (error) {
    console.error("VIDEO MODERATION SKIPPED 👉", error.message);
    return { ok: true, skipped: true };
  } finally {
    await unlink(inputPath).catch(() => {});
  }
}

export const rejectUnsafeContent = (res, userId, kind, result) => {
  console.warn(
    `CONTENT REJECTED 👉 user=${userId} kind=${kind}`,
    JSON.stringify(result.scores),
    result.frame != null ? `frame=${result.frame}` : ""
  );
  return res.status(400).json({
    code: CONTENT_REJECTED_CODE,
    message: CONTENT_REJECTED_MESSAGE,
  });
};
