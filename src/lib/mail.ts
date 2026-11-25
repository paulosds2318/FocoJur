import nodemailer, { type Transporter } from 'nodemailer';

let transport: Transporter | null = null;

function getTransport() {
  transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'localhost',
    port: Number(process.env.SMTP_PORT ?? 1025),
    secure: false,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return transport;
}

/** Só para alertas (prazos, custo de IA, falha de conector); o acesso ao sistema não depende de e-mail. */
export async function sendMail(to: string | string[], subject: string, html: string, text?: string) {
  await getTransport().sendMail({
    from: process.env.SMTP_FROM ?? 'FocoJur <nao-responda@exemplo.com.br>',
    to,
    subject,
    html,
    text: text ?? html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
  });
}

export const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
