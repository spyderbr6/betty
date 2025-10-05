/**
 * Image Upload Service
 * Handles profile picture uploads to AWS S3 storage
 */

import { uploadData, getUrl, remove } from 'aws-amplify/storage';
import * as ImagePicker from 'expo-image-picker';

export interface ImageUploadResult {
  success: boolean;
  url?: string;
  error?: string;
}

export interface ImagePickerResult {
  success: boolean;
  uri?: string;
  error?: string;
}

/**
 * Request camera and media library permissions
 */
export const requestImagePermissions = async (): Promise<boolean> => {
  try {
    // Request camera permissions
    const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();

    // Request media library permissions
    const mediaPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    return cameraPermission.status === 'granted' && mediaPermission.status === 'granted';
  } catch (error) {
    console.error('Error requesting image permissions:', error);
    return false;
  }
};

/**
 * Show image picker with camera and library options
 */
export const pickProfileImage = async (): Promise<ImagePickerResult> => {
  try {
    // Check permissions first
    const hasPermissions = await requestImagePermissions();
    if (!hasPermissions) {
      return {
        success: false,
        error: 'Camera and photo library permissions are required to upload a profile picture.'
      };
    }

    // Show action sheet to choose camera or library
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1], // Square aspect ratio for profile pictures
      quality: 0.8, // Good quality but compressed
      base64: false,
    });

    if (result.canceled) {
      return { success: false, error: 'Image selection cancelled' };
    }

    const selectedImage = result.assets[0];
    return {
      success: true,
      uri: selectedImage.uri
    };
  } catch (error) {
    console.error('Error picking image:', error);
    return {
      success: false,
      error: 'Failed to select image. Please try again.'
    };
  }
};

/**
 * Upload profile picture to S3 and return the S3 key (NOT the signed URL)
 * The key will be stored in the database and used to generate signed URLs on-demand
 */
export const uploadProfilePicture = async (
  imageUri: string,
  userId: string
): Promise<ImageUploadResult> => {
  try {
    // Generate unique filename with timestamp
    const timestamp = Date.now();
    const filename = `profile-pictures/${userId}/avatar-${timestamp}.jpg`;

    // Convert image URI to blob for upload
    const response = await fetch(imageUri);
    const blob = await response.blob();

    // Upload to S3
    const uploadResult = await uploadData({
      key: filename,
      data: blob,
      options: {
        contentType: 'image/jpeg',
      }
    }).result;

    // Return the S3 key (NOT the signed URL)
    // We'll generate signed URLs on-demand when displaying images
    return {
      success: true,
      url: uploadResult.key // This is the S3 key, NOT a signed URL
    };
  } catch (error) {
    console.error('Error uploading profile picture:', error);
    return {
      success: false,
      error: 'Failed to upload image. Please check your internet connection and try again.'
    };
  }
};

/**
 * Delete old profile picture from S3
 */
export const deleteProfilePicture = async (s3Key: string): Promise<boolean> => {
  try {
    if (!s3Key) return false;

    await remove({
      key: s3Key
    });

    return true;
  } catch (error) {
    console.error('Error deleting old profile picture:', error);
    // Don't fail the operation if old image can't be deleted
    return false;
  }
};

// In-memory cache for signed URLs (valid for entire session since they expire in 1 year)
const signedUrlCache = new Map<string, string>();

/**
 * Get a signed URL for a profile picture from S3 key
 * Uses in-memory caching to avoid regenerating URLs during the same session
 */
export const getProfilePictureUrl = async (s3Key: string): Promise<string | null> => {
  try {
    if (!s3Key) return null;

    // Check cache first
    if (signedUrlCache.has(s3Key)) {
      return signedUrlCache.get(s3Key)!;
    }

    // Generate a fresh signed URL from the S3 key
    const urlResult = await getUrl({
      key: s3Key,
      options: {
        expiresIn: 31536000, // 1 year expiry
      }
    });

    const signedUrl = urlResult.url.toString();

    // Cache the signed URL for this session
    signedUrlCache.set(s3Key, signedUrl);

    return signedUrl;
  } catch (error) {
    console.error('Error getting profile picture URL:', error);
    return null;
  }
};

/**
 * Clear the signed URL cache (useful for testing or memory management)
 */
export const clearProfilePictureCache = (): void => {
  signedUrlCache.clear();
};

/**
 * Complete profile picture update workflow
 * 1. Pick image from gallery/camera
 * 2. Upload to S3
 * 3. Delete old image (if exists)
 * 4. Return new S3 key
 */
export const updateProfilePicture = async (
  userId: string,
  currentS3Key?: string
): Promise<ImageUploadResult> => {
  try {
    // Step 1: Pick new image
    const pickResult = await pickProfileImage();
    if (!pickResult.success || !pickResult.uri) {
      return {
        success: false,
        error: pickResult.error || 'No image selected'
      };
    }

    // Step 2: Upload new image
    const uploadResult = await uploadProfilePicture(pickResult.uri, userId);
    if (!uploadResult.success || !uploadResult.url) {
      return {
        success: false,
        error: uploadResult.error || 'Upload failed'
      };
    }

    // Step 3: Delete old image and clear from cache (if exists)
    if (currentS3Key) {
      await deleteProfilePicture(currentS3Key);
      // Remove old URL from cache
      signedUrlCache.delete(currentS3Key);
    }

    return {
      success: true,
      url: uploadResult.url // This is the S3 key
    };
  } catch (error) {
    console.error('Error in profile picture update workflow:', error);
    return {
      success: false,
      error: 'Failed to update profile picture. Please try again.'
    };
  }
};