import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { AuthRequiredError, TenantAccessError, resolveTenantContext } from '@/lib/tenant-context';

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

    // Validate file type
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

    // Create uploads directory if it doesn't exist
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true });
    }

    // Generate filename with accountName prefix (no UUID)
    const fileExtension = path.extname(file.name);
    const baseFilename = path.basename(file.name, fileExtension);
    let uniqueFilename = `${context.tenantId}_${adName}_${baseFilename}${fileExtension}`;
    let filePath = path.join(uploadsDir, uniqueFilename);
    
    // Handle file name conflicts by adding counter
    let counter = 1;
    while (existsSync(filePath)) {
      uniqueFilename = `${context.tenantId}_${adName}_${baseFilename}_${counter}${fileExtension}`;
      filePath = path.join(uploadsDir, uniqueFilename);
      counter++;
    }

    // Convert file to buffer and save
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filePath, buffer);

    // Create the URL for accessing the file
    const baseUrl = process.env.NGROK_URL || 'http://localhost:3000';
    const relativeUrl = `/uploads/${uniqueFilename}`;
    const fileUrl = `${baseUrl}${relativeUrl}`;

    // Determine material category
    const isImage = allowedImageTypes.includes(file.type);
    const isVideo = allowedVideoTypes.includes(file.type);

    const materialInfo = {
      id: uuidv4(),
      filename: uniqueFilename,
      originalName: file.name,
      fileUrl: fileUrl,
      localPath: relativeUrl,
      fullPath: filePath,
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
    // Return list of uploaded materials
    const { searchParams } = new URL(request.url);
    const adName = searchParams.get('adName');

    // For now, return empty array - could implement file listing later
    return NextResponse.json({
      success: true,
      materials: [],
      message: 'Materials listing endpoint - implement file scanning if needed'
    });

  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to list materials' },
      { status: 500 }
    );
  }
}
