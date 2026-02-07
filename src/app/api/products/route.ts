import { prisma } from '@/lib/db';
import { NextResponse } from 'next/server';

// GET all products from the global catalog
export async function GET() {
  const products = await prisma.catalogProduct.findMany({
    orderBy: { vendor: 'asc' }
  });
  return NextResponse.json(products);
}

// POST - append products to catalog (call DELETE first to clear)
export async function POST(request: Request) {
  const body = await request.json();

  if (!body.products || !Array.isArray(body.products)) {
    return NextResponse.json({ error: 'Products array required' }, { status: 400 });
  }

  const products = body.products as Array<{
    handle: string;
    title: string;
    vendor: string;
    existingGenre?: string;
    existingSubgenre?: string;
    existingDecade?: string;
  }>;

  // Just insert this batch (skipDuplicates handles conflicts)
  await prisma.catalogProduct.createMany({
    data: products.map(p => ({
      handle: p.handle,
      title: p.title,
      vendor: p.vendor,
      existingGenre: p.existingGenre || null,
      existingSubgenre: p.existingSubgenre || null,
      existingDecade: p.existingDecade || null,
    })),
    skipDuplicates: true,
  });

  return NextResponse.json({
    success: true,
    inserted: products.length
  });
}

// DELETE - clear the entire catalog
export async function DELETE() {
  await prisma.catalogProduct.deleteMany();
  return NextResponse.json({ success: true });
}
