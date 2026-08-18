import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const sessionCookie = req.cookies.get('auth_session')?.value;

  if (!sessionCookie) {
    return NextResponse.json(
      { success: false, authenticated: false, message: 'Tidak ada sesi terautentikasi' },
      { status: 401 }
    );
  }

  try {
    const user = JSON.parse(sessionCookie);
    return NextResponse.json({
      success: true,
      authenticated: true,
      user,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, authenticated: false, message: 'Sesi tidak valid' },
      { status: 400 }
    );
  }
}
