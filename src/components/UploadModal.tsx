import React, { useState, useRef } from 'react';
import { Upload, X, RotateCw, Sparkles, Image as ImageIcon, AlertCircle } from 'lucide-react';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadComplete: (imageDataUrl: string, buildingTypeHint?: string) => Promise<void>;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  onUploadComplete,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [rotationDegrees, setRotationDegrees] = useState<number>(0);
  const [buildingTypeHint, setBuildingTypeHint] = useState<string>('Office / Corporate Campus');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please select a valid image file (PNG, JPG, WEBP, or SVG).');
      return;
    }
    setErrorMessage(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      setSelectedImage(event.target?.result as string);
      setRotationDegrees(0);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleRotate = () => {
    setRotationDegrees((prev) => (prev + 90) % 360);
  };

  const getOrientedImageData = async (): Promise<string> => {
    if (!selectedImage) return '';
    if (rotationDegrees === 0) return selectedImage;

    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(selectedImage);
          return;
        }

        if (rotationDegrees === 90 || rotationDegrees === 270) {
          canvas.width = img.height;
          canvas.height = img.width;
        } else {
          canvas.width = img.width;
          canvas.height = img.height;
        }

        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((rotationDegrees * Math.PI) / 180);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);

        resolve(canvas.toDataURL('image/jpeg', 0.9));
      };
      img.src = selectedImage;
    });
  };

  const handleSubmit = async () => {
    if (!selectedImage) return;
    try {
      setIsAnalyzing(true);
      setErrorMessage(null);
      const finalImage = await getOrientedImageData();
      await onUploadComplete(finalImage, buildingTypeHint);
      onClose();
      setSelectedImage(null);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err?.message || 'Failed to analyze floor plan with AI.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-[#0b101e] border border-sky-500/30 rounded-3xl overflow-hidden shadow-[0_25px_60px_rgba(0,0,0,0.9)] flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-sky-400" />
            <h3 className="text-base font-bold text-white">Upload Floor Plan Blueprint</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-4">
          {errorMessage && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          {isAnalyzing ? (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <div className="relative w-20 h-20 mb-4">
                <div className="absolute inset-0 rounded-full border-4 border-sky-500/30 animate-ping" />
                <div className="relative w-full h-full rounded-full border-4 border-sky-400 border-t-transparent animate-spin flex items-center justify-center">
                  <Sparkles className="w-8 h-8 text-sky-300" />
                </div>
              </div>
              <h4 className="text-base font-bold text-white mb-1">
                Analyzing Floor Plan with Gemini AI...
              </h4>
              <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
                Extracting architectural rooms, exits, corridors, and establishing an indoor coordinate map for step-by-step navigation.
              </p>
            </div>
          ) : selectedImage ? (
            /* Image Preview & Adjustment */
            <div className="space-y-4">
              <div className="relative bg-slate-950/80 rounded-2xl p-4 border border-slate-800 flex items-center justify-center overflow-hidden min-h-[260px]">
                <img
                  src={selectedImage}
                  alt="Floor Plan Preview"
                  style={{ transform: `rotate(${rotationDegrees}deg)` }}
                  className="max-h-[300px] w-auto object-contain transition-transform duration-200 rounded-xl shadow-2xl border border-sky-500/20"
                />

                <div className="absolute bottom-3 right-3 flex items-center gap-1.5 p-1 bg-[#090e1c]/90 backdrop-blur-md rounded-xl border border-sky-500/30 shadow-lg">
                  <button
                    onClick={handleRotate}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-sky-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                    title="Rotate 90 degrees clockwise"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    <span>Rotate</span>
                  </button>
                  <button
                    onClick={() => setSelectedImage(null)}
                    className="px-2.5 py-1.5 text-xs text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
                  >
                    Change
                  </button>
                </div>
              </div>

              {/* Building Type Hint */}
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-mono font-medium">
                  BUILDING CONTEXT (TUNES ROOM DETECTION):
                </label>
                <select
                  value={buildingTypeHint}
                  onChange={(e) => setBuildingTypeHint(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-xs text-white rounded-xl px-3 py-2.5 focus:outline-none focus:border-sky-500 font-semibold"
                >
                  <option value="Office / Corporate Campus">Office / Corporate Campus</option>
                  <option value="Hospital / Medical Facility">Hospital / Medical Facility</option>
                  <option value="Airport / Transit Concourse">Airport / Transit Concourse</option>
                  <option value="Shopping Mall / Retail Store">Shopping Mall / Retail Store</option>
                  <option value="University / School Building">University / School Building</option>
                  <option value="Museum / Exhibition Gallery">Museum / Exhibition Gallery</option>
                  <option value="Residential / Apartment Complex">Residential / Apartment</option>
                  <option value="Convention / Event Center">Convention Center</option>
                </select>
              </div>
            </div>
          ) : (
            /* Drag and Drop Upload Zone */
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingOver(true);
              }}
              onDragLeave={() => setIsDraggingOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-3xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center min-h-[230px] ${
                isDraggingOver
                  ? 'border-sky-400 bg-sky-500/10 shadow-[0_0_25px_rgba(56,189,248,0.2)]'
                  : 'border-slate-800 hover:border-sky-500/50 bg-slate-950/60 hover:bg-slate-950'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="w-14 h-14 rounded-2xl bg-sky-500/10 border border-sky-400/20 text-sky-400 flex items-center justify-center mb-3 shadow-[0_0_15px_rgba(56,189,248,0.15)]">
                <ImageIcon className="w-7 h-7" />
              </div>
              <h4 className="text-sm font-bold text-white mb-1">
                Drop your floor plan photo here
              </h4>
              <p className="text-xs text-slate-400 max-w-xs leading-relaxed mb-4">
                Supports blueprints, campus directories, mall kiosk maps, or hand sketches (PNG, JPG, WEBP, SVG)
              </p>
              <button
                type="button"
                className="py-2.5 px-5 bg-slate-900 hover:bg-slate-800 text-sky-300 hover:text-white text-xs font-bold rounded-xl border border-sky-500/30 transition-all shadow-sm"
              >
                Browse Files
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        {selectedImage && !isAnalyzing && (
          <div className="px-6 py-4 border-t border-slate-800/80 bg-[#090e1c] flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              className="py-2.5 px-4 text-xs font-semibold text-slate-400 hover:text-white rounded-xl"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              className="py-2.5 px-6 bg-gradient-to-r from-sky-400 via-sky-300 to-cyan-300 hover:from-sky-300 hover:to-cyan-200 text-slate-950 text-xs font-bold rounded-xl shadow-[0_0_20px_rgba(56,189,248,0.35)] transition-all flex items-center gap-1.5 active:scale-95"
            >
              <Sparkles className="w-4 h-4 text-slate-950" />
              <span>Digitize & Navigate</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
