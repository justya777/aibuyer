'use client';

import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';

interface MaterialUploadProps {
  onUploadSuccess?: (material: UploadedMaterial) => void;
  onUploadError?: (error: string) => void;
  adName?: string;
  maxFiles?: number;
  acceptedTypes?: string[];
}

interface UploadedMaterial {
  id: string;
  filename: string;
  originalName: string;
  fileUrl: string;
  type: string;
  mimeType: string;
  size: number;
  category: 'image' | 'video' | 'other';
  uploadedAt: string;
  adName: string;
}

export default function MaterialUpload({ 
  onUploadSuccess, 
  onUploadError,
  adName = 'default',
  maxFiles = 5,
  acceptedTypes = ['image/jpeg', 'image/png', 'image/gif', 'video/mp4', 'video/mov']
}: MaterialUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadedMaterials, setUploadedMaterials] = useState<UploadedMaterial[]>([]);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    setUploading(true);

    try {
      for (const file of acceptedFiles) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('adName', adName);
        formData.append('type', file.type.startsWith('image/') ? 'image' : 'video');

        const response = await fetch('/api/upload-materials', {
          method: 'POST',
          body: formData,
        });

        const result = await response.json();

        if (result.success) {
          const newMaterial = result.material;
          setUploadedMaterials(prev => [...prev, newMaterial]);
          onUploadSuccess?.(newMaterial);
          console.log(`✅ Uploaded: ${file.name}`);
        } else {
          console.error(`❌ Upload failed for ${file.name}:`, result.error);
          onUploadError?.(result.error);
        }
      }
    } catch (error) {
      console.error('❌ Upload error:', error);
      onUploadError?.(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [adName, onUploadSuccess, onUploadError]);

  const { getRootProps, getInputProps, isDragActive, acceptedFiles } = useDropzone({
    onDrop,
    maxFiles,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/gif': ['.gif'],
      'video/mp4': ['.mp4'],
      'video/mov': ['.mov']
    },
    disabled: uploading
  });

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          Upload Ad Materials
        </h3>
        <p className="text-sm text-gray-600">
          Upload images and videos for your Facebook ads. Supported formats: JPG, PNG, GIF, MP4, MOV
        </p>
      </div>

      {/* Drop Zone */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          isDragActive
            ? 'border-blue-400 bg-blue-50'
            : uploading
            ? 'border-gray-300 bg-gray-50 cursor-not-allowed'
            : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
        }`}
      >
        <input {...getInputProps()} />
        <div className="space-y-2">
          <div className="flex justify-center">
            {uploading ? (
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            ) : (
              <svg className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            )}
          </div>
          <div>
            {uploading ? (
              <p className="text-sm text-gray-500">Uploading materials...</p>
            ) : isDragActive ? (
              <p className="text-sm text-blue-600">Drop the files here...</p>
            ) : (
              <>
                <p className="text-sm font-medium text-gray-900">
                  Drag & drop files here, or click to select
                </p>
                <p className="text-xs text-gray-500">
                  Max {maxFiles} files, up to 10MB each
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Uploaded Materials List */}
      {uploadedMaterials.length > 0 && (
        <div className="mt-6">
          <h4 className="text-sm font-medium text-gray-900 mb-3">Uploaded Materials</h4>
          <div className="space-y-2">
            {uploadedMaterials.map((material) => (
              <div key={material.id} className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className="flex-shrink-0">
                    {material.category === 'image' ? (
                      <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    ) : (
                      <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{material.originalName}</p>
                    <p className="text-xs text-gray-500">
                      {material.category.toUpperCase()} • {formatFileSize(material.size)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <a
                    href={material.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    Preview
                  </a>
                  <span className="text-xs text-green-600">✓ Uploaded</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Usage Instructions */}
      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h4 className="text-sm font-medium text-blue-900 mb-2">💡 How to Use</h4>
        <ul className="text-xs text-blue-800 space-y-1">
          <li>• Upload images (1200x628px recommended for Facebook ads)</li>
          <li>• Upload videos (MP4 format, under 4GB)</li>
          <li>• Materials will be automatically used in your ad creatives</li>
          <li>• You can reference uploaded files in your ad commands</li>
        </ul>
      </div>
    </div>
  );
}
