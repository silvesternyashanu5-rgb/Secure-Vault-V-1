export interface CaptureResult {
  cameraStatus: 'captured' | 'denied' | 'unavailable';
  photoDataUrl?: string;
}

export async function requestCameraPermission(): Promise<boolean> {
  if (
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices ||
    !navigator.mediaDevices.getUserMedia
  ) {
    return false;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch {
    return false;
  }
}

export async function captureIntruderSnapshot(): Promise<CaptureResult> {
  if (
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices ||
    !navigator.mediaDevices.getUserMedia
  ) {
    return { cameraStatus: 'unavailable' };
  }

  let stream: MediaStream | null = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });

    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;

    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => resolve(), 1500);
      video.onloadedmetadata = () => {
        video
          .play()
          .then(() => {
            window.setTimeout(() => {
              clearTimeout(timeout);
              resolve();
            }, 220);
          })
          .catch(reject);
      };
    });

    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      return { cameraStatus: 'unavailable' };
    }

    ctx.drawImage(video, 0, 0, width, height);
    const photoDataUrl = canvas.toDataURL('image/jpeg', 0.82);

    return {
      cameraStatus: 'captured',
      photoDataUrl,
    };
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      return { cameraStatus: 'denied' };
    }
    return { cameraStatus: 'unavailable' };
  } finally {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
  }
}
