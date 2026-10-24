import { NextResponse } from 'next/server';

/**
 * Hardened Route: Closes all direct Better Auth endpoint vectors.
 * All authentication and session operations must strictly traverse
 * our hardened, rate-limited, and authoritative routes (/api/auth/login, /api/auth/logout, /api/auth/me).
 */
export async function GET() {
  return NextResponse.json({ success: false, error: 'Endpoint tidak ditemukan.' }, { status: 404 });
}

export async function POST() {
  return NextResponse.json({ success: false, error: 'Endpoint tidak ditemukan.' }, { status: 404 });
}

export async function PUT() {
  return NextResponse.json({ success: false, error: 'Endpoint tidak ditemukan.' }, { status: 404 });
}

export async function DELETE() {
  return NextResponse.json({ success: false, error: 'Endpoint tidak ditemukan.' }, { status: 404 });
}
