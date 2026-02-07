import { prisma } from '@/lib/db';
import { NextResponse } from 'next/server';

// GET all products from the global catalog
export async function GET() {
  const products = await prisma.catalogProduct.findMany({
    orderBy: { vendor: 'asc' }
  });
  return NextResponse.json(products);
}

// POST - bulk insert products to the catalog (replaces existing)
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

  // Clear existing catalog and bulk insert - MUCH faster than upsert
  await prisma.catalogProduct.deleteMany();

  // Bulk insert in chunks using createMany (very fast)
  const chunkSize = 1000;
  let inserted = 0;

  for (let i = 0; i < products.length; i += chunkSize) {
    const chunk = products.slice(i, i + chunkSize);

    await prisma.catalogProduct.createMany({
      data: chunk.map(p => ({
        handle: p.handle,
        title: p.title,
        vendor: p.vendor,
        existingGenre: p.existingGenre || null,
        existingSubgenre: p.existingSubgenre || null,
        existingDecade: p.existingDecade || null,
      })),
      skipDuplicates: true,
    });

    inserted += chunk.length;
  }

  const total = await prisma.catalogProduct.count();

  return NextResponse.json({
    success: true,
    inserted,
    total
  });
}

// DELETE - clear the entire catalog
export async function DELETE() {
  await prisma.catalogProduct.deleteMany();
  return NextResponse.json({ success: true });
}
