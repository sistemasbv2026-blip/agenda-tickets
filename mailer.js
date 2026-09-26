const nodemailer = require('nodemailer');
const db = require('./db');

function getTransporter() {
  const config = db.getConfig();
  const smtp = config.smtp || {};

  const host = smtp.host || process.env.SMTP_HOST;
  const port = Number(smtp.port || process.env.SMTP_PORT || 587);
  const user = smtp.user || process.env.SMTP_USER;
  const pass = smtp.pass || process.env.SMTP_PASS;
  const secure = smtp.secure !== undefined ? smtp.secure : (port === 465);

  if (!host || !user || !pass) {
    return null; // Not configured yet
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    tls: {
      rejectUnauthorized: false // Allow corporate self-signed / TLS negotiation
    }
  });
}

function getSender() {
  const config = db.getConfig();
  const smtp = config.smtp || {};
  const fromName = smtp.fromName || process.env.SMTP_FROM_NAME || 'Departamento de Sistemas';
  const fromEmail = smtp.fromEmail || smtp.user || process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || 'no-reply@sistemas.com';
  return `"${fromName}" <${fromEmail}>`;
}

function getBaseUrl(req) {
  const config = db.getConfig();
  if (config.publicBaseUrl) return config.publicBaseUrl.replace(/\/$/, '');
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, '');
  if (req && req.headers && req.headers.host) {
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    return `${proto}://${req.headers.host}`;
  }
  return 'http://localhost:3000';
}

