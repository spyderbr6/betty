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
 * Upload profile picture to S3 and return the public URL
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

    // Get the public URL
    const urlResult = await getUrl({
      key: uploadResult.key,
      options: {
        expiresIn: 31536000, // 1 year expiry for profile pictures
      }
    });

    return {
      success: true,
      url: urlResult.url.toString()
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
export const deleteProfilePicture = async (profilePictureUrl: string): Promise<boolean> => {
  try {
    // Extract the S3 key from the URL
    const url = new URL(profilePictureUrl);
    const key = url.pathname.substring(1); // Remove leading slash

    await remove({
      key
    });

    return true;
  } catch (error) {
    console.error('Error deleting old profile picture:', error);
    // Don't fail the operation if old image can't be deleted
    return false;
  }
};

/**
 * Complete profile picture update workflow
 * 1. Pick image from gallery/camera
 * 2. Upload to S3
 * 3. Delete old image (if exists)
 * 4. Return new URL
 */
export const updateProfilePicture = async (
  userId: string,
  currentProfilePictureUrl?: string
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

    // Step 3: Delete old image (if exists)
    if (currentProfilePictureUrl) {
      await deleteProfilePicture(currentProfilePictureUrl);
    }

    return {
      success: true,
      url: uploadResult.url
    };
  } catch (error) {
    console.error('Error in profile picture update workflow:', error);
    return {
      success: false,
      error: 'Failed to update profile picture. Please try again.'
    };
  }
};