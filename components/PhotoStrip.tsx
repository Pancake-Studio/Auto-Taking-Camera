import React, { useMemo, useState, useEffect } from 'react';
import { PhotoData } from '../types';
import { QRCodeSVG } from 'qrcode.react';
import { Hand, Loader2, Sparkles, Download } from 'lucide-react';
import { uploadPhotos } from '../services/uploadService';

interface PhotoStripProps {
  photos: PhotoData[];
  onRestart: () => void;
}

const PhotoStrip: React.FC<PhotoStripProps> = ({ photos, onRestart }) => {
  const [uploading, setUploading] = useState(true);
  const [uploadedUrls, setUploadedUrls] = useState<string[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Upload photos to Uploadcare on mount
  useEffect(() => {
    const upload = async () => {
      try {
        const urls = await uploadPhotos(photos);
        setUploadedUrls(urls);
        setUploading(false);
      } catch (error) {
        console.error('Upload failed:', error);
        setUploadError('การอัพโหลดล้มเหลว กรุณาลองใหม่อีกครั้ง');
        setUploading(false);
      }
    };
    upload();
  }, [photos]);

  // Create QR code URL
  const baseUrl = import.meta.env.VITE_APP_URL || window.location.origin;
  const qrValue = useMemo(() => {
    if (uploadedUrls.length === 0) return '';
    const urlsParam = encodeURIComponent(JSON.stringify(uploadedUrls));
    return `${baseUrl}/#download?urls=${urlsParam}`;
  }, [baseUrl, uploadedUrls]);

  return (
    <div className="flex flex-col items-center justify-center w-full h-full p-6 animate-in fade-in zoom-in duration-500">

      {/* Main Container Card */}
      <div className="bg-white/90 backdrop-blur-xl p-8 rounded-[3rem] shadow-2xl flex flex-row gap-8 items-center max-w-5xl w-full border-4 border-white relative overflow-hidden">

        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-pink-200 rounded-full blur-[60px] opacity-60 pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-40 h-40 bg-purple-200 rounded-full blur-[60px] opacity-60 pointer-events-none"></div>

        {/* Left Side: Large Photo Preview */}
        <div className="flex-1 flex justify-center items-center relative group">
          {photos.length > 0 && (
            <div className="relative transform rotate-[-2deg] transition-transform group-hover:rotate-0 duration-500">
              <div className="absolute inset-0 bg-black rounded-2xl transform translate-x-2 translate-y-3 opacity-20 blur-sm"></div>
              <div className="bg-white p-3 rounded-2xl shadow-xl border border-slate-100">
                {/* Changed aspect-ratio to 4/3 (Landscape) */}
                <div className="overflow-hidden rounded-xl relative max-w-[60vw] max-h-[60vh]">
                  <img
                    src={photos[0].dataUrl}
                    alt="Booth photo"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="mt-2 text-center text-slate-400 font-bold tracking-widest text-xs uppercase opacity-50">
                  Ferrum Group X โรงเรียนสันติสุขพิทยาคม
                </div>
              </div>

              {/* Sticker Decorations */}
              <div className="absolute -top-6 -right-6 animate-bounce delay-700">
                <Sparkles size={40} className="text-yellow-400 drop-shadow-sm" />
              </div>
            </div>
          )}
        </div>

        {/* Vertical Divider */}
        <div className="w-[2px] h-64 bg-slate-100 rounded-full hidden md:block"></div>

        {/* Right Side: QR & Actions */}
        <div className="flex-1 flex flex-col items-center text-center gap-6 z-10">

          <div>
            <h2 className="text-4xl font-black text-slate-800 mb-2 drop-shadow-sm">รูปสวยมาก! ✨</h2>
            <p className="text-slate-500 font-medium">สแกนเพื่อรับรูปได้เลย</p>
          </div>

          <div className="bg-white p-5 rounded-3xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)] border-2 border-slate-50 transform hover:scale-105 transition-transform duration-300">
            {uploading ? (
              <div className="w-[160px] h-[160px] flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-10 h-10 text-pink-500 animate-spin" />
                <span className="text-xs font-bold text-pink-400 animate-pulse">Creating Magic...</span>
              </div>
            ) : uploadError ? (
              <div className="w-[160px] h-[160px] flex items-center justify-center text-red-400 text-sm font-bold">
                {uploadError}
              </div>
            ) : (
              <QRCodeSVG value={qrValue} size={160} level="M" className="rounded-lg" />
            )}
          </div>

          {/* Action Hint */}
          <div className="flex items-center gap-3 bg-emerald-50 p-3 pr-6 rounded-full border border-emerald-100 mt-2">
            <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-200 animate-pulse">
              <span className="text-2xl">👌</span>
            </div>
            <div className="text-left">
              <p className="text-sm font-bold text-emerald-600">โชว์มือ OK ค้างไว้ 3 วิ</p>
              <p className="text-xs text-emerald-400">เพื่อถ่ายใหม่</p>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};

export default PhotoStrip;