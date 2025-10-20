import nodemailer from 'nodemailer';

function mask(s) {
    if (!s) return 'EMPTY';
    return s[0] + '***' + s.slice(-2);
}
function need(name) {
    const v = process.env[name];
    if (!v) throw new Error(`Missing env ${name}`);
    return v;
}

export function makeTransporter() {
    // Log nhẹ để chắc chắn biến đã nạp
    console.log('SMTP_HOST =', process.env.SMTP_HOST || 'EMPTY');
    console.log('SMTP_PORT =', process.env.SMTP_PORT || 'EMPTY');
    console.log('SMTP_USER =', mask(process.env.SMTP_USER));
    console.log('SMTP_PASS =', process.env.SMTP_PASS ? '***SET***' : 'EMPTY');

    const host = need('SMTP_HOST');
    const port = Number(need('SMTP_PORT'));
    const user = need('SMTP_USER');
    const pass = need('SMTP_PASS');

    return nodemailer.createTransport({
        host,
        port,
        secure: port === 465,   // 465 -> SSL, 587 -> STARTTLS
        auth: { user, pass },
    });
}

export function mailFromAddress() {
    const name = process.env.MAIL_FROM_NAME || 'Online Academy';
    const user = process.env.SMTP_USER || 'no-reply@example.com';
    return `"${name}" <${user}>`;
}
