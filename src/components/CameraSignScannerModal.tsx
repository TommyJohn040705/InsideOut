import React, { useEffect, useRef, useState } from 'react';
import { Camera, X, QrCode, Sparkles, CheckCircle2, AlertCircle, RefreshCw, Upload, Image as ImageIcon } from 'lucide-react';
import { RoomPOI, SignCandidateMatch, QRCheckpoint } from '../types/navigation';
import { E5_CHECKPOINTS, resolveCheckpoint } from '../data/e5/checkpoints';

interface Props {
  open: boolean;
  onClose: () => void;
  activeFloor: number;
  allRooms: RoomPOI[];
  onConfirmCheckpoint: (checkpoint: QRCheckpoint | { roomId: string; roomNumber: string; name: string; floor: number; coords: { x: number; y: number } }) => void;
}

export function CameraSignScannerModal({ open, onClose, activeFloor, allRooms, onConfirmCheckpoint }: Props) {
  const [mode, setMode] = useState<'camera' | 'upload' | 'simulate'>('camera');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Result state
  const [recognizedText, setRecognizedText] = useState<string>('');
  const [detectedType, setDetectedType] = useState<string>('');
  const [candidates, setCandidates] = useState<SignCandidateMatch[]>([]);
  const [isUniqueMatch, setIsUniqueMatch] = useState(false);
  const [matchedCheckpoint, setMatchedCheckpoint] = useState<QRCheckpoint | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Start camera when modal opens in camera mode
  useEffect(() => {
    if (!open || mode !== 'camera' || capturedImage) {
      stopCamera();
      return;
    }

    let active = true;
    async function startCam() {
      try {
        setCameraError(null);
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (!active) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        setStream(s);
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play().catch(() => {});
        }
      } catch (err: any) {
        console.warn('Camera access unavailable:', err);
        setCameraError('Camera access not granted or not available on this device. You can upload a photo or use the simulator below.');
        setMode('upload');
      }
    }

    startCam();
    return () => {
      active = false;
      stopCamera();
    };
  }, [open, mode, capturedImage]);

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
    }
  };

  const resetCapture = () => {
    setCapturedImage(null);
    setRecognizedText('');
    setCandidates([]);
    setIsUniqueMatch(false);
    setMatchedCheckpoint(null);
    setErrorMsg(null);
    if (mode === 'camera') {
      // Re-trigger camera
      setStream(null);
    }
  };

  const handleCapturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    setCapturedImage(dataUrl);
    stopCamera();
    analyzePhoto(dataUrl);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setCapturedImage(dataUrl);
      analyzePhoto(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const analyzePhoto = async (dataUrl: string) => {
    setAnalyzing(true);
    setErrorMsg(null);
    setCandidates([]);
    setIsUniqueMatch(false);
    setMatchedCheckpoint(null);

    try {
      const res = await fetch('/api/recognize-sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: dataUrl,
          floorHint: activeFloor,
          candidateRooms: allRooms.map((r) => ({
            id: r.id,
            roomNumber: r.roomNumber,
            name: r.name,
            floor: r.floor,
            category: r.category,
            coords: r.coords,
          })),
        }),
      });

      if (!res.ok) {
        throw new Error('Server recognition unavailable');
      }

      const data = await res.json();
      setRecognizedText(data.rawText || data.extractedName || '');
      setDetectedType(data.detectedType || 'room_number');

      // Check if a QR code was extracted
      if (data.qrCode) {
        const chk = resolveCheckpoint(data.qrCode);
        if (chk) {
          setMatchedCheckpoint(chk);
          setIsUniqueMatch(true);
          setAnalyzing(false);
          return;
        }
      }

      if (data.extractedRoomNumber) {
        const chk = resolveCheckpoint(data.extractedRoomNumber);
        if (chk) {
          setMatchedCheckpoint(chk);
        }
      }

      setCandidates(data.candidates || []);
      setIsUniqueMatch(Boolean(data.isUniqueMatch));

      if ((!data.candidates || data.candidates.length === 0) && !data.qrCode) {
        setErrorMsg(`Visible text: "${data.rawText || 'unclear'}". No matching E5 room or checkpoint was found. Try selecting from the simulator or taking a closer photo.`);
      }
    } catch {
      // Local fallback parsing
      fallbackLocalRecognize(dataUrl);
    } finally {
      setAnalyzing(false);
    }
  };

  const fallbackLocalRecognize = (_dataUrl: string) => {
    // When offline or server error, provide prompt
    setErrorMsg('Offline mode: Could not reach AI vision server. Pick a checkpoint or enter a room number below.');
  };

  const handleSimulateCheckpoint = (chk: QRCheckpoint) => {
    onConfirmCheckpoint(chk);
    onClose();
  };

  const handleConfirmCandidate = (c: SignCandidateMatch) => {
    onConfirmCheckpoint({
      roomId: c.roomId,
      roomNumber: c.roomNumber,
      name: c.name,
      floor: c.floor,
      coords: c.coords,
    });
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-xl h-[90dvh] sm:h-[720px] rounded-t-3xl sm:rounded-3xl flex flex-col shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-slate-100">
          <span className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center">
            <Camera className="w-5 h-5" />
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="font-extrabold text-slate-900 text-base">Camera & Checkpoint Wayfinding</h3>
            <p className="text-xs text-slate-500">Photograph a door sign, elevator plaque, or enter a checkpoint code</p>
          </div>
          <button aria-label="Close" onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-slate-100 px-4 pt-2 gap-2 text-sm">
          <button
            onClick={() => { setMode('camera'); resetCapture(); }}
            className={`pb-2.5 font-bold border-b-2 flex items-center gap-1.5 transition-colors ${
              mode === 'camera' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Camera className="w-4 h-4" /> Live Camera
          </button>
          <button
            onClick={() => { setMode('upload'); resetCapture(); }}
            className={`pb-2.5 font-bold border-b-2 flex items-center gap-1.5 transition-colors ${
              mode === 'upload' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Upload className="w-4 h-4" /> Photo Upload
          </button>
          <button
            onClick={() => { setMode('simulate'); resetCapture(); }}
            className={`pb-2.5 font-bold border-b-2 flex items-center gap-1.5 transition-colors ${
              mode === 'simulate' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <QrCode className="w-4 h-4" /> Checkpoint codes
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {mode === 'camera' && !capturedImage && (
            <div className="space-y-3">
              <div className="relative aspect-[4/3] bg-black rounded-2xl overflow-hidden flex items-center justify-center">
                <video ref={videoRef} playsInline autoPlay muted className="w-full h-full object-cover" />
                {/* Target overlay reticle */}
                <div className="absolute inset-8 border-2 border-dashed border-white/60 rounded-2xl pointer-events-none flex flex-col justify-between p-3">
                  <span className="text-[11px] font-semibold text-white/90 bg-black/40 backdrop-blur px-2 py-0.5 rounded self-center">
                    Align room plaque or QR code in frame
                  </span>
                  <div className="flex justify-between items-end">
                    <span className="text-[10px] text-white/70">Level {activeFloor}</span>
                    <span className="text-[10px] text-white/70">Waterloo E5</span>
                  </div>
                </div>
              </div>
              <canvas ref={canvasRef} className="hidden" />

              <div className="flex gap-2">
                <button
                  onClick={handleCapturePhoto}
                  className="flex-1 h-12 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center justify-center gap-2 shadow"
                >
                  <Camera className="w-5 h-5" /> Capture & Identify Sign
                </button>
              </div>
            </div>
          )}

          {mode === 'upload' && !capturedImage && (
            <div className="space-y-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-2xl p-8 text-center cursor-pointer bg-slate-50 hover:bg-blue-50/50 transition-colors"
              >
                <ImageIcon className="w-12 h-12 text-slate-400 mx-auto mb-2" />
                <p className="font-bold text-slate-800">Tap to upload a photo of a door sign or plaque</p>
                <p className="text-xs text-slate-500 mt-1">Accepts camera snapshots, signage photos, and saved QR images</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </div>
              {cameraError && (
                <div className="p-3 bg-amber-50 rounded-xl text-xs text-amber-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                  <span>{cameraError}</span>
                </div>
              )}
            </div>
          )}

          {/* Captured Preview & Analysis Results */}
          {capturedImage && (
            <div className="space-y-4">
              <div className="relative rounded-2xl overflow-hidden max-h-56 bg-slate-900 flex items-center justify-center">
                <img src={capturedImage} alt="Captured signage" className="max-h-56 w-auto object-contain" />
                <button
                  onClick={resetCapture}
                  className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1.5 hover:bg-black"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>

              {analyzing && (
                <div className="p-4 rounded-2xl bg-blue-50 text-blue-900 flex items-center gap-3">
                  <Sparkles className="w-6 h-6 text-blue-600 animate-spin" />
                  <div>
                    <p className="font-bold text-sm">Analyzing signage text with AI...</p>
                    <p className="text-xs text-blue-700">Extracting room numbers and matching with E5 directory</p>
                  </div>
                </div>
              )}

              {/* Matched Checkpoint */}
              {matchedCheckpoint && (
                <div className="p-4 rounded-2xl bg-emerald-50 ring-1 ring-emerald-200 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-800 font-bold">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    <span>Checkpoint code recognized</span>
                  </div>
                  <p className="text-sm text-emerald-950 font-semibold">{matchedCheckpoint.name}</p>
                  <p className="text-xs text-emerald-700">Code: {matchedCheckpoint.code} · Level {matchedCheckpoint.floor}</p>
                  <button
                    onClick={() => handleSimulateCheckpoint(matchedCheckpoint)}
                    className="w-full mt-2 h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center justify-center gap-2 shadow-sm"
                  >
                    Confirm My Location Here
                  </button>
                </div>
              )}

              {/* Unique Room Match */}
              {isUniqueMatch && candidates.length === 1 && !matchedCheckpoint && (
                <div className="p-4 rounded-2xl bg-emerald-50 ring-1 ring-emerald-200 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-800 font-bold">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    <span>High-Confidence Match (Unique Sign)</span>
                  </div>
                  <p className="text-sm font-extrabold text-emerald-950">
                    E5 {candidates[0].roomNumber} · {candidates[0].name}
                  </p>
                  <p className="text-xs text-emerald-700">Level {candidates[0].floor} · {candidates[0].reason}</p>
                  <button
                    onClick={() => handleConfirmCandidate(candidates[0])}
                    className="w-full mt-2 h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center justify-center gap-2 shadow-sm"
                  >
                    Set as Starting Location
                  </button>
                </div>
              )}

              {/* Multiple Ambiguous Matches */}
              {!isUniqueMatch && candidates.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                    Multiple candidate matches found. Select your room:
                  </p>
                  <div className="divide-y divide-slate-100 rounded-2xl ring-1 ring-slate-200 overflow-hidden bg-white">
                    {candidates.map((c) => (
                      <button
                        key={c.roomId}
                        onClick={() => handleConfirmCandidate(c)}
                        className="w-full text-left p-3 hover:bg-blue-50 flex items-center justify-between transition-colors"
                      >
                        <div>
                          <p className="font-bold text-sm text-slate-900">E5 {c.roomNumber} · {c.name}</p>
                          <p className="text-xs text-slate-500">Floor {c.floor} · {c.reason}</p>
                        </div>
                        <span className="text-xs font-semibold px-2 py-1 rounded bg-slate-100 text-slate-700">
                          {c.score}% Match
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {errorMsg && (
                <div className="p-3 bg-rose-50 rounded-xl text-xs text-rose-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}
            </div>
          )}

          {/* App-defined checkpoint list */}
          {(mode === 'simulate' || !capturedImage) && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  E5 checkpoint codes
                </p>
                <span className="text-xs text-blue-600 font-semibold">{E5_CHECKPOINTS.length} codes</span>
              </div>
              <p className="text-xs text-slate-500">
                App-defined checkpoint codes (no QR codes are posted in E5 yet). Tap one to set your position there:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {E5_CHECKPOINTS.map((chk) => (
                  <button
                    key={chk.id}
                    onClick={() => handleSimulateCheckpoint(chk)}
                    className="p-3 text-left rounded-xl ring-1 ring-slate-200 hover:ring-blue-500 hover:bg-blue-50/40 transition-all bg-white flex flex-col justify-between group"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                          {chk.code}
                        </span>
                        <span className="text-[11px] font-semibold text-slate-500">Level {chk.floor}</span>
                      </div>
                      <p className="text-xs font-bold text-slate-800 group-hover:text-blue-900 leading-snug">
                        {chk.name}
                      </p>
                    </div>
                    <span className="text-[10px] text-slate-400 mt-2 block">{chk.description}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
