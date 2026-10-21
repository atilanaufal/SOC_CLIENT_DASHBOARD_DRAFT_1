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
            ? 'Your session has expired because another login was detected.'
            : 'Invalid or expired session. Please log in again.',
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
        { success: false, error: 'Invalid request payload.' },
        { status: 400 }
      );
    }

    const { currentPassword, newPassword, confirmPassword, claimedUsername } = body || {};
    
    // Check for cross-tab session mismatch to prevent updating password for wrong account
    if (
      claimedUsername &&
      typeof claimedUsername === 'string' &&
      claimedUsername.toLowerCase().trim() !== tenant.username.toLowerCase().trim()
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'Session conflict: Account has been switched in another browser tab. Please reload the page.',
        },
        { status: 409 }
      );
    }

    if (
      typeof currentPassword !== 'string' ||
      typeof newPassword !== 'string' ||
      typeof confirmPassword !== 'string'
    ) {
      return NextResponse.json(
        { success: false, error: 'Invalid password data.' },
        { status: 400 }
      );
    }

    if (!currentPassword || !newPassword || !confirmPassword) {
      return NextResponse.json(
        { success: false, error: 'All password fields are required.' },
        { status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { success: false, error: 'New password must be at least 6 characters.' },
        { status: 400 }
      );
    }

    if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword)) {
      return NextResponse.json(
        { success: false, error: 'New password must contain both uppercase (A-Z) and lowercase (a-z) letters.' },
        { status: 400 }
      );
    }

    if (newPassword.length > 128) {
      return NextResponse.json(
        { success: false, error: 'New password exceeds maximum length (128 characters).' },
        { status: 400 }
      );
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { success: false, error: 'Password confirmation does not match.' },
        { status: 400 }
      );
    }

    if (newPassword === currentPassword) {
      return NextResponse.json(
        { success: false, error: 'New password cannot be the same as current password.' },
        { status: 400 }
      );
    }

    // 3. Verify current password against database
    const verifyResult = await verifyUserCredentials(tenant.username, currentPassword);
    if (!verifyResult.success || !verifyResult.user) {
      return NextResponse.json(
        { success: false, error: 'Incorrect current password.' },
        { status: 400 }
      );
    }

    // 4. Update password in MySQL
    const updateResult = await updateUserPassword(tenant.userId, newPassword);
    if (!updateResult.success) {
      return NextResponse.json(
        { success: false, error: updateResult.error || 'Failed to update password.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Password updated successfully. Please use your new password for future logins.',
    });
  } catch (err: any) {
    console.error('[Reset Password] Unexpected error:', err);
    return NextResponse.json(
      { success: false, error: 'An unexpected system error occurred while updating password.' },
      { status: 500 }
    );
  }
}
