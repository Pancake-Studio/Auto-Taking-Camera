import { uploadFile, UploadcareSimpleAuthSchema } from '@uploadcare/upload-client';

const PUBLIC_KEY = import.meta.env.VITE_UPLOADCARE_PUBLIC_KEY || '69f401d5e57903db334d';
const SECRET_KEY = '6930f3453cb605fc06a3'; // Only for server-side deletion
const CUSTOM_CDN_DOMAIN = import.meta.env.VITE_UPLOADCARE_CDN_DOMAIN || 'https://101bd2xbfp.ucarecd.net/';

export interface UploadResult {
    fileUrl: string;
    uuid: string;
}

/**
 * Convert CDN URL to custom domain if needed
 */
const normalizeUrl = (url: string): string => {
    if (!url) return '';
    // If URL is just a UUID, append custom domain
    if (!url.includes('://')) {
        return `${CUSTOM_CDN_DOMAIN}${url}/`;
    }
    // Replace ucarecdn.com with custom domain if it's a standard Uploadcare URL
    if (url.includes('ucarecdn.com')) {
        const uuid = url.match(/ucarecdn\.com\/([a-f0-9-]+)/)?.[1];
        if (uuid) {
            return `${CUSTOM_CDN_DOMAIN}${uuid}/`;
        }
    }
    // Already using custom domain or valid URL
    return url;
};

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
        fileUrl: normalizeUrl(result.cdnUrl || result.uuid || ''),
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
