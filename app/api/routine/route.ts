import { NextResponse } from 'next/server';
import routine from '@/data/routine.json';

export async function GET() {
  return NextResponse.json(routine);
}
