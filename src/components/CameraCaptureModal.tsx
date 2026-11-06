import React, { useState, useRef, useEffect } from 'react';
import { Camera, RefreshCw, X, Check, AlertCircle, Sparkles, Upload } from 'lucide-react';

interface CameraCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCaptureComplete: (imageDataUrl: string, buildingTypeHint?: string) => Promise<void>;
  onSwitchToUpload: () => void;
}

export const CameraCaptureModal: React.FC<CameraCaptureModalProps> = ({
  isOpen,
  onClose,
  onCaptureComplete,
  onSwitchToUpload,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [buildingTypeHint, setBuildingTypeHint] = useState<string>('Office / Corporate Campus');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setCapturedImage(null);
      setIsAnalyzing(false);
      return;
    }

    startCamera();

    return () => {
      stopCamera();
    };
  }, [isOpen, facingMode]);

  const startCamera = async () => {
    try {
      setErrorMessage(null);
      stopCamera();

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setHasPermission(false);
        setErrorMessage('Camera access is not supported in this browser environment.');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      setHasPermission(true);
    } catch (err: any) {
      console.warn('Camera access denied or unavailable:', err);
      setHasPermission(false);
      setErrorMessage(
        err.name === 'NotAllowedError'
          ? 'Camera permission was denied. Please allow camera access in browser settings or upload a photo instead.'
          : 'Unable to access camera. You can upload an image of your floor plan.'
      );
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const handleSwitchCamera = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  const handleCaptureSnapshot = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;

    const canvas = canvasRef.current || document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    setCapturedImage(dataUrl);
    stopCamera();
  };

  const handleRetake = () => {
    setCapturedImage(null);
    startCamera();
  };

  const handleConfirmAndAnalyze = async () => {
    if (!capturedImage) return;
    try {
      setIsAnalyzing(true);
      await onCaptureComplete(capturedImage, buildingTypeHint);
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to analyze floor plan with AI');
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-[#0b101e] border border-sky-500/30 rounded-3xl overflow-hidden shadow-[0_25px_60px_rgba(0,0,0,0.9)] flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-sky-400" />
            <h3 className="text-base font-bold text-white">Scan Floor Plan Photo</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Viewport / Preview Body */}
        <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden min-h-[350px]">
          {isAnalyzing && (
            <div className="absolute inset-0 z-30 bg-[#090e1b]/90 backdrop-blur-xl flex flex-col items-center justify-center p-6 text-center">
              <div className="relative w-20 h-20 mb-4">
                <div className="absolute inset-0 rounded-full border-4 border-sky-500/30 animate-ping" />
                <div className="relative w-full h-full rounded-full border-4 border-sky-400 border-t-transparent animate-spin flex items-center justify-center">
                  <Sparkles className="w-8 h-8 text-sky-300" />
                </div>
              </div>
              <h4 className="text-base font-bold text-white mb-1">
                Digitizing Floor Plan with Gemini AI...
              </h4>
              <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
                Extracting architectural walls, room names, doors, elevators, and calculating walkable corridor paths.
              </p>
            </div>
          )}

          {capturedImage ? (
            /* Snapshot Review */
            <div className="relative w-full h-full flex items-center justify-center p-4">
              <img
                src={capturedImage}
                alt="Captured floor plan"
                className="max-h-[360px] w-auto object-contain rounded-2xl border border-sky-500/30 shadow-2xl"
              />
            </div>
          ) : hasPermission === false ? (
            /* Camera Permission Denied or Not Supported */
            <div className="p-8 text-center max-w-sm">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto mb-3">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-semibold text-white mb-2">Camera Unavailable</h4>
              <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                {errorMessage || 'Unable to open camera.'}
              </p>
              <button
                onClick={() => {
                  onClose();
                  onSwitchToUpload();
                }}
                className="py-2.5 px-5 bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold rounded-xl flex items-center justify-center gap-2 mx-auto shadow-lg shadow-sky-500/20 transition-all"
              >
                <Upload className="w-4 h-4" />
                <span>Upload Floor Plan Photo</span>
              </button>
            </div>
          ) : (
            /* Live Camera Feed with High-Tech Laser Reticle */
            <div className="relative w-full h-full flex items-center justify-center">
              <video
                ref={videoRef}
                playsInline
                muted
                className="w-full h-full object-cover max-h-[420px]"
              />

              {/* Viewfinder reticle overlay */}
              <div className="absolute inset-6 border border-sky-400/30 rounded-2xl pointer-events-none flex flex-col justify-between p-4 overflow-hidden">
                {/* Sweeping Laser Line */}
                <div className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-sky-400 to-transparent animate-laser shadow-[0_0_12px_rgba(56,189,248,0.8)]" />

                <div className="flex justify-between">
                  <div className="w-8 h-8 border-t-2 border-l-2 border-sky-400 rounded-tl-lg" />
                  <div className="w-8 h-8 border-t-2 border-r-2 border-sky-400 rounded-tr-lg" />
                </div>
                <div className="text-center">
                  <span className="bg-[#090e1b]/80 text-sky-200 text-[11px] font-mono px-3 py-1 rounded-full border border-sky-500/30 backdrop-blur-md">
                    ALIGN FLOOR PLAN INSIDE FRAME
                  </span>
                </div>
                <div className="flex justify-between">
                  <div className="w-8 h-8 border-b-2 border-l-2 border-sky-400 rounded-bl-lg" />
                  <div className="w-8 h-8 border-b-2 border-r-2 border-sky-400 rounded-br-lg" />
                </div>
              </div>
            </div>
          )}

          <canvas ref={canvasRef} className="hidden" />
        </div>

        {/* Footer Controls */}
        <div className="p-4 border-t border-slate-800/80 bg-[#090e1c] flex flex-col gap-3">
          {capturedImage ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-mono font-medium shrink-0">BUILDING TYPE:</span>
                <select
                  value={buildingTypeHint}
                  onChange={(e) => setBuildingTypeHint(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-xs text-white rounded-xl px-3 py-2 focus:outline-none focus:border-sky-500 flex-1 font-semibold"
                >
                  <option value="Office / Corporate Campus">Office / Corporate Campus</option>
                  <option value="Hospital / Medical Facility">Hospital / Medical Facility</option>
                  <option value="Airport / Transit Terminal">Airport / Transit Terminal</option>
                  <option value="Shopping Mall / Retail Center">Shopping Mall / Retail Center</option>
                  <option value="University / School Campus">University / School Campus</option>
                  <option value="Museum / Exhibition Gallery">Museum / Exhibition Gallery</option>
                  <option value="Residential / Apartment Building">Residential / Apartment</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleRetake}
                  disabled={isAnalyzing}
                  className="flex-1 py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-bold rounded-xl transition-colors border border-slate-800"
                >
                  Retake Photo
                </button>
                <button
                  onClick={handleConfirmAndAnalyze}
                  disabled={isAnalyzing}
                  className="flex-1 py-2.5 px-4 bg-gradient-to-r from-sky-400 via-sky-300 to-cyan-300 hover:from-sky-300 hover:to-cyan-200 text-slate-950 text-xs font-bold rounded-xl shadow-[0_0_18px_rgba(56,189,248,0.35)] transition-all flex items-center justify-center gap-1.5 active:scale-95"
                >
                  <Sparkles className="w-4 h-4 text-slate-950" />
                  <span>Digitize with AI</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <button
                onClick={handleSwitchCamera}
                disabled={!hasPermission}
                className="p-3 bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-xl transition-colors"
                title="Switch Camera (Front / Back)"
              >
                <RefreshCw className="w-5 h-5" />
              </button>

              <button
                onClick={handleCaptureSnapshot}
                disabled={!hasPermission}
                className="py-3 px-8 bg-gradient-to-r from-sky-400 via-sky-300 to-cyan-300 hover:from-sky-300 hover:to-cyan-200 text-slate-950 text-sm font-bold rounded-2xl shadow-[0_0_20px_rgba(56,189,248,0.35)] flex items-center gap-2 transition-all active:scale-95"
              >
                <Camera className="w-5 h-5 text-slate-950" />
                <span>Snap Photo</span>
              </button>

              <button
                onClick={() => {
                  onClose();
                  onSwitchToUpload();
                }}
                className="text-xs text-sky-400 hover:text-sky-300 font-bold"
              >
                Upload File
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
