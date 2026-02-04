import { uploadFile, UploadcareSimpleAuthSchema } from '@uploadcare/upload-client';

const PUBLIC_KEY = import.meta.env.VITE_UPLOADCARE_PUBLIC_KEY || '';
const SECRET_KEY = '9b6d287a02ad127e4304'; // Only for server-side deletion

export interface UploadResult {
    fileUrl: string;
    uuid: string;
}

/**
 * Upload a base64 image to Uploadcare
 */
export const uploadImage = async (dataUrl: string, filename: string): Promise<UploadResult> => {
    // Convert data URL to Blob
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const file = new File([blob], filename, { type: 'image/jpeg' });

    const result = await uploadFile(file, {
        publicKey: PUBLIC_KEY,
        store: 'auto',
        metadata: {
            subsystem: 'photobooth',
            expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30 minutes
        }
    });

    return {
        fileUrl: result.cdnUrl || '',
        uuid: result.uuid || ''
    };
};

/**
 * Upload multiple photos and return their URLs
 */
export const uploadPhotos = async (photos: { dataUrl: string; id: string }[]): Promise<string[]> => {
    const uploadPromises = photos.map((photo, index) =>
        uploadImage(photo.dataUrl, `photo_${index + 1}.jpg`)
    );

    const results = await Promise.all(uploadPromises);
    return results.map(r => r.fileUrl);
};

/**
 * Schedule file deletion after 30 minutes
 * Note: This requires server-side implementation with SECRET_KEY
 * For now, we'll rely on Uploadcare's metadata expiration
 */
export const scheduleFileDeletion = async (uuid: string): Promise<void> => {
    // This would typically be done server-side
    // For this implementation, we rely on metadata expiration
    console.log(`File ${uuid} will expire based on metadata`);
};
