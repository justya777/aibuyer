import { NextRequest, NextResponse } from 'next/server';
import { readdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { AuthRequiredError, TenantAccessError, resolveTenantContext } from '@/lib/tenant-context';

const UPLOADS_DIR = path.resolve(process.cwd(), '..', 'uploads');

export async function GET(request: NextRequest) {
  try {
    const context = await resolveTenantContext(request);
    const { searchParams } = new URL(request.url);
    const adName = searchParams.get('adName');

    if (!existsSync(UPLOADS_DIR)) {
      return NextResponse.json({
        success: true,
        materials: [],
        message: 'No materials uploaded yet'
      });
    }

    const files = await readdir(UPLOADS_DIR);
    const materials = [];

    for (const filename of files) {
      const filePath = path.join(UPLOADS_DIR, filename);
      const stats = await stat(filePath);
      
      if (stats.isFile()) {
        if (!filename.startsWith(`${context.tenantId}_`)) {
          continue;
        }

        const fileExtension = path.extname(filename).toLowerCase();
        const isImage = ['.jpg', '.jpeg', '.png', '.gif'].includes(fileExtension);
        const isVideo = ['.mp4', '.mov', '.avi'].includes(fileExtension);
        
        if (adName && !filename.toLowerCase().includes(adName.toLowerCase())) {
          continue;
        }

        let originalName = filename;
        if (filename.includes('_')) {
          const parts = filename.split('_');
          if (parts.length >= 3) {
            const nameParts = parts.slice(2);
            if (nameParts.length > 1 && !isNaN(parseInt(nameParts[nameParts.length - 1]))) {
              nameParts.pop();
            }
            originalName = nameParts.join('_') + path.extname(filename);
          }
        }

        materials.push({
          id: filename,
          filename: filename,
          originalName: originalName,
          fileUrl: `/uploads/${filename}`,
          filePath: filePath,
          localPath: `/uploads/${filename}`,
          category: isImage ? 'image' : isVideo ? 'video' : 'other',
          size: stats.size,
          uploadedAt: stats.birthtime.toISOString(),
          modifiedAt: stats.mtime.toISOString()
        });
      }
    }

    materials.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());

    return NextResponse.json({
      success: true,
      materials,
      count: materials.length,
      message: `Found ${materials.length} materials`
    });

  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 401 });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    return NextResponse.json(
      { success: false, error: 'Failed to get materials' },
      { status: 500 }
    );
  }
}
