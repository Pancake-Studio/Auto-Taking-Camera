import React, { useEffect, useState } from 'react';
import { PhotoData } from '../types';
import { Download } from 'lucide-react';

const DownloadPage: React.FC = () => {
    const [photos, setPhotos] = useState<PhotoData[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const params = new URLSearchParams(window.location.hash.split('?')[1]);
        const urlsParam = params.get('urls');

        if (urlsParam) {
            try {
                const uploadedUrls: string[] = JSON.parse(decodeURIComponent(urlsParam));
                const photoObjects: PhotoData[] = uploadedUrls.map((cdnUrl, index) => ({
                    id: `photo_${index}`,
                    dataUrl: cdnUrl, // Use Uploadcare CDN URL directly
                    timestamp: Date.now()
                }));
                setPhotos(photoObjects);
            } catch (error) {
                console.error('Failed to parse URLs:', error);
            }
        }
        setLoading(false);
    }, []);

    const downloadAll = async () => {
        try {
            // Detect if mobile/iOS
            const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

            if (isMobile && navigator.share && photos.length === 1) {
                // Use Share API on mobile for single photo
                const photo = photos[0];

                // Fetch the image as a blob
                const response = await fetch(photo.dataUrl);
                const blob = await response.blob();
                const file = new File([blob], `photobooth_${Date.now()}.jpg`, { type: 'image/jpeg' });

                await navigator.share({
                    files: [file],
                    title: 'Photo Booth',
                    text: 'รูปถ่ายจาก Photobooth'
                });
            } else {
                // Desktop or fallback - fetch and download
                if (photos.length === 1) {
                    const response = await fetch(photos[0].dataUrl);
                    const blob = await response.blob();
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `photobooth_${Date.now()}.jpg`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);
                } else {
                    // Multiple photos
                    for (let index = 0; index < photos.length; index++) {
                        const photo = photos[index];
                        setTimeout(async () => {
                            const response = await fetch(photo.dataUrl);
                            const blob = await response.blob();
                            const url = URL.createObjectURL(blob);
                            const link = document.createElement('a');
                            link.href = url;
                            link.download = `photobooth_${index + 1}_${Date.now()}.jpg`;
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                            URL.revokeObjectURL(url);
                        }, index * 500);
                    }
                }
            }
        } catch (error) {
            console.error('Download failed:', error);
            // Fallback - open in new tab
            if (photos.length === 1) {
                window.open(photos[0].dataUrl, '_blank');
            }
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
                <div className="text-white text-xl">กำลังโหลด...</div>
            </div>
        );
    }

    if (photos.length === 0) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
                <div className="text-center text-white">
                    <h1 className="text-3xl font-bold mb-4">ไม่พบรูปภาพ</h1>
                    <p className="text-slate-400">ลิงก์อาจหมดอายุหรือไม่ถูกต้อง</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-4 md:p-8">
            <div className="max-w-2xl mx-auto">
                <h1 className="text-3xl md:text-4xl font-bold text-white text-center mb-8">
                    รูปถ่ายของคุณ 📸
                </h1>

                {/* Photo Grid */}
                <div className="space-y-4 mb-8">
                    {photos.map((photo, index) => (
                        <div
                            key={photo.id}
                            className="bg-white rounded-2xl overflow-hidden shadow-2xl animate-in fade-in slide-in-from-bottom duration-500"
                            style={{ animationDelay: `${index * 100}ms` }}
                        >
                            <img
                                src={photo.dataUrl}
                                alt={`Photo ${index + 1}`}
                                className="w-full h-auto"
                            />
                        </div>
                    ))}
                </div>

                {/* Download Button or Instruction */}
                {/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ? (
                    <div className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-bold py-6 px-8 rounded-xl shadow-lg text-center">
                        <p className="text-xl mb-2">📱 วิธีบันทึกรูป</p>
                        <p className="text-sm opacity-90">กดค้างที่รูปภาพด้านบน</p>
                        <p className="text-sm opacity-90">แล้วเลือก "บันทึกรูปภาพ"</p>
                    </div>
                ) : (
                    <>
                        <button
                            onClick={downloadAll}
                            className="w-full bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white font-bold py-4 px-8 rounded-xl shadow-lg transform transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-3 text-lg"
                        >
                            <Download size={24} />
                            {photos.length === 1 ? 'ดาวน์โหลดรูปภาพ' : 'ดาวน์โหลดทั้งหมด'}
                        </button>

                        <p className="text-center text-slate-400 text-sm mt-4">
                            รูปภาพจะถูกดาวน์โหลดลงเครื่องของคุณ
                        </p>
                    </>
                )}
            </div>
        </div>
    );
};

export default DownloadPage;
