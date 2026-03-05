import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { AuthRequiredError, TenantAccessError, resolveTenantContext } from '@/lib/tenant-context';

const UPLOADS_DIR = path.resolve(process.cwd(), '..', 'uploads');

export async function POST(request: NextRequest) {
  try {
    const context = await resolveTenantContext(request);
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const materialType = formData.get('type') as string || 'image';
    const adName = formData.get('adName') as string || 'default';

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      );
    }

    const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
    const allowedVideoTypes = ['video/mp4', 'video/mov', 'video/avi'];
    const allAllowedTypes = [...allowedImageTypes, ...allowedVideoTypes];

    if (!allAllowedTypes.includes(file.type)) {
      return NextResponse.json(
        { 
          success: false, 
          error: `File type ${file.type} not supported. Allowed types: ${allAllowedTypes.join(', ')}` 
        },
        { status: 400 }
      );
    }

    if (!existsSync(UPLOADS_DIR)) {
      await mkdir(UPLOADS_DIR, { recursive: true });
    }

    const fileExtension = path.extname(file.name);
    const baseFilename = path.basename(file.name, fileExtension);
    let uniqueFilename = `${context.tenantId}_${adName}_${baseFilename}${fileExtension}`;
    let filePath = path.join(UPLOADS_DIR, uniqueFilename);
    
    let counter = 1;
    while (existsSync(filePath)) {
      uniqueFilename = `${context.tenantId}_${adName}_${baseFilename}_${counter}${fileExtension}`;
      filePath = path.join(UPLOADS_DIR, uniqueFilename);
      counter++;
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filePath, buffer);

    const isImage = allowedImageTypes.includes(file.type);
    const isVideo = allowedVideoTypes.includes(file.type);

    const materialInfo = {
      id: uuidv4(),
      filename: uniqueFilename,
      originalName: file.name,
      fileUrl: `/uploads/${uniqueFilename}`,
      filePath: filePath,
      localPath: `/uploads/${uniqueFilename}`,
      type: materialType,
      mimeType: file.type,
      size: file.size,
      category: isImage ? 'image' : isVideo ? 'video' : 'other',
      uploadedAt: new Date().toISOString(),
      adName: adName,
      tenantId: context.tenantId,
    };

    return NextResponse.json({
      success: true,
      material: materialInfo,
      message: `Successfully uploaded ${file.name}`
    });

  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 401 });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Upload failed' 
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    await resolveTenantContext(request);
    return NextResponse.json({
      success: true,
      materials: [],
      message: 'Use GET /api/get-materials for material listing'
    });

  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to list materials' },
      { status: 500 }
    );
  }
}
