import { prisma } from '@/lib/db';
import { NextResponse } from 'next/server';

// GET single session with all data
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const session = await prisma.session.findUnique({
    where: { id },
    include: {
      rules: true,
      answers: true,
      certainties: true,
      products: true
    }
  });

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  return NextResponse.json(session);
}

// PUT update session (save progress)
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  // Update session timestamp
  await prisma.session.update({
    where: { id },
    data: { updatedAt: new Date() }
  });

  // If products provided, save them (only on first load)
  if (body.products && Array.isArray(body.products) && body.products.length > 0) {
    // Check if products already exist
    const existingCount = await prisma.product.count({ where: { sessionId: id } });

    if (existingCount === 0) {
      // Batch insert products in chunks to avoid timeout
      const chunkSize = 500;
      for (let i = 0; i < body.products.length; i += chunkSize) {
        const chunk = body.products.slice(i, i + chunkSize);
        await prisma.product.createMany({
          data: chunk.map((p: { handle: string; title: string; vendor: string; existingGenre?: string; existingSubgenre?: string; existingDecade?: string }) => ({
            sessionId: id,
            handle: p.handle,
            title: p.title,
            vendor: p.vendor,
            existingGenre: p.existingGenre || null,
            existingSubgenre: p.existingSubgenre || null,
            existingDecade: p.existingDecade || null
          }))
        });
      }
    }
  }

  // If rules provided, upsert them
  if (body.rules && Array.isArray(body.rules)) {
    await prisma.rule.deleteMany({ where: { sessionId: id } });

    if (body.rules.length > 0) {
      await prisma.rule.createMany({
        data: body.rules.map((r: { type: string; vendor: string; tagType: string; value: string; certaintyPct: number; reason?: string }) => ({
          sessionId: id,
          type: r.type,
          vendor: r.vendor,
          tagType: r.tagType,
          value: r.value,
          certaintyPct: r.certaintyPct,
          reason: r.reason || null
        }))
      });
    }
  }

  // If answers provided, upsert them
  if (body.answers && Array.isArray(body.answers)) {
    await prisma.answer.deleteMany({ where: { sessionId: id } });

    if (body.answers.length > 0) {
      await prisma.answer.createMany({
        data: body.answers.map((a: { questionId: string; questionText: string; answer: string }) => ({
          sessionId: id,
          questionId: a.questionId,
          questionText: a.questionText,
          answer: a.answer
        }))
      });
    }
  }

  // If certainties provided, upsert them
  if (body.certainties && Array.isArray(body.certainties)) {
    await prisma.certainty.deleteMany({ where: { sessionId: id } });

    if (body.certainties.length > 0) {
      // Batch insert certainties
      const chunkSize = 500;
      for (let i = 0; i < body.certainties.length; i += chunkSize) {
        const chunk = body.certainties.slice(i, i + chunkSize);
        await prisma.certainty.createMany({
          data: chunk.map((c: { handle: string; tagType: string; value: string; pct: number; source: string }) => ({
            sessionId: id,
            handle: c.handle,
            tagType: c.tagType,
            value: c.value,
            pct: c.pct,
            source: c.source
          }))
        });
      }
    }
  }

  return NextResponse.json({ success: true });
}

// DELETE session
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  await prisma.session.delete({
    where: { id }
  });

  return NextResponse.json({ success: true });
}