const mailer = {
  // Test SMTP connection and send a test email
  async sendTestEmail(targetEmail) {
    const transporter = getTransporter();
    if (!transporter) {
      throw new Error('La configuración SMTP está incompleta. Verifica servidor, usuario y contraseña.');
    }

    await transporter.verify();

    const info = await transporter.sendMail({
      from: getSender(),
      to: targetEmail,
      subject: '✅ Prueba de Configuración de Correo - Agenda de Tickets',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #2563eb; margin-top: 0;">¡Conexión Exitosa! 🎉</h2>
          <p>Este es un correo de prueba enviado desde tu <strong>Sistema de Agenda y Control de Tickets</strong>.</p>
          <p>A partir de ahora, cuando el equipo de sistemas responda o actualice un ticket, la persona que lo creó recibirá una notificación automática por correo.</p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
          <small style="color: #64748b;">Departamento de Sistemas &bull; Notificación Automática</small>
        </div>
      `
    });

    return info;
  },

  // Notify requester when admin writes a response
  async sendAdminReplyEmail(ticket, replyMessage, authorName = 'Sistemas', req = null) {
    const to = ticket.requester?.email;
    if (!to || !to.includes('@')) {
      return { skipped: true, reason: 'Sin correo electrónico registrado' };
    }

    const transporter = getTransporter();
    if (!transporter) {
      console.warn('⚠️ SMTP no configurado. Notificación por correo omitida.');
      return { skipped: true, reason: 'SMTP no configurado' };
    }

    const baseUrl = getBaseUrl(req);
    const trackingUrl = `${baseUrl}/ticket/${ticket.id}`;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; color: #1e293b; }
          .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px rgba(0,0,0,0.03); }
          .header { background: linear-gradient(135deg, #1e293b, #0f172a); color: #ffffff; padding: 24px; text-align: center; }
          .ticket-code { display: inline-block; background: #2563eb; color: #ffffff; padding: 4px 12px; border-radius: 6px; font-weight: bold; font-size: 14px; margin-bottom: 8px; }
          .body { padding: 24px; }
          .response-box { background: #f0fdf4; border-left: 4px solid #16a34a; padding: 16px; border-radius: 6px; margin: 18px 0; }
          .response-title { font-weight: bold; color: #166534; font-size: 14px; margin-bottom: 6px; }
          .response-text { font-size: 15px; line-height: 1.6; color: #1e293b; white-space: pre-wrap; }
          .btn { display: inline-block; background-color: #2563eb; color: #ffffff !important; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 15px; margin-top: 10px; }
          .footer { background: #f8fafc; padding: 16px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <span class="ticket-code">${ticket.id}</span>
            <h2 style="margin: 0; font-size: 20px;">Nueva Respuesta en tu Ticket</h2>
          </div>
          <div class="body">
            <p>Hola <strong>${ticket.requester.name}</strong>,</p>
            <p>El <strong>${authorName}</strong> ha respondido a tu reporte:</p>
            
            <div style="font-size: 14px; color: #64748b; margin-bottom: 8px;">
              <strong>Asunto:</strong> ${ticket.title}
            </div>

            <div class="response-box">
              <div class="response-title">💬 Respuesta de ${authorName}:</div>
              <div class="response-text">${replyMessage}</div>
            </div>

            <p style="font-size: 14px; color: #475569;">
              Puedes dar seguimiento en tiempo real o enviar un mensaje adicional desde el siguiente enlace:
            </p>

            <div style="text-align: center; margin: 24px 0;">
              <a href="${trackingUrl}" class="btn" target="_blank">🔍 Ver y Responder en Línea</a>
            </div>

            <p style="font-size: 12px; color: #94a3b8; text-align: center;">
              Enlace directo: <a href="${trackingUrl}" style="color: #2563eb;">${trackingUrl}</a>
            </p>
          </div>
          <div class="footer">
            Departamento de Sistemas &bull; Sistema de Gestión de Tickets y Agenda Diaria
          </div>
        </div>
      </body>
      </html>
    `;

    try {
      const info = await transporter.sendMail({
        from: getSender(),
        to,
        subject: `[${ticket.id}] Nueva respuesta: ${ticket.title}`,
        html: htmlContent
      });
      return { success: true, messageId: info.messageId };
    } catch (err) {
      console.error('Error enviando correo de respuesta:', err);
      return { success: false, error: err.message };
    }
  },

  // Notify requester when ticket status changes (e.g. resuelto / cerrado / en proceso)
  async sendStatusChangeEmail(ticket, oldStatus, newStatus, comment = '', updatedByName = 'Sistemas', req = null) {
    const to = ticket.requester?.email;
    if (!to || !to.includes('@')) {
      return { skipped: true, reason: 'Sin correo' };
    }

    const transporter = getTransporter();
    if (!transporter) return { skipped: true, reason: 'SMTP no configurado' };

    const statusNames = {
      pendiente: '🟡 PENDIENTE',
      en_proceso: '🔵 EN PROCESO',
      resuelto: '🟢 RESUELTO',
      cerrado: '⚪ CERRADO'
    };

    const baseUrl = getBaseUrl(req);
    const trackingUrl = `${baseUrl}/ticket/${ticket.id}`;
    const newStatusLabel = statusNames[newStatus] || newStatus.toUpperCase();

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden;">
        <div style="background: #1e293b; color: white; padding: 20px; text-align: center;">
          <h3 style="margin: 0;">Actualización de Estado: ${newStatusLabel}</h3>
          <p style="margin: 5px 0 0 0; font-size: 13px; opacity: 0.8;">Ticket: ${ticket.id}</p>
        </div>
        <div style="padding: 20px; color: #334155;">
          <p>Hola <strong>${ticket.requester.name}</strong>,</p>
          <p>Te informamos que tu ticket <strong>"${ticket.title}"</strong> ha cambiado de estado a <strong>${newStatusLabel}</strong>.</p>
          
          ${comment ? `
            <div style="background: #f8fafc; border-left: 4px solid #2563eb; padding: 12px 16px; margin: 15px 0; border-radius: 4px;">
              <strong>Nota del equipo:</strong><br>${comment}
            </div>
          ` : ''}

          <div style="text-align: center; margin: 25px 0;">
            <a href="${trackingUrl}" style="background-color: #2563eb; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold; display: inline-block;">
              Consultar Detalles del Ticket
            </a>
          </div>
        </div>
        <div style="background: #f1f5f9; padding: 12px; text-align: center; font-size: 11px; color: #64748b;">
          Departamento de Sistemas &bull; Agenda de Soporte
        </div>
      </div>
    `;

    try {
      const info = await transporter.sendMail({
        from: getSender(),
        to,
        subject: `[${ticket.id}] Estado actualizado a ${newStatusLabel}: ${ticket.title}`,
        html: htmlContent
      });
      return { success: true, messageId: info.messageId };
    } catch (err) {
      console.error('Error enviando notificación de cambio de estado:', err);
      return { success: false, error: err.message };
    }
  },

  // Confirmation email when ticket is first created
  async sendTicketCreatedEmail(ticket, req = null) {
    const to = ticket.requester?.email;
    if (!to || !to.includes('@')) return { skipped: true };

    const transporter = getTransporter();
    if (!transporter) return { skipped: true };

    const baseUrl = getBaseUrl(req);
    const trackingUrl = `${baseUrl}/ticket/${ticket.id}`;

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden;">
        <div style="background: #2563eb; color: white; padding: 20px; text-align: center;">
          <h2 style="margin: 0; font-size: 20px;">Ticket Registrado Exitosamente</h2>
          <p style="margin: 6px 0 0 0; font-size: 14px;">Código: <strong>${ticket.id}</strong></p>
        </div>
        <div style="padding: 20px; color: #334155;">
          <p>Hola <strong>${ticket.requester.name}</strong>,</p>
          <p>Tu reporte ha sido registrado en la agenda del día del Departamento de Sistemas.</p>
          <p><strong>Asunto:</strong> ${ticket.title}</p>
          <p><strong>Categoría:</strong> ${ticket.category}</p>

          <p style="margin-top: 20px;">Puedes dar seguimiento en tiempo real y consultar cuando haya una respuesta en el siguiente enlace:</p>
          <div style="text-align: center; margin: 25px 0;">
            <a href="${trackingUrl}" style="background-color: #2563eb; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold; display: inline-block;">
              🔍 Dar Seguimiento a mi Ticket
            </a>
          </div>
        </div>
      </div>
    `;

    try {
      await transporter.sendMail({
        from: getSender(),
        to,
        subject: `[${ticket.id}] Confirmación de Ticket Registrado: ${ticket.title}`,
        html: htmlContent
      });
    } catch (err) {
      console.error('Error enviando confirmación de creación:', err);
    }
  }
};

module.exports = mailer;
