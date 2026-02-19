import { NextRequest, NextResponse } from 'next/server';
import { readdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { AuthRequiredError, TenantAccessError, resolveTenantContext } from '@/lib/tenant-context';

export async function GET(request: NextRequest) {
  try {
    const context = await resolveTenantContext(request);
    const { searchParams } = new URL(request.url);
    const adName = searchParams.get('adName');

    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    
    if (!existsSync(uploadsDir)) {
      return NextResponse.json({
        success: true,
        materials: [],
        message: 'No materials uploaded yet'
      });
    }

    const files = await readdir(uploadsDir);
    const materials = [];

    for (const filename of files) {
      const filePath = path.join(uploadsDir, filename);
      const stats = await stat(filePath);
      
      if (stats.isFile()) {
        if (!filename.startsWith(`${context.tenantId}_`)) {
          continue;
        }

        const fileExtension = path.extname(filename).toLowerCase();
        const isImage = ['.jpg', '.jpeg', '.png', '.gif'].includes(fileExtension);
        const isVideo = ['.mp4', '.mov', '.avi'].includes(fileExtension);
        
        // Filter by adName if provided
        if (adName && !filename.toLowerCase().includes(adName.toLowerCase())) {
          continue;
        }

        // Extract original name from accountName_originalName format
        let originalName = filename;
        if (filename.includes('_')) {
          // Format: "tenantId_accountName_originalName.ext" or "..._counter.ext"
          const parts = filename.split('_');
          if (parts.length >= 3) {
            // Remove tenantId + account name prefixes.
            const nameParts = parts.slice(2);
            // If last part is a number (counter), remove it
            if (nameParts.length > 1 && !isNaN(parseInt(nameParts[nameParts.length - 1]))) {
              nameParts.pop();
            }
            originalName = nameParts.join('_') + path.extname(filename);
          }
        }
        
        // Create full URL for accessing the file
        const baseUrl = process.env.NGROK_URL || 'http://localhost:3000';
        const relativeUrl = `/uploads/${filename}`;
        const fileUrl = `${baseUrl}${relativeUrl}`;

        materials.push({
          id: filename,
          filename: filename,
          originalName: originalName,
          fileUrl: fileUrl,
          localPath: relativeUrl,
          fullPath: filePath,
          category: isImage ? 'image' : isVideo ? 'video' : 'other',
          size: stats.size,
          uploadedAt: stats.birthtime.toISOString(),
          modifiedAt: stats.mtime.toISOString()
        });
      }
    }

    // Sort by upload date (newest first)
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
