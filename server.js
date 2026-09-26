const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');
const mailer = require('./mailer');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Admin authentication middleware
function requireAdmin(req, res, next) {
  const pinHeader = req.headers['x-admin-pin'] || (req.headers.authorization && req.headers.authorization.replace('Bearer ', ''));
  if (!pinHeader || !db.verifyAdminPin(pinHeader)) {
    return res.status(401).json({ error: 'No autorizado. PIN de administrador incorrecto o ausente.' });
  }
  next();
}

// -------------------------------------------------------------
// PUBLIC API ENDPOINTS
// -------------------------------------------------------------

// Get basic public configuration
app.get('/api/config', (req, res) => {
  const config = db.getConfig();
  res.json({
    companyName: config.companyName,
    categories: config.categories
  });
});

// Create new ticket (Public form)
app.post('/api/tickets', (req, res) => {
  try {
    const { title, description, category, priority, requester } = req.body;
    const ticket = db.createTicket({ title, description, category, priority, requester });

    // Asynchronously send confirmation email if email was provided
    mailer.sendTicketCreatedEmail(ticket, req).catch(err => {
      console.warn('No se pudo enviar confirmación por correo:', err.message);
    });

    res.status(201).json({
      success: true,
      ticket: {
        id: ticket.id,
        title: ticket.title,
        status: ticket.status,
        createdAt: ticket.createdAt,
        trackingUrl: `/ticket/${ticket.id}`
      }
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// View ticket for tracking (Public - hides internal admin notes)
app.get('/api/tickets/:id', (req, res) => {
  const ticket = db.getTicketById(req.params.id);
  if (!ticket) {
    return res.status(404).json({ error: 'Ticket no encontrado. Verifica el código ingresado.' });
  }

  // Sanitize: do not send internal notes to public tracking view
  const publicTicket = {
    id: ticket.id,
    title: ticket.title,
    description: ticket.description,
    category: ticket.category,
    priority: ticket.priority,
    status: ticket.status,
    requesterName: ticket.requester.name,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    closedAt: ticket.closedAt,
    history: ticket.history
  };

  res.json(publicTicket);
});

// User adds comment to ticket (Public)
app.post('/api/tickets/:id/comments', (req, res) => {
  try {
    const { message, authorName } = req.body;
    const ticket = db.addComment(req.params.id, {
      author: 'solicitante',
      authorName,
      message
    });
    res.json({ success: true, history: ticket.history });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// ADMIN API ENDPOINTS (Protected by PIN)
// -------------------------------------------------------------

// Admin login / verify PIN
app.post('/api/admin/login', (req, res) => {
  const { pin } = req.body;
  if (!pin || !db.verifyAdminPin(pin)) {
    return res.status(401).json({ error: 'PIN incorrecto. Intenta nuevamente.' });
  }
  res.json({ success: true, message: 'Acceso autorizado al panel de administración.' });
});

// Change admin PIN
app.post('/api/admin/change-pin', requireAdmin, (req, res) => {
  try {
    const { currentPin, newPin } = req.body;
    db.updateAdminPin(currentPin, newPin);
    res.json({ success: true, message: 'PIN actualizado exitosamente.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Daily statistics
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const date = req.query.date; // YYYY-MM-DD
  const stats = db.getDailyStats(date);
  res.json(stats);
});

// Get tickets with date & status filters (Agenda Diaria & Kanban)
app.get('/api/admin/tickets', requireAdmin, (req, res) => {
  const { date, status, search } = req.query;
  const tickets = db.getTickets({ date, status, search });
  res.json(tickets);
});

// Get complete ticket details (including internal notes)
app.get('/api/admin/tickets/:id', requireAdmin, (req, res) => {
  const ticket = db.getTicketById(req.params.id);
  if (!ticket) {
    return res.status(404).json({ error: 'Ticket no encontrado.' });
  }
  res.json(ticket);
});

// Update ticket status
app.patch('/api/admin/tickets/:id/status', requireAdmin, async (req, res) => {
  try {
    const { status, comment, adminName } = req.body;
    const oldTicket = db.getTicketById(req.params.id);
    const oldStatus = oldTicket ? oldTicket.status : '';

    const ticket = db.updateTicketStatus(req.params.id, status, comment, adminName || 'Departamento de Sistemas');

    // Notify requester via email of status change
    mailer.sendStatusChangeEmail(ticket, oldStatus, status, comment, adminName || 'Departamento de Sistemas', req).catch(err => {
      console.warn('Error al enviar notificación de cambio de estado por correo:', err.message);
    });

    res.json({ success: true, ticket });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin posts public response/message (Sends email to requester!)
app.post('/api/admin/tickets/:id/comments', requireAdmin, async (req, res) => {
  try {
    const { message, adminName } = req.body;
    const ticket = db.addComment(req.params.id, {
      author: 'admin',
      authorName: adminName || 'Departamento de Sistemas',
      message
    });

    // Send email notification with the response directly to requester's email
    mailer.sendAdminReplyEmail(ticket, message, adminName || 'Departamento de Sistemas', req).catch(err => {
      console.warn('Error al enviar respuesta por correo al solicitante:', err.message);
    });

    res.json({ success: true, ticket });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin adds internal private note
app.post('/api/admin/tickets/:id/notes', requireAdmin, (req, res) => {
  try {
    const { note, adminName } = req.body;
    const ticket = db.addInternalNote(req.params.id, note, adminName || 'Departamento de Sistemas');
    res.json({ success: true, ticket });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get current SMTP Configuration (masked password)
app.get('/api/admin/smtp', requireAdmin, (req, res) => {
  const config = db.getConfig();
  const smtp = config.smtp || {};
  res.json({
    host: smtp.host || process.env.SMTP_HOST || '',
    port: smtp.port || process.env.SMTP_PORT || 587,
    user: smtp.user || process.env.SMTP_USER || '',
    fromName: smtp.fromName || process.env.SMTP_FROM_NAME || 'Departamento de Sistemas',
    fromEmail: smtp.fromEmail || process.env.SMTP_FROM_EMAIL || '',
    hasPass: !!(smtp.pass || process.env.SMTP_PASS),
    publicBaseUrl: config.publicBaseUrl || process.env.PUBLIC_BASE_URL || ''
  });
});

// Update SMTP Configuration
app.post('/api/admin/smtp', requireAdmin, (req, res) => {
  try {
    const { host, port, user, pass, fromName, fromEmail, publicBaseUrl } = req.body;
    const current = db.getConfig();
    const existingSmtp = current.smtp || {};

    const updatedSmtp = {
      host: (host || '').trim(),
      port: Number(port) || 587,
      user: (user || '').trim(),
      pass: pass ? pass.trim() : existingSmtp.pass || '',
      fromName: (fromName || 'Departamento de Sistemas').trim(),
      fromEmail: (fromEmail || user || '').trim()
    };

    db.updateConfig({
      smtp: updatedSmtp,
      publicBaseUrl: (publicBaseUrl || '').trim()
    });

    res.json({ success: true, message: 'Configuración de correo guardada exitosamente.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Test SMTP Configuration
app.post('/api/admin/smtp/test', requireAdmin, async (req, res) => {
  try {
    const { testEmail } = req.body;
    if (!testEmail || !testEmail.includes('@')) {
      return res.status(400).json({ error: 'Ingresa un correo electrónico válido para la prueba.' });
    }
    await mailer.sendTestEmail(testEmail.trim());
    res.json({ success: true, message: `Correo de prueba enviado exitosamente a ${testEmail}.` });
  } catch (err) {
    res.status(400).json({ error: 'Fallo al enviar correo: ' + err.message });
  }
});

// Export reports as CSV
app.get('/api/admin/export', requireAdmin, (req, res) => {
  const { date, status } = req.query;
  const tickets = db.getTickets({ date, status });

  const headers = ['ID', 'Fecha Creacion', 'Titulo', 'Categoria', 'Prioridad', 'Estado', 'Solicitante', 'Email', 'Telefono', 'Fecha Cierre'];
  const rows = tickets.map(t => [
    `"${t.id}"`,
    `"${new Date(t.createdAt).toLocaleString('es-ES')}"`,
    `"${t.title.replace(/"/g, '""')}"`,
    `"${t.category}"`,
    `"${t.priority}"`,
    `"${t.status}"`,
    `"${t.requester.name.replace(/"/g, '""')}"`,
    `"${(t.requester.email || '').replace(/"/g, '""')}"`,
    `"${(t.requester.phone || '').replace(/"/g, '""')}"`,
    `"${t.closedAt ? new Date(t.closedAt).toLocaleString('es-ES') : ''}"`
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  const filename = `reporte_tickets_${date || 'completo'}.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csvContent);
});

// -------------------------------------------------------------
// FRONTEND ROUTE HANDLERS
// -------------------------------------------------------------
app.get('/ticket/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'ticket.html'));
});

app.get('/seguimiento', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'seguimiento.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`=======================================================`);
  console.log(`🚀 Sistema de Agenda Diaria y Tickets activo`);
  console.log(`🌍 Escuchando en todas las redes: http://${HOST}:${PORT}`);
  console.log(`🔗 Portal Público: /`);
  console.log(`🔍 Seguimiento:   /seguimiento`);
  console.log(`📅 Panel Admin:   /admin`);
  console.log(`=======================================================`);
});
