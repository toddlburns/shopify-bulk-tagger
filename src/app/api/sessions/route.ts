import { prisma } from '@/lib/db';
import { NextResponse } from 'next/server';

// GET all sessions
export async function GET() {
  const sessions = await prisma.session.findMany({
    orderBy: { updatedAt: 'desc' },
    include: {
      _count: {
        select: { rules: true, answers: true }
      }
    }
  });
  return NextResponse.json(sessions);
}

// POST create new session
export async function POST(request: Request) {
  const body = await request.json();
  const session = await prisma.session.create({
    data: {
      name: body.name || 'New Session'
    }
  });
  return NextResponse.json(session);
}
