import { NextRequest, NextResponse } from 'next/server';
import { getTenantContextWithStatus } from '@/lib/tenant-context';
import { verifyUserCredentials, updateUserPassword } from '@/lib/mysql';

export async function POST(req: NextRequest) {
  try {
    // 1. Authoritative server-side tenant authentication validation
    const { tenant, error } = await getTenantContextWithStatus(req);
    if (!tenant) {
      return NextResponse.json(
        {
          success: false,
          error: error === 'CONCURRENT_LOGIN'
            ? 'Sesi Anda telah berakhir karena akun digunakan di perangkat lain.'
            : 'Sesi tidak valid atau telah berakhir. Silakan login kembali.',
        },
        { status: 401 }
      );
    }

    // 2. Parse request body
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Format permintaan tidak valid.' },
        { status: 400 }
      );
    }

    const { currentPassword, newPassword, confirmPassword } = body || {};

    if (
      typeof currentPassword !== 'string' ||
      typeof newPassword !== 'string' ||
      typeof confirmPassword !== 'string'
    ) {
      return NextResponse.json(
        { success: false, error: 'Data password tidak valid.' },
        { status: 400 }
      );
    }

    if (!currentPassword || !newPassword || !confirmPassword) {
      return NextResponse.json(
        { success: false, error: 'Semua field password wajib diisi.' },
        { status: 400 }
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { success: false, error: 'Password baru minimal harus 8 karakter.' },
        { status: 400 }
      );
    }

    if (newPassword.length > 128) {
      return NextResponse.json(
        { success: false, error: 'Password baru melebihi panjang maksimal (128 karakter).' },
        { status: 400 }
      );
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { success: false, error: 'Konfirmasi password baru tidak cocok.' },
        { status: 400 }
      );
    }

    if (newPassword === currentPassword) {
      return NextResponse.json(
        { success: false, error: 'Password baru tidak boleh sama dengan password saat ini.' },
        { status: 400 }
      );
    }

    // 3. Verify current password against database
    const verifyResult = await verifyUserCredentials(tenant.username, currentPassword);
    if (!verifyResult.success || !verifyResult.user) {
      return NextResponse.json(
        { success: false, error: 'Password saat ini salah.' },
        { status: 400 }
      );
    }

    // 4. Update password in MySQL
    const updateResult = await updateUserPassword(tenant.userId, newPassword);
    if (!updateResult.success) {
      return NextResponse.json(
        { success: false, error: updateResult.error || 'Gagal mengubah password.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Password berhasil diperbarui. Silakan gunakan password baru pada sesi berikutnya.',
    });
  } catch (err: any) {
    console.error('[Reset Password] Unexpected error:', err);
    return NextResponse.json(
      { success: false, error: 'Terjadi kesalahan sistem saat memproses perubahan password.' },
      { status: 500 }
    );
  }
}
