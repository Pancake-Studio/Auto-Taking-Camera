import React, { useMemo } from 'react';
import { PhotoData } from '../types';
import { QRCodeSVG } from 'qrcode.react';
import { Hand } from 'lucide-react';

interface PhotoStripProps {
  photos: PhotoData[];
  onRestart: () => void;
}

const PhotoStrip: React.FC<PhotoStripProps> = ({ photos, onRestart }) => {
  // Fix: Memoize the QR value so it doesn't change on every render (e.g. when gesture progress updates)
  const qrValue = useMemo(() => "https://example.com/photobooth/download?id=" + Date.now(), []);

  return (
    <div className="flex flex-col items-center justify-center w-full h-full p-4">
      
      {/* Central Card */}
      <div className="bg-slate-900/90 p-6 rounded-3xl border border-white/20 shadow-2xl flex flex-col items-center text-center max-w-lg w-full backdrop-blur-xl animate-in fade-in zoom-in duration-300">
        
        <h2 className="text-2xl font-bold text-white mb-4 drop-shadow-md">รูปถ่ายของคุณ!</h2>

        {/* Photos Grid */}
        <div className="flex gap-2 mb-6 w-full justify-center overflow-x-auto">
            {photos.map((photo) => (
                <div key={photo.id} className="w-24 h-32 bg-black rounded-lg overflow-hidden border-2 border-white/20 shadow-md shrink-0">
                    <img src={photo.dataUrl} alt="Booth photo" className="w-full h-full object-cover transform scale-x-[-1]" />
                </div>
            ))}
        </div>
        
        <div className="flex flex-row items-center gap-6">
            <div className="bg-white p-3 rounded-xl shadow-lg transform transition-transform hover:scale-105 duration-300">
               <QRCodeSVG value={qrValue} size={140} level="H" />
            </div>
            
            <div className="flex flex-col items-start text-left">
                <p className="text-lg font-bold text-white mb-1">สแกนเลย!</p>
                <p className="text-xs text-slate-400 max-w-[120px]">
                   ใช้มือถือสแกนเพื่อดาวน์โหลดรูปภาพทั้งหมด
                </p>
            </div>
        </div>

        <div className="w-full border-t border-white/10 my-6"></div>

        {/* Restart Instruction */}
        <div className="flex items-center gap-4 bg-white/5 p-3 rounded-full px-6 border border-white/10">
           <div className="relative">
             <div className="w-12 h-12 rounded-full bg-rose-500/20 flex items-center justify-center border-2 border-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.4)] animate-pulse">
                <Hand className="text-rose-500" size={24} />
             </div>
           </div>
           <div className="text-left">
             <p className="text-lg font-bold text-white leading-tight">แบมือค้างไว้</p>
             <p className="text-xs text-rose-300 leading-tight">เพื่อถ่ายใหม่</p>
           </div>
        </div>
      </div>

    </div>
  );
};

export default PhotoStrip;