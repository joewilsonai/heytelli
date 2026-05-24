import { Audio } from "expo-av";
import { requestUploadUrl } from "@workspace/api-client-react";

let activeRecording: Audio.Recording | null = null;

export async function startRecording(): Promise<void> {
  if (activeRecording) {
    try {
      await activeRecording.stopAndUnloadAsync();
    } catch {
      // ignore
    }
    activeRecording = null;
  }
  const perm = await Audio.requestPermissionsAsync();
  if (!perm.granted) {
    throw new Error("Microphone access denied. Enable it in Settings.");
  }
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
  });
  const rec = new Audio.Recording();
  await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
  await rec.startAsync();
  activeRecording = rec;
}

export async function stopRecording(): Promise<{ uri: string; durationMs: number }> {
  if (!activeRecording) throw new Error("No active recording");
  const rec = activeRecording;
  activeRecording = null;
  try {
    await rec.stopAndUnloadAsync();
  } catch (e) {
    // best effort
  }
  const status = await rec.getStatusAsync();
  const uri = rec.getURI();
  if (!uri) throw new Error("Recording produced no file");
  const durationMs =
    "durationMillis" in status && typeof status.durationMillis === "number"
      ? status.durationMillis
      : 0;
  await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
  return { uri, durationMs };
}

export async function cancelRecording(): Promise<void> {
  if (!activeRecording) return;
  const rec = activeRecording;
  activeRecording = null;
  try {
    await rec.stopAndUnloadAsync();
  } catch {
    // ignore
  }
  await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
}

/**
 * Uploads a local audio file (from expo-av) to object storage via the server's
 * presigned URL flow. Returns the object path to send to the analysis route.
 */
export async function uploadAudio(uri: string): Promise<string> {
  const ext = (uri.split(".").pop() ?? "m4a").toLowerCase().split("?")[0];
  const contentType =
    ext === "wav"
      ? "audio/wav"
      : ext === "mp3"
        ? "audio/mpeg"
        : ext === "webm"
          ? "audio/webm"
          : ext === "ogg"
            ? "audio/ogg"
            : "audio/m4a";
  const name = `audio-${Date.now()}.${ext}`;
  const fileRes = await fetch(uri);
  const blob = await fileRes.blob();
  const presigned = await requestUploadUrl({
    name,
    size: blob.size || 1,
    contentType,
  });
  const putRes = await fetch(presigned.uploadURL, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
  });
  if (!putRes.ok) throw new Error(`Audio upload failed: ${putRes.status}`);
  return presigned.objectPath;
}
