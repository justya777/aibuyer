'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import type { AdAccountHierarchyAd } from '@/lib/shared-types';

type MaterialCategory = 'image' | 'video' | 'other';

interface MaterialItem {
  id: string;
  filename: string;
  originalName: string;
  fileUrl: string;
  category: MaterialCategory;
  size: number;
  uploadedAt: string;
}

interface MaterialsTabProps {
  tenantId: string;
  adAccountName: string;
  adAccountId: string;
  ads: AdAccountHierarchyAd[];
}

const ACCEPTED_TYPES = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/gif': ['.gif'],
  'video/mp4': ['.mp4'],
  'video/mov': ['.mov'],
};

export default function MaterialsTab({ tenantId, adAccountName, adAccountId, ads }: MaterialsTabProps) {
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'image' | 'video'>('all');
  const [preferredIds, setPreferredIds] = useState<string[]>([]);

  const storageKey = `preferred-materials:${tenantId}:${adAccountId}`;

  const loadMaterials = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/get-materials?adName=${encodeURIComponent(adAccountId)}`, {
        headers: { 'x-tenant-id': tenantId },
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to load materials.');
      }
      setMaterials(Array.isArray(payload.materials) ? payload.materials : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load materials.');
    } finally {
      setIsLoading(false);
    }
  }, [adAccountId, tenantId]);

  useEffect(() => {
    void loadMaterials();
  }, [loadMaterials]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        setPreferredIds(parsed.map((entry) => String(entry)));
      }
    } catch {
      setPreferredIds([]);
    }
  }, [storageKey]);

  const savePreferred = (next: string[]) => {
    setPreferredIds(next);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Keep UX resilient if storage is blocked.
    }
  };

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;
      setIsUploading(true);
      setError(null);
      try {
        for (const file of acceptedFiles) {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('adName', adAccountId);
          formData.append('type', file.type.startsWith('image/') ? 'image' : 'video');
          const response = await fetch('/api/upload-materials', {
            method: 'POST',
            headers: { 'x-tenant-id': tenantId },
            body: formData,
          });
          const payload = await response.json();
          if (!response.ok || !payload.success) {
            throw new Error(payload.error || `Failed to upload ${file.name}`);
          }
        }
        await loadMaterials();
      } catch (uploadError) {
        setError(uploadError instanceof Error ? uploadError.message : 'Upload failed.');
      } finally {
        setIsUploading(false);
      }
    },
    [adAccountId, loadMaterials, tenantId]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 5,
    accept: ACCEPTED_TYPES,
    disabled: isUploading,
  });

  const displayedMaterials = useMemo(() => {
    if (filter === 'all') return materials;
    return materials.filter((material) => material.category === filter);
  }, [materials, filter]);

  const adUsageByMaterialId = useMemo(() => {
    const usage = new Map<string, number>();
    for (const material of materials) {
      const count = ads.filter((ad) => {
        const creativeValues = [
          ad.creative.imageUrl || '',
          ad.creative.videoUrl || '',
          ad.creative.linkUrl || '',
          ad.creative.title || '',
          ad.creative.body || '',
        ].join(' ');
        return (
          creativeValues.includes(material.fileUrl) ||
          creativeValues.includes(material.filename) ||
          creativeValues.includes(material.originalName)
        );
      }).length;
      usage.set(material.id, count);
    }
    return usage;
  }, [ads, materials]);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-slate-900">Materials Library</h3>
          <p className="text-xs text-slate-600">
            Upload assets for <span className="font-medium">{adAccountName || adAccountId}</span>. AI command execution
            can use these automatically.
          </p>
        </div>

        <div
          {...getRootProps()}
          className={`cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
            isDragActive ? 'border-blue-400 bg-blue-50' : 'border-slate-300 hover:bg-slate-50'
          }`}
        >
          <input {...getInputProps()} />
          <p className="text-sm text-slate-700">
            {isUploading ? 'Uploading…' : isDragActive ? 'Drop files here' : 'Drag & drop materials or click to upload'}
          </p>
          <p className="mt-1 text-xs text-slate-500">JPG, PNG, GIF, MP4, MOV • up to 5 files</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <FilterButton label="All" selected={filter === 'all'} onClick={() => setFilter('all')} />
        <FilterButton label="Images" selected={filter === 'image'} onClick={() => setFilter('image')} />
        <FilterButton label="Videos" selected={filter === 'video'} onClick={() => setFilter('video')} />
      </div>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      {isLoading ? <p className="text-sm text-slate-600">Loading materials...</p> : null}

      {!isLoading && displayedMaterials.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-600">
          No materials yet. Upload your first image or video here.
        </p>
      ) : null}

      {!isLoading && displayedMaterials.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {displayedMaterials.map((material) => {
            const isPreferred = preferredIds.includes(material.id);
            const adUsageCount = adUsageByMaterialId.get(material.id) || 0;
            return (
              <article key={material.id} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="mb-2 aspect-video overflow-hidden rounded-md bg-slate-100">
                  {material.category === 'image' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={material.fileUrl}
                      alt={material.originalName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <video src={material.fileUrl} className="h-full w-full object-cover" muted controls />
                  )}
                </div>
                <p className="truncate text-sm font-medium text-slate-900">{material.originalName}</p>
                <p className="mt-1 text-xs text-slate-500">
                  Used by {adUsageCount} {adUsageCount === 1 ? 'ad' : 'ads'}
                </p>
                <div className="mt-2 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() =>
                      savePreferred(
                        isPreferred
                          ? preferredIds.filter((entry) => entry !== material.id)
                          : [...preferredIds, material.id]
                      )
                    }
                    className={`rounded-md border px-2 py-1 text-xs ${
                      isPreferred
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                        : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {isPreferred ? 'Preferred' : 'Mark Preferred'}
                  </button>
                  <a
                    href={material.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-blue-700 hover:underline"
                  >
                    Open
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function FilterButton({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm ${
        selected ? 'bg-blue-600 text-white' : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
      }`}
    >
      {label}
    </button>
  );
}
