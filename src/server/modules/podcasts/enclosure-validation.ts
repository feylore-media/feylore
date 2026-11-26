import { parseBuffer } from "music-metadata";

export const MIN_ENCLOSURE_BYTES = 1024;

function hasMp3Magic(data: Buffer): boolean {
  if (data.length >= 3 && data[0] === 0x49 && data[1] === 0x44 && data[2] === 0x33) {
    return true;
  }
  if (data.length >= 2 && data[0] === 0xff && (data[1]! & 0xe0) === 0xe0) {
    return true;
  }
  return false;
}

function hasOggMagic(data: Buffer): boolean {
  return (
    data.length >= 4 &&
    data[0] === 0x4f &&
    data[1] === 0x67 &&
    data[2] === 0x67 &&
    data[3] === 0x53
  );
}

function hasFlacMagic(data: Buffer): boolean {
  return (
    data.length >= 4 &&
    data[0] === 0x66 &&
    data[1] === 0x4c &&
    data[2] === 0x61 &&
    data[3] === 0x43
  );
}

function hasAudioMagic(data: Buffer, mediaType: string): boolean {
  const base = mediaType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (base === "audio/mpeg" || base === "audio/mp3") {
    return hasMp3Magic(data);
  }
  if (base === "audio/ogg") {
    return hasOggMagic(data);
  }
  if (base === "audio/flac") {
    return hasFlacMagic(data);
  }
  if (base === "audio/mp4" || base === "audio/x-m4a" || base === "audio/m4a") {
    return data.length >= 8 && data[4] === 0x66 && data[5] === 0x74 && data[6] === 0x79 && data[7] === 0x70;
  }
  return data.length >= MIN_ENCLOSURE_BYTES;
}

export async function validateEnclosureAudio(
  data: Buffer,
  mediaType: string,
): Promise<{ durationSeconds?: number }> {
  if (data.length < MIN_ENCLOSURE_BYTES) {
    throw new Error(`Enclosure too small (${data.length} bytes)`);
  }

  const normalizedType = mediaType.split(";")[0]?.trim() ?? "application/octet-stream";
  if (!hasAudioMagic(data, normalizedType)) {
    throw new Error("Enclosure does not look like valid audio data");
  }

  const metadata = await parseBuffer(data, { mimeType: normalizedType });
  const duration = metadata.format.duration;
  if (!duration || duration <= 0) {
    throw new Error("Enclosure is not decodable audio");
  }

  return { durationSeconds: Math.round(duration) };
}
