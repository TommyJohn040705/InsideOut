import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Camera capture for photographing a posted floor plan (adapted from
 * FloorNav's CameraCaptureModal, without the Tailwind/lucide dependencies).
 * Falls back to the phone's native camera picker when getUserMedia is not
 * available or permission is denied.
 */
interface Props {
  onCapture: (dataUrl: string) => void;
  onClose: () => void;
}

export function CameraCapture({ onCapture, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [error, setError] = useState<string | null>(null);
  const [shot, setShot] = useState<string | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    if (shot) return;
    let cancelled = false;
    (async () => {
      stop();
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Live camera is not available in this browser. Use "Take photo" below instead.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        setError(null);
      } catch (e) {
        setError(
          (e as DOMException)?.name === 'NotAllowedError'
            ? 'Camera permission was denied. Allow camera access, or use "Take photo" below.'
            : 'Unable to open the camera. Use "Take photo" below instead.',
        );
      }
    })();
    return () => {
      cancelled = true;
      stop();
    };
  }, [facing, shot, stop]);

  const capture = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement('canvas');
    // Downscale large frames to keep uploads fast.
    const scale = Math.min(1, 1600 / v.videoWidth);
    canvas.width = Math.round(v.videoWidth * scale);
    canvas.height = Math.round(v.videoHeight * scale);
    canvas.getContext('2d')?.drawImage(v, 0, 0, canvas.width, canvas.height);
    setShot(canvas.toDataURL('image/jpeg', 0.88));
    stop();
  };

  return (
    <div className="camera" role="dialog" aria-label="Scan a floor plan with the camera">
      <div className="camera-view">
        {shot ? (
          <img src={shot} alt="Captured floor plan" />
        ) : error ? (
          <p className="camera-error">{error}</p>
        ) : (
          <>
            <video ref={videoRef} playsInline muted />
            <div className="reticle" aria-hidden="true" />
          </>
        )}
      </div>
      <p className="hint">Hold the phone square to the posted floor plan, fill the frame, and avoid glare.</p>
      <div className="row">
        {shot ? (
          <>
            <button className="primary" onClick={() => onCapture(shot)}>
              Use this photo
            </button>
            <button onClick={() => setShot(null)}>Retake</button>
          </>
        ) : (
          <>
            <button className="primary" onClick={capture} disabled={!!error}>
              Capture
            </button>
            <button onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))} disabled={!!error}>
              Flip camera
            </button>
            <label className="button-like">
              Take photo
              <input
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const r = new FileReader();
                  r.onload = () => setShot(String(r.result));
                  r.readAsDataURL(f);
                }}
              />
            </label>
          </>
        )}
        <button onClick={() => (stop(), onClose())}>Cancel</button>
      </div>
    </div>
  );
}
