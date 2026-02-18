import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  // Helper function to find material URL by filename
  function findMaterialByFilename(materials: any[], filename: string): string | null {
    if (!materials || !filename) return null;
    
    // Try exact match first (originalName or full filename)
    let material = materials.find(m => 
      m.originalName === filename || 
      m.filename === filename
    );
    
    // Try originalName partial match (case insensitive)
    if (!material) {
      material = materials.find(m => 
        m.originalName.toLowerCase().includes(filename.toLowerCase())
      );
    }
    
    // Try filename partial match (case insensitive) - useful for new naming scheme
    if (!material) {
      material = materials.find(m => 
        m.filename.toLowerCase().includes(filename.toLowerCase())
      );
    }
    
    return material ? material.fileUrl : null;
  }

  // Helper function to parse material assignments from command text
  function parseMaterialAssignments(command: string, materials: any[]): any {
    const assignments: any = {};
    
    // Pattern to match: "for adset X use FILENAME" or "use FILENAME for campaign/adset Y"
    const patterns = [
      /(?:for\s+(?:adset|campaign)\s+(\d+)|(?:adset|campaign)\s+(\d+))\s+use\s+([\w\-_.]+\.(?:mp4|jpg|jpeg|png|gif|mov))/gi,
      /use\s+([\w\-_.]+\.(?:mp4|jpg|jpeg|png|gif|mov))\s+for\s+(?:(?:adset|campaign)\s+(\d+)|(?:first|second|third)\s+(campaign|adset))/gi,
      /(?:first|second|third)\s+(campaign|adset).*?([\w\-_.]+\.(?:mp4|jpg|jpeg|png|gif|mov))/gi
    ];
    
    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(command)) !== null) {
        const filename = match[1] || match[3] || match[2];
        const index = match[2] || match[1] || (match[0].includes('first') ? '1' : match[0].includes('second') ? '2' : match[0].includes('third') ? '3' : '1');
        const type = match[0].includes('campaign') ? 'campaign' : 'adset';
        
        if (filename) {
          const materialUrl = findMaterialByFilename(materials, filename);
          if (materialUrl) {
            assignments[`${type}_${index}`] = {
              filename,
              url: materialUrl,
              type
            };
          }
        }
      }
    });
    
    return assignments;
  }
  try {
    const { command, materials } = await request.json();
    
    const assignments = parseMaterialAssignments(command, materials);
    
    return NextResponse.json({
      success: true,
      assignments,
      message: `Found ${Object.keys(assignments).length} material assignments`
    });

  } catch (error) {
    console.error('❌ Material assignment error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to parse material assignments' },
      { status: 500 }
    );
  }
}
