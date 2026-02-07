import { prisma } from '@/lib/db';
import { NextResponse } from 'next/server';

// GET all products from the global catalog
export async function GET() {
  const products = await prisma.catalogProduct.findMany({
    orderBy: { vendor: 'asc' }
  });
  return NextResponse.json(products);
}

// POST - bulk upsert products to the catalog
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

  // Upsert products in chunks
  const chunkSize = 500;
  let upserted = 0;

  for (let i = 0; i < products.length; i += chunkSize) {
    const chunk = products.slice(i, i + chunkSize);

    // Use transactions for each chunk
    await prisma.$transaction(
      chunk.map(p =>
        prisma.catalogProduct.upsert({
          where: { handle: p.handle },
          update: {
            title: p.title,
            vendor: p.vendor,
            existingGenre: p.existingGenre || null,
            existingSubgenre: p.existingSubgenre || null,
            existingDecade: p.existingDecade || null,
          },
          create: {
            handle: p.handle,
            title: p.title,
            vendor: p.vendor,
            existingGenre: p.existingGenre || null,
            existingSubgenre: p.existingSubgenre || null,
            existingDecade: p.existingDecade || null,
          }
        })
      )
    );
    upserted += chunk.length;
  }

  const total = await prisma.catalogProduct.count();

  return NextResponse.json({
    success: true,
    upserted,
    total
  });
}

// DELETE - clear the entire catalog
export async function DELETE() {
  await prisma.catalogProduct.deleteMany();
  return NextResponse.json({ success: true });
}
